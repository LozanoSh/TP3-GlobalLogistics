# Entrega de Siccardi a Rivamar

## Propósito del traspaso

Esta entrega completa la etapa 2 del TP3: el microservicio REST, su imagen Docker, el balanceador Nginx y los health checks operativos. Con ella, Rivamar puede levantar el entorno completo con Docker Compose y ejecutar las pruebas de estrés sin implementar componentes faltantes.

Se respetó la topología fijada por Lozano en `docker-compose.yml` y `docs/CONTRATOS_INTEGRACION.md`: cuatro servicios (`nginx`, `api1`, `api2`, `api3`), una única imagen `tp3-globallogistics-api:local`, puerto interno `3000`, red interna `backend`, red `frontend` y publicación única `8080:80`. No se modificó `docker-compose.yml`.

## Componentes implementados

| Componente | Tecnología | Descripción |
|---|---|---|
| Microservicio REST | Node.js 22 + Express 4 | Sin estado; expone `/api/instancia`, `/health` y `/api/cpu`. |
| Imagen | `node:22-alpine` | Una imagen para las tres réplicas; incluye `wget` (BusyBox) para el probe. |
| Balanceador | Nginx 1.27.5 (Open Source) | Round-robin sobre `api1`, `api2` y `api3`, con detección pasiva de fallos y reintento. |
| Validación funcional | Bash + curl | `tests/validacion_siccardi.sh`: comprueba contenedores, salud, balanceo, CPU, caída y recuperación. |
| Pruebas unitarias | `node:test` | `service/test/app.test.js`: 13 casos sobre endpoints y validación. |

## Archivos creados y modificados

| Archivo | Estado | Propósito |
|---|---|---|
| `service/package.json` | Nuevo | Dependencias y scripts (`start`, `test`). |
| `service/package-lock.json` | Nuevo | Versiones fijadas para `npm ci`. |
| `service/src/app.js` | Nuevo | Definición de la app Express y los endpoints. |
| `service/src/server.js` | Nuevo | Arranque en `0.0.0.0:$PORT` y apagado ordenado. |
| `service/test/app.test.js` | Nuevo | Pruebas unitarias. |
| `service/Dockerfile` | Nuevo | Imagen `tp3-globallogistics-api:local`. |
| `service/.dockerignore` | Nuevo | Excluye `node_modules` y pruebas del contexto de build. |
| `nginx/nginx.conf` | Nuevo | Upstream, balanceo, timeouts, reintentos y rutas. |
| `tests/validacion_siccardi.sh` | Nuevo | Validación funcional reproducible (no es prueba de estrés). |
| `evidencias/validacion_siccardi.txt` | Nuevo | Salida real de la validación. |
| `evidencias/logs_compose_validacion.txt` | Nuevo | Logs de Nginx y las APIs durante la validación. |
| `docs/ENTREGA_SICCARDI.md` | Nuevo | Este documento. |
| `README.md` | Modificado | Estado, estructura y ejecución actualizados. |
| `service/.gitkeep`, `nginx/.gitkeep`, `tests/.gitkeep` | Eliminados | Los directorios ya tienen contenido. |

## Arquitectura final

```text
                 Host
   curl / herramienta de carga
               |
        localhost:8080
               |
   ------------+------------  red frontend (bridge)
               |
          nginx:80  (round-robin, max_fails=2, fail_timeout=10s)
               |
   ------------+------------  red backend (bridge, internal)
      |        |        |
  api1:3000 api2:3000 api3:3000
   (misma imagen tp3-globallogistics-api:local)
```

- Sólo Nginx publica un puerto al host. Las APIs no son accesibles directamente desde fuera de Docker.
- Nginx resuelve las réplicas por nombre DNS de Compose (`resolver 127.0.0.11` y `resolve` en cada `server`), nunca por IP fija; si un contenedor se recrea con otra IP, Nginx la vuelve a resolver.
- Las respuestas incluyen las cabeceras `X-Instancia` (hostname de la réplica) y `X-Upstream` (IP:puerto elegido por Nginx).

## Endpoints

Todos se acceden por `http://localhost:8080`. Las respuestas son JSON y llevan `Cache-Control: no-store`.

### `GET /api/instancia`

Identifica la réplica que respondió.

```json
{
  "instancia": "api3",
  "contenedor_id": "1192bcda264dfb5c0b19ffbf807fd028119b74414c616220b8bed4155e34ccdd",
  "instance_id": "api3",
  "pid": 1,
  "servicio": "tp3-globallogistics-api",
  "version": "1.0.0",
  "node": "v22.23.4",
  "uptime_s": 18,
  "timestamp": "2026-10-29T21:13:39.367Z"
}
```

- `instancia`: `os.hostname()` del contenedor (Compose fija `hostname: apiN`).
- `contenedor_id`: ID real de 64 caracteres del contenedor Docker, leído de `/proc/self/mountinfo`. Coincide con `docker inspect` (ver evidencias).
- `instance_id`: valor de la variable `INSTANCE_ID`, sólo como apoyo de diagnóstico.

