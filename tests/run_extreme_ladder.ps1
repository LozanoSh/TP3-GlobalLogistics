param([int[]]$Escalones = @(10,25,50,100,200), [int]$Work = 100, [string]$Duracion = '30s', [string]$BaseUrl = 'http://localhost:8080')
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LadderDir = Join-Path (Join-Path $Root 'tests/results') ("{0}_escalera_work{1}" -f (Get-Date -Format 'yyyyMMdd_HHmmss'), $Work)
New-Item -ItemType Directory -Force -Path $LadderDir | Out-Null
$Rows = [System.Collections.Generic.List[object]]::new()
foreach ($vus in $Escalones) {
  Write-Host "Escalon: $vus VU, work=$Work, duracion=$Duracion"
  & (Join-Path $PSScriptRoot 'run_stress.ps1') -Escenario extremo -Vus $vus -Work $Work -Duracion $Duracion -BaseUrl $BaseUrl
  $code = $LASTEXITCODE
  $latest = Get-ChildItem (Join-Path $Root 'tests/results') -Directory | Where-Object { $_.Name -Match '_extremo_' -and $_.Name -Match "_${vus}vus_" } | Sort-Object Name -Descending | Select-Object -First 1
  if ($latest) {
    Move-Item -LiteralPath $latest.FullName -Destination (Join-Path $LadderDir $latest.Name)
    $summaryPath = Join-Path (Join-Path $LadderDir $latest.Name) 'k6_summary.json'
    $runDirectory = $latest.Name
  } else { $summaryPath = ''; $runDirectory = '' }
  $Rows.Add([pscustomobject]@{vus=$vus;work=$Work;duration=$Duracion;k6_exit_code=$code;summary_file=$summaryPath;run_directory=$runDirectory})
  $Rows | Export-Csv (Join-Path $LadderDir 'ladder.csv') -NoTypeInformation -Encoding utf8
  if ($code -ne 0) { Write-Warning "Escalon fallido con codigo $code; se detiene la escalera para evitar continuar sin control."; break }
  Start-Sleep -Seconds 10
}
Write-Host "Escalera guardada en $LadderDir"
