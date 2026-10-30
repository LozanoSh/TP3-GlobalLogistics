param(
  [ValidateSet('referencia', 'moderado', 'extremo')][string]$Escenario = 'moderado',
  [int]$Vus = 100,
  [int]$Work = 100,
  [string]$Duracion = '45s',
  [string]$BaseUrl = 'http://localhost:8080'
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$K6 = (Get-Command k6 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $K6 -and (Test-Path 'C:\Program Files\k6\k6.exe')) { $K6 = 'C:\Program Files\k6\k6.exe' }
if (-not $K6) { throw 'No se encontro k6. Instalar Grafana k6 y verificar k6 version.' }
$Results = Join-Path $Root 'tests/results'
New-Item -ItemType Directory -Force -Path $Results | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$RunDir = Join-Path $Results "${Stamp}_${Escenario}_${Vus}vus_work${Work}"
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
$ExistingServer = docker info --format '{{.ServerVersion}}' 2>$null
if (-not $ExistingServer) {
  @{ fecha = (Get-Date).ToString('o'); escenario=$Escenario; vus=$Vus; work=$Work; estado='bloqueado'; motivo='Docker Engine no responde'; commit=(& git -C $Root rev-parse HEAD).Trim() } | ConvertTo-Json | Set-Content (Join-Path $RunDir 'blocked.json') -Encoding utf8
  throw "Docker Engine no responde. Se guardo el bloqueo en $RunDir; no se lanzo k6."
}
try { $HealthProbe = Invoke-WebRequest -Uri "$BaseUrl/nginx-health" -TimeoutSec 5 }
catch {
  @{ fecha = (Get-Date).ToString('o'); escenario=$Escenario; vus=$Vus; work=$Work; estado='bloqueado'; motivo='Nginx no responde en /nginx-health'; detalle=$_.Exception.Message; commit=(& git -C $Root rev-parse HEAD).Trim() } | ConvertTo-Json | Set-Content (Join-Path $RunDir 'blocked.json') -Encoding utf8
  throw "Nginx no responde en $BaseUrl/nginx-health. Se guardo el bloqueo en $RunDir; no se lanzo k6."
}
if ($HealthProbe.StatusCode -ne 200) { throw "Nginx no esta healthy en $BaseUrl/nginx-health" }
$Script = switch ($Escenario) {
  'referencia' { 'k6_escenario_referencia.js' }
  'moderado' { 'k6_escenario_moderado.js' }
  'extremo' { 'k6_escenario_extremo.js' }
}
@{
  fecha_inicio = (Get-Date).ToString('o'); escenario = $Escenario; vus = $Vus
  work = if ($Escenario -eq 'extremo') { $Work } else { $null }
  duracion = $Duracion; base_url = $BaseUrl; equipo = (Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, NumberOfLogicalProcessors, TotalPhysicalMemory)
  docker_version = (& docker version --format '{{.Server.Version}}' 2>&1 | Out-String).Trim()
  commit = (& git -C $Root rev-parse HEAD).Trim()
} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $RunDir 'metadata.json') -Encoding utf8

$StatsPath = Join-Path $RunDir 'docker_stats.csv'
$HealthPath = Join-Path $RunDir 'health.csv'
$InstancesPath = Join-Path $RunDir 'instances.csv'
$StatsJob = Start-Job -ArgumentList $StatsPath -ScriptBlock {
  param($Path)
  'timestamp,container,cpu_percent,memory_usage,memory_percent,net_io,block_io,pids' | Set-Content $Path
  while ($true) {
    $ts = (Get-Date).ToString('o')
    $lines = docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}' 2>$null
    foreach ($line in $lines) { "$ts,$line" | Add-Content $Path }
    Start-Sleep -Seconds 1
  }
}
$HealthJob = Start-Job -ArgumentList $HealthPath, $BaseUrl -ScriptBlock {
  param($Path, $Url)
  'timestamp,route,http_status,elapsed_ms' | Set-Content $Path
  while ($true) {
    $ts = (Get-Date).ToString('o')
    foreach ($route in @('/health', '/nginx-health')) {
      $sw = [Diagnostics.Stopwatch]::StartNew()
      try { $r = Invoke-WebRequest -Uri ($Url + $route) -TimeoutSec 4; $status = [int]$r.StatusCode }
      catch { $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
      $sw.Stop()
      "$ts,$route,$status,$([math]::Round($sw.Elapsed.TotalMilliseconds,2))" | Add-Content $Path
    }
    Start-Sleep -Seconds 1
  }
}
$InstancesJob = Start-Job -ArgumentList $InstancesPath, $BaseUrl -ScriptBlock {
  param($Path, $Url)
  'timestamp,endpoint,http_status,instance,valid' | Set-Content $Path
  while ($true) {
    $ts = (Get-Date).ToString('o')
    # Always observe replica identity through a lightweight endpoint. Never
    # send extra /api/cpu requests from the collector during the load test.
    $route = '/api/instancia'
    try {
      $r = Invoke-WebRequest -Uri ($Url + $route) -TimeoutSec 40
      $body = $r.Content | ConvertFrom-Json
      $instance = $body.instancia
      $valid = $instance -in @('api1','api2','api3')
      "$ts,$route,$([int]$r.StatusCode),$instance,$valid" | Add-Content $Path
    } catch { "$ts,$route,0,unknown,false" | Add-Content $Path }
    Start-Sleep -Milliseconds 500
  }
}
try {
  $env:BASE_URL = $BaseUrl
  $env:VUS = [string]$Vus
  $env:DURATION = $Duracion
  $env:WORK = [string]$Work
  $K6Out = Join-Path $RunDir 'k6_summary.json'
  $K6Log = Join-Path $RunDir 'k6_console.txt'
  & $K6 run --out "json=$(Join-Path $RunDir 'k6_metrics.json')" --summary-export $K6Out (Join-Path $PSScriptRoot $Script) 2>&1 | Tee-Object -FilePath $K6Log
  $K6Exit = $LASTEXITCODE
} finally {
  Stop-Job $StatsJob, $HealthJob, $InstancesJob -ErrorAction SilentlyContinue
  Receive-Job $StatsJob, $HealthJob, $InstancesJob -ErrorAction SilentlyContinue | Out-Null
  Remove-Job $StatsJob, $HealthJob, $InstancesJob -Force -ErrorAction SilentlyContinue
}
@{ fecha_fin = (Get-Date).ToString('o'); exit_code_k6 = $K6Exit; resultado = if ($K6Exit -eq 0) { 'completado' } else { 'fallido' } } | ConvertTo-Json | Set-Content (Join-Path $RunDir 'final.json') -Encoding utf8
Write-Host "Resultados: $RunDir"
exit $K6Exit