### `GET /health`

- `200 {"estado":"ok","instancia":"apiN","uptime_s":N}` cuando la réplica atiende solicitudes.
- `503 {"estado":"cerrando",...}` desde que la réplica recibe `SIGTERM` hasta que termina, para no aceptar tráfico nuevo durante el apagado.
- No hace trabajo intensivo.

Por Nginx, `/health` se reenvía a una réplica (round-robin) y valida el camino completo cliente → Nginx → API. `GET /nginx-health` responde desde el propio Nginx sin consultar las APIs.

### `GET /api/cpu?work=N`

Ejecuta trabajo de CPU real y determinista: un generador xorshift32 iterado `N × 100 000` veces. No usa esperas, temporizadores, E/S ni red.

| Parámetro | Regla |
|---|---|
| `work` | Entero decimal, `1 ≤ work ≤ 2000` (máximo configurable con `CPU_WORK_MAX`). |
| Inválido | Ausente, vacío, negativo, decimal, notación científica, repetido o fuera de rango → HTTP `400`. |

Respuesta `200`:

```json
{"instancia":"api1","work":2000,"iteraciones":200000000,"resultado":2236983822,"duracion_ms":1638.3}
```

`resultado` es siempre el mismo para un mismo `work`, lo que permite comprobar que el cálculo se ejecutó. Duraciones medidas en esta máquina, dentro del contenedor y sin carga concurrente:

| `work` | Duración aproximada |
|---:|---:|
| 1 | 3 ms |
| 100 | 95 ms |
| 500 | 410 ms |
| 2000 | 1640 ms |

La relación es lineal (≈0,8 ms por unidad en este equipo). En otro hardware los valores absolutos cambian.

## Levantar el entorno

```bash
docker compose config -q
docker compose up -d --build
docker compose ps
```

Se esperan cuatro contenedores en estado `(healthy)`. Nginx sólo arranca cuando `api1`, `api2` y `api3` están `healthy` (`depends_on: condition: service_healthy`).

Para apagar:

```bash
docker compose down
```

## Comprobar el balanceo

```bash
for i in $(seq 1 9); do curl -s http://localhost:8080/api/instancia | grep -o '"instancia":"[^"]*"'; done
```

Con las tres réplicas sanas, la secuencia rota `api1 → api2 → api3` (el punto de inicio puede variar). También puede verse en los logs de Nginx, que registran el upstream y los tiempos de cada solicitud:

```bash
docker compose logs -f nginx
```

Validación completa automatizada:

```bash
bash tests/validacion_siccardi.sh
```

El script detiene y vuelve a arrancar `api2` y `api3`. Termina con `VALIDACIÓN OK` y código de salida `0` si todo pasa.

## Health checks: Docker frente a Nginx

Son dos mecanismos independientes y conviene no confundirlos en el informe:

| | Health check de Docker | Detección pasiva de Nginx Open Source |
|---|---|---|
| Quién lo ejecuta | El demonio Docker, dentro de cada contenedor. | Nginx, al enviar tráfico real. |
| Cómo | `wget -q --spider http://127.0.0.1:3000/health` cada 10 s, timeout 3 s, 3 reintentos, 10 s de arranque. | Cuenta errores de conexión, timeouts y respuestas 502/503/504 de cada upstream. |
| Efecto | Marca el contenedor `healthy`/`unhealthy` y ordena el arranque (`depends_on`). | Con `max_fails=2` en `fail_timeout=10s`, excluye la réplica durante 10 s; luego vuelve a probarla con tráfico real. |
| Afecta al enrutamiento | **No.** Nginx no consulta el estado de Docker. | **Sí.** Además, `proxy_next_upstream` reintenta la misma solicitud en otra réplica. |

El health check activo (`health_check`) de Nginx sólo existe en Nginx Plus, por eso se combina el probe de Docker con la detección pasiva. Además, `restart: unless-stopped` reinicia un contenedor cuyo proceso termina, pero Docker Compose fuera de Swarm **no** reinicia un contenedor por quedar `unhealthy`.

Reglas de reintento configuradas:

- Rutas generales y `/health`: reintento en otra réplica ante `error`, `timeout`, `502`, `503` y `504`, hasta 3 intentos y 5 s en total.
- `/api/cpu`: reintento sólo ante `error`, `502`, `503` y `504`, **no ante timeout**, para no repetir un cálculo largo en otra réplica y multiplicar la carga durante la saturación.

Timeouts: `proxy_connect_timeout 2s`, `proxy_send_timeout 10s`, `proxy_read_timeout 15s` (3 s en `/health`, 30 s en `/api/cpu`).

## Instrucciones para Rivamar: carga de CPU

- Usar siempre la entrada pública `http://localhost:8080/api/cpu?work=N`.
- Valores sugeridos: `work=100` (~0,1 s) para concurrencia moderada y `work=500` a `work=1000` (~0,4 a 0,8 s) para saturación. Evitar empezar en `2000`.
- Subir la concurrencia de forma gradual y medir latencia promedio, p95 y p99.
- Confirmar el reparto observando el campo `instancia`, la cabecera `X-Instancia` o los logs de Nginx (`upstream=`, `rt=`, `urt=`).
- Observar el consumo con `docker stats`.

