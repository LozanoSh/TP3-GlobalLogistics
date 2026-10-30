# Adaptación del microservicio Envios del TP2 al TP3

## Servicio elegido y alcance

El contexto elegido del TP2 GlobalLogistics es **Gestión de Envíos**, responsable del alta y la validación de envíos internacionales. La fuente del contrato es `TP2_GlobalLogistics_Entrega/openapi.yaml`, en particular `CrearEnvioRequest` y `POST /envios/crear`.

El TP3 implementa **`POST /envios/validar`** en la API Node.js existente. Valida campos, tipos, longitudes, patrones, rangos y propiedades adicionales de `CrearEnvioRequest`. Una solicitud válida recibe `200` con un resumen de origen, destino, peso, tipo de servicio y la réplica que la atendió. Una inválida recibe `400` con errores por campo. La validación no almacena el envío.

## Diferencia con `POST /envios/crear`

| Capacidad del TP2 | Estado en este TP3 |
|---|---|
| Validación del cuerpo de `CrearEnvioRequest` | Implementada en `/envios/validar`. |
| Autenticación Bearer JWT y permiso `envios:crear` | No implementados; el TP3 no incorpora Gateway ni identidad de cliente. |
| `Idempotency-Key`, deduplicación y conflictos de clave | No implementados; no se crea un envío ni se acepta una operación de alta. |
| Registro durable de envío y transacción | No implementados; las tres réplicas no comparten almacenamiento. |
| Evento de dominio mediante outbox | No implementado; requiere persistencia transaccional y procesamiento asíncrono. |
| `201`, `Location` y `envioId` | No se devuelven; `/envios/validar` responde `200` únicamente por validación. |

No se agregó una base de datos porque el objetivo del TP3 es desplegar exactamente cuatro contenedores principales: un Nginx y tres réplicas de una imagen compartida. Agregar persistencia para simular un alta parcial daría una garantía engañosa; el contrato completo del TP2 necesitaría diseñar la base compartida, transacciones, identidad y outbox como un cambio posterior.

## Réplicas, balanceo e identidad

`api1`, `api2` y `api3` ejecutan el mismo código e imagen, sin estado funcional local. Nginx distribuye las solicitudes por round-robin mediante el upstream existente y reenvía `/envios/validar` con su body JSON. Para este POST se desactivan los reintentos automáticos: una conexión fallida después de enviar el body no debe repetir la operación sin saber si la réplica la procesó. La respuesta identifica `instancia` con el hostname real y `contenedor_id` con el ID leído del entorno Docker. Fuera de Docker, `contenedor_id` puede ser `null`.

## Cómo comprobarlo

Desde `service/`, ejecutar `npm ci` y `npm test`. Desde la raíz, ejecutar `docker compose config`, `docker compose up -d --build` y `docker compose ps`; deben aparecer sólo `nginx`, `api1`, `api2` y `api3`, todos saludables. Luego ejecutar `node tests/validacion_envios.js`, que envía POST reales por Nginx, comprueba 400 para entradas inválidas, observa las tres réplicas y verifica los endpoints técnicos. El ejemplo de `curl` y la forma de respuesta están en el [README](../README.md). La validación anterior de Siccardi sigue disponible en `tests/validacion_siccardi.sh`.

`montoMinor` se comprueba como entero positivo `int64` usando el literal numérico original del JSON, para aceptar importes válidos de 64 bits sin redondeo. Esto requiere Node.js 22, la versión de la imagen Docker y el mínimo declarado en `service/package.json`. La API comprueba los patrones de país y moneda del OpenAPI, sin consultar un catálogo de códigos ISO.

## Comparación de tiempos

Las mediciones del TP3 sobre `/envios/validar` cubren validación en memoria, balanceo y red local. No incluyen autenticación, idempotencia, escritura durable, transacción ni publicación outbox; por eso no miden el tiempo extremo a extremo ni demuestran los objetivos de latencia de `POST /envios/crear` del TP2. `/api/cpu` produce una carga sintética separada. Los percentiles y el informe de rendimiento corresponden a la etapa de Rivamar.

## Validación ejecutada en esta adaptación

El 30/10/2026, `npm ci` y `npm test` completaron correctamente; pasaron 28 de 28 pruebas HTTP locales. `docker compose config` aceptó la topología de cuatro servicios. En este equipo el daemon de Docker Desktop no estuvo disponible, por lo que `docker compose up -d --build`, `docker compose ps` y la prueba por Nginx no pudieron completarse. La salida real y el alcance de esa limitación están en [`evidencias/npm_test_envios.txt`](../evidencias/npm_test_envios.txt) y [`evidencias/validacion_entorno_envios.txt`](../evidencias/validacion_entorno_envios.txt). Las capturas históricas de Siccardi corresponden a su entrega previa, no a esta adaptación.
