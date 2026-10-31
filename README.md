# TP3 GlobalLogistics - Gestión de Envíos

Trabajo Práctico 3 de Arquitectura de Sistemas (Universidad Champagnat). Despliega un prototipo REST de Gestión de Envíos: `POST /envios/validar` comprueba una solicitud en memoria; no crea ni persiste envíos.

## Arquitectura y requisitos

Docker Compose levanta un Nginx (`localhost:8080`) que reparte solicitudes entre tres réplicas Node.js 22/Express (`api1`, `api2`, `api3`) construidas desde la misma imagen. Las APIs sólo están en la red interna. Se requieren Docker Engine con Compose v2 y, para las comprobaciones locales, Node.js 22 o superior. Las pruebas de carga requieren k6 y PowerShell; la regeneración de gráficos requiere Python y `tests/requirements-graficos.txt`.

## Levantar y comprobar

Desde la raíz del repositorio:

```powershell
docker compose config -q
docker compose up -d --build
docker compose ps
node tests/validacion_envios.js
```

`docker compose ps` debe mostrar cuatro contenedores `healthy`. La validación comprueba `POST /envios/validar`, `/health`, `/api/instancia`, `/api/cpu` y respuestas de las tres réplicas. Para observar el reparto y la salud manualmente:

```powershell
1..9 | ForEach-Object { (Invoke-RestMethod http://localhost:8080/api/instancia).instancia }
Invoke-RestMethod http://localhost:8080/health
Invoke-RestMethod http://localhost:8080/nginx-health
docker compose ps
```

Pruebas unitarias del servicio:

```powershell
cd service
npm ci
npm test
cd ..
```

## Reproducir las cargas

Con los cuatro contenedores saludables, ejecutar desde la raíz:

```powershell
./tests/run_stress.ps1 -Escenario moderado -Vus 100 -Duracion 45s
./tests/run_stress.ps1 -Escenario extremo -Vus 1 -Work 100 -Duracion 30s
./tests/run_stress.ps1 -Escenario extremo -Vus 10 -Work 100 -Duracion 30s
./tests/run_stress.ps1 -Escenario extremo -Vus 25 -Work 100 -Duracion 30s
```

El escenario extremo compara escalones de CPU con el mismo trabajo; la corrida registrada se detuvo en 25 VU por degradación de latencia y timeouts de salud. Los resultados nuevos se guardan en `tests/results/`. Los datos originales y resúmenes utilizados para el informe están allí; gráficos y capturas están en `evidencias/`. El informe final está en `docs/INFORME_TP3_FINAL.pdf` y el detalle numérico en `docs/REPORTE_RENDIMIENTO.md`.

Integrantes: Lozano (infraestructura e integración), Siccardi (API, Nginx y salud) y Rivamar (pruebas de rendimiento y análisis).
