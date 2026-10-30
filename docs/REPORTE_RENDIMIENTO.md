# Reporte de rendimiento — etapa Rivamar

**TP3 GlobalLogistics · Universidad Champagnat · 2026**  
Repositorio: https://github.com/LozanoSh/TP3-GlobalLogistics  
Estado del reporte: scripts preparados; pruebas distribuidas pendientes por indisponibilidad del daemon Docker en el equipo de ejecución.

## Objetivo y alcance

Evaluar por la entrada Nginx el comportamiento de las tres réplicas fijas con dos cargas: validación de solicitudes de Gestión de Envíos y cálculo sintético intensivo de CPU. Se buscan latencias promedio, p95, p99, máxima, throughput, errores, distribución de réplicas y consumo de CPU/memoria.

`POST /envios/validar` comprueba el contrato y responde un resumen; no persiste ni crea envíos. Por eso las mediciones no prueban la operación completa `POST /envios/crear` del TP2 ni su autenticación, idempotencia, transacción o outbox.

## Arquitectura

Un Nginx publicado en `localhost:8080` distribuye tráfico round-robin a `api1`, `api2` y `api3`. Compose define cuatro servicios principales. Cada API ejecuta un proceso Node.js/Express en un contenedor. Las réplicas son fijas: no hay autoescalado. Nginx es un punto único de entrada y una falla de ese proceso afecta el acceso a todas las APIs.

## Herramienta y metodología reproducible

Se preparó k6. `tests/k6_escenario_referencia.js` usa 5 VU durante 30 s; `tests/k6_escenario_moderado.js` sube a 100 VU y los mantiene 45 s; `tests/k6_escenario_extremo.js` genera solicitudes a `/api/cpu?work=N`. La escalera predeterminada usa 10, 25, 50, 100 y 200 VU con `work=100` constante, 30 s por nivel y pausas entre escalones. El runner PowerShell guarda salida k6, métricas crudas, resumen JSON, datos de CPU/memoria de `docker stats`, probes de salud cada segundo y metadatos en `tests/results/`.

Para mantener comparabilidad, el valor de `work` se mantiene constante dentro de cada escalera. Si se ejecuta otra escalera con `work=500`, se analiza como serie separada. La carga se detiene o no se escala más si aparecen fallos persistentes, memoria crítica o réplicas unhealthy. Los objetivos temporales (p95 ≤ 250 ms, p99 ≤ 500 ms, máximo ≤ 1000 ms) son referencias de diseño del alta completa del TP2; no constituyen SLA demostrado por este validador.

## Entorno y resultados disponibles

| Comprobación | Resultado verificable en esta sesión |
|---|---|
| Rama | `rivamar`, fast-forward local desde `origin/lozano` hasta `82ec6b4` |
| Windows | Windows x64; CPU y RAM exactas se guardan automáticamente por ejecución en `metadata.json` |
| Node.js / npm | Node v24.15.0, npm 11.12.1 |
| Docker CLI / Compose | Docker 29.7.2, Compose v5.4.0 |
| `docker compose config -q` | Correcto; cuatro servicios declarados |
| Docker Engine | No accesible: falta la pipe `dockerDesktopLinuxEngine` |
| k6 | No estaba instalado al momento de preparar el reporte |
| Pruebas unitarias | 28/28 aprobadas tras `npm ci` |
| Despliegue, balanceo y POST por Nginx | No ejecutados en esta sesión porque el daemon no responde |
| Cargas k6 y `docker stats` | No ejecutadas; no hay métricas de carga nuevas |

No se atribuye resultado de rendimiento a capturas o registros anteriores de Siccardi: corresponden a otra etapa y a la API previa.

## Resultados de carga

Pendientes de ejecución real. Las tablas se completarán desde los archivos `k6_summary.json` y `docker_stats.csv` de `tests/results/`; no se incluyen valores inventados.

| Escenario | VU | work | Requests | RPS | Promedio | p95 | p99 | Máxima | Error % | CPU / salud |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Referencia | 5 | n/a | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| Moderado | 100 | n/a | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| CPU, escalones | 10–200 | 100 | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

Gráficos requeridos (promedio/p95/p99 y concurrencia, throughput, CPU por réplica, errores/timeouts) se generarán una vez que haya datos fuente reales. No se crean gráficos vacíos o ilustrativos que puedan confundirse con evidencia.

## Criterio para identificar degradación

Para cada serie homogénea de endpoint y `work`, se considerará inicio de degradación el primer escalón cuya p95 sea al menos 2 veces la p95 de referencia y, además, ocurra al menos una de estas condiciones: p99 también duplica la referencia, errores/timeouts superan 1%, o el throughput deja de aumentar pese al incremento de VU. Se reportarán por separado salud, CPU y cambios en latencia máxima. Si el último escalón probado no satisface esos criterios, se informará como límite verificado, sin extrapolar una saturación no observada.

## Análisis arquitectónico que debe completarse con mediciones

El cálculo `/api/cpu` ejecuta trabajo síncrono en el event loop de Node. Una solicitud intensa puede bloquear solicitudes posteriores en esa réplica, incluido `/health`. Nginx tiene detección pasiva de fallos; para `/api/cpu` no reintenta timeouts y para `POST /envios/validar` no reintenta el POST. Debe analizarse con las series reales qué réplicas atendieron solicitudes, si los probes se demoraron, si Compose las marcó unhealthy y si Nginx registró 502/503/504.

Tres réplicas no garantizan latencia constante: comparten la CPU y memoria disponibles y cada instancia tiene un event loop de un hilo. Tampoco equivalen a autoescalado: no hay controlador que cree instancias adicionales. Nginx único limita la disponibilidad de la entrada. En producción se evaluarían límites y reservas de recursos, worker threads o cola de trabajo para CPU, probes no bloqueantes, escalado con métricas, redundancia de entrada, observabilidad y persistencia transaccional para el alta real.

## Restricciones temporales y conclusión

Todavía no hay latencia máxima de carga observada, por lo que no se puede afirmar si cumple 1000 ms ni dónde comienza la degradación. Los valores p95/p99/max del futuro reporte medirán validación o CPU sintética a través de Nginx; no demostrarán cumplimiento del flujo persistente del TP2. Completar esta conclusión requiere activar Docker Desktop, instalar k6, ejecutar los escenarios y conservar sus resultados.

## Archivos de evidencia

- Scripts: [`tests/k6_escenario_referencia.js`](../tests/k6_escenario_referencia.js), [`tests/k6_escenario_moderado.js`](../tests/k6_escenario_moderado.js), [`tests/k6_escenario_extremo.js`](../tests/k6_escenario_extremo.js).
- Recolección: [`tests/run_stress.ps1`](../tests/run_stress.ps1), [`tests/run_extreme_ladder.ps1`](../tests/run_extreme_ladder.ps1).
- Pruebas unitarias y estado Docker de esta sesión: [`evidencias/validacion_rivamar_local.txt`](../evidencias/validacion_rivamar_local.txt).
- Resultados de carga: `tests/results/` (sin ejecuciones nuevas en esta sesión).
