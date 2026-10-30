# Trabajo Práctico N.º 3 — Despliegue de Arquitectura Cloud-Native

## GlobalLogistics — Gestión de Envíos

**Universidad Champagnat · Arquitectura de Sistemas · 2026**  
**Repositorio:** https://github.com/LozanoSh/TP3-GlobalLogistics  
**Equipo:** Lozano, Siccardi y Rivamar  
**Estado:** borrador técnico; falta ejecutar pruebas distribuidas y completar resultados.

## Resumen

El TP3 despliega un prototipo de Gestión de Envíos formado por una entrada Nginx y tres réplicas Node.js/Express definidas en Docker Compose. La API valida solicitudes de envío internacional y ofrece endpoints técnicos para observar identidad, salud y consumo de CPU. La validación de `/envios/validar` no registra un envío.

## 1. Infraestructura como código

Compose define cuatro servicios principales: `nginx`, `api1`, `api2` y `api3`. Nginx publica el puerto 8080; las APIs permanecen en la red interna. La topología, health checks y configuración se describen en `docker-compose.yml` y `nginx/nginx.conf`. La validación de configuración pasó (`docker compose config -q`). En la sesión de Rivamar el daemon Docker no estuvo disponible, así que no se pudo verificar un despliegue actual de los cuatro contenedores.

## 2. API, balanceo y salud

`POST /envios/validar` valida el contrato y devuelve la réplica que atendió. `GET /api/instancia` expone hostname e ID de contenedor; `GET /health` evalúa la API; `/nginx-health` evalúa Nginx; `/api/cpu?work=N` permite carga computacional. Nginx usa round-robin y detección pasiva. El script `tests/validacion_envios.js` comprueba el POST, errores de validación, endpoints técnicos y distribución por las tres réplicas cuando el entorno está disponible.

`npm ci` y `npm test` se ejecutaron en esta sesión: 28 pruebas locales aprobaron. La prueba de integración por Nginx no pudo ejecutarse porque Docker Desktop no respondió. Las capturas históricas existentes pertenecen a una etapa anterior; no se presentan como evidencia de esta integración.

## 3. Pruebas de estrés

Se prepararon scripts k6 para referencia, 100 VU sobre la validación y escalones de CPU. Cada ejecución debe conservar solicitudes totales, throughput, promedio, mediana, p95, p99, máximo, errores, réplica y checks. El runner guarda métricas crudas y muestrea CPU/memoria y salud. Los comandos exactos están en README y `docs/ENTREGA_RIVAMAR.md`.

| Escenario | Estado / conclusión |
|---|---|
| Referencia 5 VU | Pendiente: daemon/k6 no disponibles durante la sesión. |
| Moderado 100 VU | Pendiente; sin latencias observadas. |
| CPU, work=100, escalera | Pendiente; no hay CPU o estados health medidos bajo carga. |

No hay datos fuente nuevos, por lo cual no se dibujan gráficos simulados. Tras la ejecución deberán agregarse las figuras de latencia por concurrencia, throughput, CPU por réplica y errores/timeouts, usando `tests/results/` como fuente.

## 4. Análisis y límites

No se puede afirmar un punto de degradación ni cumplimiento de una latencia máxima sin medición real. El reporte adopta como criterio inicial de degradación una duplicación de p95 frente a referencia junto con duplicación de p99, errores superiores a 1% o throughput que deje de crecer.

El cálculo de CPU es síncrono y puede bloquear el event loop, incluidas respuestas de salud. Nginx es un único punto de entrada; las tres réplicas son fijas y no constituyen autoescalado. El objetivo de diseño del TP2 (p95 ≤ 250 ms, p99 ≤ 500 ms y máximo ≤ 1000 ms) corresponde al alta transaccional `POST /envios/crear`. Medir el validador no prueba ese flujo, que requeriría autenticación, idempotencia, persistencia, transacción y outbox no implementadas aquí.

## Evidencias y reproducibilidad

- API y contrato: `docs/ADAPTACION_TP2_TP3.md`.
- Resultados locales verificables: `evidencias/validacion_rivamar_local.txt`.
- Scripts de estrés: `tests/k6_*.js` y `tests/run_*.ps1`.
- Datos futuros: `tests/results/`.
- Informe detallado: `docs/REPORTE_RENDIMIENTO.md`.

Levantar con `docker compose up -d --build`, validar con `node tests/validacion_envios.js` y ejecutar los comandos k6 del README. Este borrador no reemplaza las mediciones pendientes ni el PDF final.
