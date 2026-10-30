# Entrega de Rivamar — pruebas de rendimiento

## Trabajo realizado

- Escenarios k6 de referencia, validación con 100 VU y CPU con `work=100` a 1, 10 y 25 VU.
- Recolección de resumen y puntos k6, CPU/memoria Docker, salud, identidad de réplica y metadata por corrida.
- Cinco gráficos construidos desde los datos medidos.
- README, reporte de rendimiento y borrador integral actualizados con resultados y límites del prototipo.

## Archivos principales

- Scripts: `tests/k6_common.js`, `tests/k6_escenario_referencia.js`, `tests/k6_escenario_moderado.js`, `tests/k6_escenario_extremo.js`, `tests/run_stress.ps1`, `tests/run_extreme_ladder.ps1`, `tests/graficar_resultados.py`.
- Reportes: `docs/REPORTE_RENDIMIENTO.md`, `docs/INFORME_TP3_BORRADOR.md`, este traspaso.
- Figuras: `evidencias/rendimiento_latencia.png`, `rendimiento_throughput.png`, `rendimiento_cpu_replicas.png`, `rendimiento_errores.png`, `rendimiento_distribucion_replicas.png`.
- Capturas actuales de contenedores, validación, pruebas unitarias, referencia y cada escalón CPU en `evidencias/captura_*.png`.
- Fuentes crudas y auxiliares: carpetas seleccionadas `tests/results/20261030_*` listadas en el reporte.
- Tabla fuente consolidada: `tests/results/resumen_escenarios.csv`; puntos k6 comprimidos como `k6_metrics.json.gz` para publicación.

## Reproducción

Con Docker Engine arriba y el entorno iniciado:

```powershell
docker compose up -d --build
docker compose ps
node tests/validacion_envios.js
./tests/run_stress.ps1 -Escenario referencia -Vus 5 -Duracion 30s
./tests/run_stress.ps1 -Escenario moderado -Vus 100 -Duracion 45s
./tests/run_stress.ps1 -Escenario extremo -Vus 1 -Work 100 -Duracion 30s
./tests/run_stress.ps1 -Escenario extremo -Vus 10 -Work 100 -Duracion 30s
./tests/run_stress.ps1 -Escenario extremo -Vus 25 -Work 100 -Duracion 30s
```

La corrida se detuvo en 25 VU por latencias de hasta 11,62 s y dos timeouts de salud. No se recomienda ejecutar niveles mayores en este equipo sin un objetivo experimental adicional y recuperación observada.

Para regenerar las figuras:

```powershell
python -m pip install -r tests/requirements-graficos.txt
python tests/graficar_resultados.py --runs 20261030_195150_referencia_5vus_work100 20261030_201228_moderado_100vus_work100 20261030_202522_extremo_1vus_work100 20261030_201849_extremo_10vus_work100 20261030_202917_extremo_25vus_work100
```

## Resultados principales

- Validación a 100 VU: 51.807 requests, 796,02 req/s, promedio 5,64 ms, p95 13,64 ms, p99 32,98 ms, máximo 131,09 ms y 0 % de errores HTTP.
- CPU `work=100`: a 1 VU p95 255 ms; a 10 VU p95 2,79 s y máximo 6,47 s; a 25 VU p95 6,50 s y máximo 11,62 s.
- En las muestras de CPU, las tres APIs alcanzaron picos aproximados de 100–104 %; `/health` demoró hasta 4,03 s y tuvo 2 fallos de 15 muestras a 25 VU.
- Después de la última corrida, Docker mostró los cuatro servicios healthy.

La degradación se identifica desde 10 VU para `/api/cpu?work=100`; el análisis y las tablas completas están en `docs/REPORTE_RENDIMIENTO.md`.

## Pruebas funcionales y estado

- `npm ci` y `npm test`: 28/28 pruebas aprobadas.
- `docker compose config -q`: correcto; cuatro servicios declarados.
- El usuario ejecutó `docker compose up -d --build`, `docker compose ps` y `node tests/validacion_envios.js`; las cuatro instancias estaban healthy y el script terminó `VALIDACION ENVIOS OK`.
- k6 2.3.0: los escenarios pasaron `k6 inspect` y las cinco corridas listadas finalizaron con código 0.
- El runner usa `-UseBasicParsing` para que Windows PowerShell no solicite confirmación interactiva al sondear salud.

## Instrucciones para Lozano

1. Revisar el reporte y sus fuentes comprimidas/CSV seleccionadas.
2. Abrir las figuras y verificar su legibilidad al incorporarlas al informe final.
3. Convertir `docs/INFORME_TP3_BORRADOR.md` a PDF y completar portada/formato institucional.
4. Integrar `rivamar` a `main` solo después de la revisión del equipo.

La API implementa validación, no creación persistente. No afirmar base de datos, autenticación, idempotencia, outbox ni autoescalado. No se observaron errores HTTP de las cargas, pero sí degradación de latencia y timeouts de salud.