Ejemplo con `curl`, sólo para comprobar el funcionamiento (no es una prueba de estrés):

```bash
curl -s 'http://localhost:8080/api/cpu?work=500'
curl -si 'http://localhost:8080/api/cpu?work=abc' | head -1
```

## Evidencias y resultados

Ejecución real del 29/10/2026 en macOS con Docker Desktop (Docker Engine 29.7.2, Docker Compose v5.4.0, Nginx 1.27.5, Node v22.23.4). Salida completa en [`evidencias/validacion_siccardi.txt`](../evidencias/validacion_siccardi.txt) y logs en [`evidencias/logs_compose_validacion.txt`](../evidencias/logs_compose_validacion.txt).

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Exactamente cuatro contenedores | OK: `api1`, `api2`, `api3`, `nginx`; sólo Nginx publica `0.0.0.0:8080->80/tcp`. |
| 2 | Las tres APIs funcionan | OK: las tres responden por Nginx. |
| 3 | Health checks exitosos | OK: los cuatro contenedores en `healthy`; `GET /health` → `200`. |
| 4 | Nginx distribuye solicitudes | OK: 9 solicitudes → `api3, api1, api2, api3, api1, api2, api3, api1, api2`. |
| 5 | IDs reales diferentes | OK: `contenedor_id` distinto por réplica y coincidente con `docker inspect`. |
| 6 | `/api/cpu` funciona y valida | OK: `work` 1, 100, 500 y 2000 → `200`; `abc`, `0`, `-5`, `1.5`, `2001`, vacío y ausente → `400`. |
| 7a | Caída controlada (`docker compose stop api2`) | OK: 9 de 9 solicitudes `200`, atendidas sólo por `api1` y `api3`. |
| 7b | Caída abrupta (`docker compose kill api3`) | OK: 9 de 9 solicitudes `200`. Una tardó ~2 s: Nginx agotó el `connect_timeout` contra `api3`, la marcó `temporarily disabled` y reintentó en `api2`. |
| 8 | Recuperación | OK: `api2` y `api3` vuelven a `healthy` en ~8 s y a recibir tráfico. |

Además, `npm test` en `service/` ejecuta 13 pruebas unitarias, todas exitosas.

Extracto de la detección pasiva durante la caída abrupta de `api3`:

```text
[warn] upstream server temporarily disabled while connecting to upstream ... upstream: "http://172.21.0.4:3000/api/instancia"
[error] upstream timed out (110: Operation timed out) while connecting to upstream ...
"GET /api/instancia HTTP/1.1" 200 upstream=172.21.0.4:3000, 172.21.0.2:3000 up_status=504, 200 rt=2.009
```

No se ejecutaron pruebas de estrés ni se midieron percentiles: corresponden a la etapa de Rivamar.

## Limitaciones conocidas

- **Bucle de eventos bloqueado durante `/api/cpu`.** Node.js ejecuta el cálculo en el hilo principal: mientras una réplica procesa un `work` alto, sus otras solicitudes (incluido `/health`) esperan. Es intencional, porque así se satura la CPU de verdad, pero bajo saturación fuerte el probe de Docker (timeout 3 s) puede marcar réplicas `unhealthy` y Nginx puede registrar timeouts. Es un comportamiento esperable que Rivamar puede analizar en el informe.
- **Un núcleo por réplica.** Cada contenedor corre un único proceso Node, por lo que aprovecha como máximo un núcleo. No hay límites de CPU (`cpus`) en Compose: las tres réplicas comparten la CPU de la máquina Docker.
- **Detección pasiva.** Nginx Open Source sólo detecta una réplica caída al enviarle tráfico. La primera solicitud tras una caída abrupta puede tardar hasta `proxy_connect_timeout` (2 s) antes del reintento.
- **Unhealthy no reinicia.** Docker Compose no reinicia contenedores `unhealthy`; sólo los que terminan.
- **Duraciones dependientes del hardware.** La tabla de tiempos de `/api/cpu` corresponde a esta máquina.
- **Docker Desktop en macOS.** Las pruebas se hicieron en una VM de Docker Desktop. En Linux nativo los tiempos absolutos pueden diferir.

## Pendiente para Rivamar

1. Elegir y documentar la herramienta de carga (por ejemplo `k6`, `autocannon`, `hey` o `wrk`) y guardar los scripts en `tests/`.
2. Escenario 1: concurrencia moderada sobre `/api/instancia` o `/api/cpu` con `work` bajo.
3. Escenario 2: saturación de CPU con `/api/cpu`, aumentando `work` y concurrencia de forma controlada.
4. Registrar latencia promedio, p95, p99, errores y reparto por instancia; guardar resultados en `tests/results/` y capturas en `evidencias/`.
5. Analizar el comportamiento observado, incluidas las limitaciones de esta sección.
