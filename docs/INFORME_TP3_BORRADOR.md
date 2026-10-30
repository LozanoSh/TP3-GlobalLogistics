# Trabajo Práctico N.º 3 — Despliegue de Arquitectura Cloud-Native

## GlobalLogistics — Gestión de Envíos

**Universidad Champagnat · Arquitectura de Sistemas · 2026**  
**Repositorio:** https://github.com/LozanoSh/TP3-GlobalLogistics  
**Equipo:** Lozano, Siccardi y Rivamar  
**Estado:** borrador técnico con mediciones reales; Lozano debe completar formato y PDF final.

## Resumen

El TP3 despliega un prototipo de Gestión de Envíos con un balanceador Nginx y tres réplicas Node.js/Express bajo Docker Compose. `POST /envios/validar` valida un envío y devuelve un resumen; no crea ni persiste el envío. Se verifican la topología, el reparto por réplica, la salud y el rendimiento bajo concurrencia y cálculo intensivo de CPU.

## 1. Infraestructura como código

Compose define exactamente cuatro servicios: `nginx`, `api1`, `api2` y `api3`. Nginx publica `localhost:8080`; las tres APIs permanecen en la red interna. La configuración pasó `docker compose config -q`. En la ejecución observada por el usuario, `docker compose ps` mostró los cuatro contenedores healthy y el único puerto publicado fue el 8080 de Nginx. La evidencia funcional está en `evidencias/validacion_rivamar_local.txt` y las capturas nuevas conservadas por el equipo.

## 2. API, balanceo y salud

`POST /envios/validar` acepta el contrato en memoria y responde `200` para datos válidos, `400` para entradas inválidas. `GET /api/instancia` identifica la réplica y el contenedor; `GET /health` y `/nginx-health` informan salud; `/api/cpu?work=N` genera cálculo real. Nginx balancea round-robin y aplica detección pasiva.

El usuario ejecutó `node tests/validacion_envios.js`: nueve solicitudes válidas recorrieron api1, api2 y api3; cinco casos inválidos dieron 400; `/health`, `/api/instancia` y `/api/cpu?work=1` respondieron 200. Resultado: `VALIDACION ENVIOS OK`. También se aprobaron 28/28 pruebas unitarias con `npm test`.

## 3. Pruebas de rendimiento

k6 2.3.0 midió la carga local a través de Nginx. La máquina fue una Lenovo modelo 82KT con 16 procesadores lógicos y 10.592.444.416 bytes de RAM física; Docker Engine 29.7.2 y Compose 5.4.0.

| Escenario | Endpoint | VU | Requests | req/s | Promedio | p95 | p99 | Máxima | Errores k6 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Referencia | `POST /envios/validar` | 5 | 1.425 | 47,34 | 4,45 ms | 6,40 ms | 10,01 ms | 33,36 ms | 0 % |
| Moderado | `POST /envios/validar` | 100 | 51.807 | 796,02 | 5,64 ms | 13,64 ms | 32,98 ms | 131,09 ms | 0 % |
| CPU | `GET /api/cpu?work=100` | 1 | 174 | 5,79 | 171,98 ms | 255 ms | 273,42 ms | 288,42 ms | 0 % |
| CPU | `GET /api/cpu?work=100` | 10 | 438 | 13,78 | 704,30 ms | 2.792,49 ms | 3.363,93 ms | 6.470,15 ms | 0 % |
| CPU | `GET /api/cpu?work=100` | 25 | 553 | 16,51 | 1.421,45 ms | 6.499,47 ms | 10.084,81 ms | 11.621,87 ms | 0 % |

Las series de POST y CPU no se comparan como si fueran una misma operación. Para la serie CPU, la degradación clara comienza a 10 VU: p95 es 10,95 veces el de 1 VU y p99 12,30 veces mayor. A 25 VU, el throughput aumenta a 16,51 req/s, pero p95 es 6,50 s, p99 10,08 s y la máxima 11,62 s. Las cargas k6 tuvieron cero errores HTTP.

CPU por réplica se aproximó a 100–104 % de pico en los niveles de 10 y 25 VU. A 25 VU, 2 de 15 probes `/health` agotaron el timeout de 4 s; la demora máxima fue 4.034 ms. Luego los cuatro servicios volvieron a healthy. La prueba se detuvo en 25 VU ante esta evidencia; no se extrapolan niveles superiores.

### Figuras generadas desde los resultados

![Latencia por endpoint](../evidencias/rendimiento_latencia.png)

![Throughput por endpoint](../evidencias/rendimiento_throughput.png)

![CPU por réplica](../evidencias/rendimiento_cpu_replicas.png)

![Errores y timeouts](../evidencias/rendimiento_errores.png)

![Distribución por réplica](../evidencias/rendimiento_distribucion_replicas.png)

## 4. Análisis crítico y límites

El endpoint `/api/cpu` hace el cálculo síncronamente en el event loop principal de Node.js. Bajo carga, otras solicitudes asignadas a esa réplica esperan, incluidos los health checks. Nginx continuó entregando HTTP 200 para las solicitudes CPU medidas, mientras los probes de salud se demoraban y finalmente agotaban su timeout. Tres réplicas fijas distribuyen trabajo, pero no crean recursos nuevos ni mantienen latencia constante si todas compiten por CPU. No existe autoescalado. Nginx es un único punto de entrada.

Como mejoras de producción se evaluarían worker threads o una cola para tareas CPU, límites y reservas de CPU/memoria, health checks que no compartan el event loop bloqueado, balanceador redundante, métricas/alertas y escalado automatizado. El alta completa del TP2 exige persistencia transaccional y controles que no están implementados aquí.

La referencia temporal TP2 (p95 ≤ 250 ms, p99 ≤ 500 ms, máximo ≤ 1.000 ms) corresponde a `POST /envios/crear`. La máxima del moderado fue 131,09 ms, mientras que `/api/cpu` superó 1.000 ms desde 10 VU. Esos resultados describen validación en memoria y carga sintética: no demuestran el SLA de creación persistente.

## Evidencias y reproducción

- Validación funcional y unitarias: salidas en `evidencias/` y capturas de la ejecución actual.
- Resultados y datos fuente: carpetas `tests/results/20261030_195150_*`, `20261030_201228_*`, `20261030_202522_*`, `20261030_201849_*` y `20261030_202917_*`.
- Resumen tabular reproducible: `tests/results/resumen_escenarios.csv`; puntos de k6 conservados comprimidos en `k6_metrics.json.gz`.
- Reporte con tablas ampliadas y metodología: `docs/REPORTE_RENDIMIENTO.md`.
- Comandos reproducibles: `README.md` y `docs/ENTREGA_RIVAMAR.md`.

El borrador no atribuye autenticación, persistencia, idempotencia, outbox ni autoescalado al prototipo.
