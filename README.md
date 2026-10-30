# TP3 - GlobalLogistics

## 1. Objetivo académico

Trabajo Práctico N.º 3 de Arquitectura de Sistemas de la Universidad Champagnat. El objetivo es desplegar con Infraestructura como Código un entorno cloud-native local que permita observar balanceo de carga, disponibilidad de réplicas y comportamiento de latencia bajo carga.

La consigna final requiere exactamente un balanceador, tres réplicas del microservicio, health checks y dos escenarios de estrés. La etapa técnica de pruebas de Rivamar incluye una referencia, 100 VU sobre la validación y CPU a 1, 10 y 25 VU; los resultados y límites están en `docs/REPORTE_RENDIMIENTO.md`.

## 2. Contexto de GlobalLogistics

GlobalLogistics S.A. necesita comprobar que una arquitectura distribuida puede escalar horizontalmente y conservar tiempos de respuesta estables frente a picos comerciales. El entorno de este TP simplifica ese problema a un microservicio REST replicado detrás de Nginx, con puntos de observación controlados para identidad, salud y consumo de CPU.

## 3. Relación con el TP2

El microservicio elegido del TP2 es **Gestión de Envíos**. Este TP3 implementa `POST /envios/validar`: comprueba la estructura y las reglas básicas de una solicitud de alta internacional sin registrarla. Conserva los endpoints técnicos para demostrar balanceo, salud y carga de CPU.

El contrato completo `POST /envios/crear` del TP2 requiere autenticación, idempotencia, persistencia transaccional y outbox. Este prototipo no ofrece esas garantías ni devuelve un `envioId`. La comparación detallada está en [docs/ADAPTACION_TP2_TP3.md](docs/ADAPTACION_TP2_TP3.md); los contratos del TP3 están en [docs/CONTRATOS_INTEGRACION.md](docs/CONTRATOS_INTEGRACION.md).

## 4. Arquitectura

```text
Cliente -> localhost:8080 -> nginx:80
                                |
                      +---------+---------+
                      |         |         |
                   api1:3000 api2:3000 api3:3000
```

- `nginx` (1.27, Open Source) es el único punto publicado en el host, mediante `8080:80`, y reparte las solicitudes en round-robin entre las tres réplicas.
- `api1`, `api2` y `api3` usan la misma imagen `tp3-globallogistics-api:local` (Node.js 22 + Express), construida desde `service/Dockerfile`, y escuchan en el puerto interno `3000`.
- `nginx` se conecta a `frontend` (bridge no interna) para recibir solicitudes publicadas en `localhost:8080` y a `backend` (bridge interna) para comunicarse con las APIs. Las tres APIs están sólo en `backend`.
- Compose comprueba `GET /health` en cada API antes de habilitar la dependencia de Nginx. Nginx detecta de forma pasiva las réplicas que fallan (`max_fails=2`, `fail_timeout=10s`) y puede reintentar los GET técnicos en otra; para `POST /envios/validar` el reintento está desactivado.
- Cada réplica devuelve su hostname y el ID real de su contenedor; `INSTANCE_ID` queda como apoyo de diagnóstico.

Endpoints públicos en `http://localhost:8080`:

| Ruta | Uso |
|---|---|
| `POST /envios/validar` | Valida una solicitud de alta de envío; `200` si es válida, `400` con errores si no. No crea el envío. |
| `GET /api/instancia` | Identidad de la réplica que respondió y nombre del servicio Gestión de Envíos. |
| `GET /health` | Salud de una réplica a través de Nginx (`200` si está sana). |
| `GET /api/cpu?work=N` | Trabajo de CPU real, `N` entero entre `1` y `2000`; otros valores → `400`. |
| `GET /nginx-health` | Salud del propio Nginx, sin consultar las APIs. |

El detalle de endpoints, health checks, decisiones de balanceo y evidencias está en [docs/ENTREGA_SICCARDI.md](docs/ENTREGA_SICCARDI.md).

## 5. Estructura del repositorio

```text
.
├── docker-compose.yml          # Topología de cuatro servicios
├── service/                    # Microservicio Node.js/Express
│   ├── Dockerfile
│   ├── package.json
│   ├── src/                    # app.js (endpoints) y server.js (arranque)
│   └── test/                   # Pruebas HTTP locales (npm test)
├── nginx/
│   └── nginx.conf              # Balanceo round-robin y manejo de fallos
├── tests/
│   ├── validacion_siccardi.sh  # Validación funcional anterior
│   ├── validacion_envios.js    # Validación funcional de Envios por Nginx
│   ├── k6_common.js            # Payload y checks compartidos por los escenarios
│   ├── k6_escenario_referencia.js
│   ├── k6_escenario_moderado.js
│   ├── k6_escenario_extremo.js
│   ├── run_stress.ps1           # Ejecuta k6 y captura métricas, Docker y health
│   ├── run_extreme_ladder.ps1   # Escalones controlados de concurrencia
│   └── graficar_resultados.py   # Figuras a partir de datos de carga reales
├── docs/
│   ├── CONTRATOS_INTEGRACION.md
│   ├── ADAPTACION_TP2_TP3.md
│   ├── ENTREGA_LOZANO.md
│   └── ENTREGA_SICCARDI.md
├── evidencias/                 # Registros de validación y capturas
├── .gitignore
└── README.md
```

Las evidencias anteriores de Siccardi se conservan en `evidencias/`.

## 6. Distribución de responsabilidades

| Integrante | Participación | Responsabilidad |
|---|---:|---|
| Lozano | 25 % | Estructura, Compose inicial, contratos y documentación de traspaso; revisión final. |
| Siccardi | 40 % | API REST, Dockerfile, Nginx, balanceo y health checks operativos. |
| Rivamar | 35 % | Pruebas de estrés, saturación de CPU, métricas y análisis de latencia. |

El trabajo se integra de forma secuencial: Lozano → Siccardi → Rivamar → revisión final de Lozano.

## 7. Requisitos para el entorno final

- Git.
- Docker Engine.
- Docker Compose v2 (`docker compose`).
- Puertos `8080` del host y `3000` dentro de las APIs disponibles para el uso indicado.
- Una herramienta HTTP como `curl` para las comprobaciones manuales.
- La herramienta de carga que seleccione Rivamar, una vez documentada.

## 8. Estado actual

Disponible (etapas de Lozano y Siccardi):

- estructura base, topología Compose con `nginx`, `api1`, `api2` y `api3`, redes y probes;
- microservicio de Envios con `/envios/validar` y los endpoints técnicos `/api/instancia`, `/health` y `/api/cpu`;
- `service/Dockerfile` con una única imagen para las tres réplicas;
- `nginx/nginx.conf` con balanceo round-robin, timeouts, detección pasiva de fallos y reintento en otra réplica;
- validación funcional de extremo a extremo (`tests/validacion_siccardi.sh`) con evidencias en `evidencias/`;
- contratos de integración y documentos de traspaso.

Pendiente:

- revisión final, PDF y entrega de la institución (Lozano).

## 9. Ejecución

```bash
docker compose config -q
docker compose up -d --build
docker compose ps                       # 4 contenedores (healthy)
node tests/validacion_envios.js          # POST real por Nginx, tres replicas y regresion
curl http://localhost:8080/health
curl http://localhost:8080/api/instancia
curl 'http://localhost:8080/api/cpu?work=500'
bash tests/validacion_siccardi.sh       # validación funcional completa
docker compose down
```

Para ver el reparto entre réplicas:

```bash
for i in $(seq 1 9); do curl -s http://localhost:8080/api/instancia | grep -o '"instancia":"[^"]*"'; done
```

Pruebas HTTP locales del servicio (requiere Node.js 22 o superior):

```bash
cd service && npm ci && npm test
```

Ejemplo de solicitud funcional (desde la raíz del repositorio):

```bash
curl -i -X POST http://localhost:8080/envios/validar -H 'Content-Type: application/json' -d '{"remitente":{"nombre":"Empresa Ejemplo S.A.","pais":"AR","direccion":"Av. San Martin 1200, Mendoza","codigoPostal":"5500"},"destinatario":{"nombre":"Comercio Ejemplo Ltda.","pais":"CL","direccion":"Av. Providencia 1500, Santiago","codigoPostal":"7500000"},"paquete":{"pesoKg":2.5,"descripcion":"Repuestos mecanicos","valorDeclarado":{"moneda":"USD","montoMinor":14500}},"servicio":"EXPRESS"}'
```

La respuesta `200` contiene `valido`, `servicio`, `tipoEnvio`, `origen`, `destino`, `pesoKg`, `instancia` y `contenedor_id`; los errores de estructura o formato reciben `400` con `errores` por campo.

### Pruebas de carga (Rivamar)

Requieren Docker Engine iniciado, k6 instalado y el entorno levantado. Si Windows no refrescó el `PATH`, el runner busca también `C:\Program Files\k6\k6.exe`. Los resultados se guardan en una carpeta fechada bajo `tests/results/`: resumen de k6 (promedio, mediana, p95, p99 y máximo), métricas crudas, códigos y checks, CPU/memoria cada segundo, health checks y metadatos de hardware/software/commit.

```powershell
docker compose up -d --build
node tests/validacion_envios.js
# Referencia liviana, 5 VU por 30 s
./tests/run_stress.ps1 -Escenario referencia -Vus 5 -Duracion 30s
# Concurrencia moderada: subida de 10 s, 100 VU sostenidos 45 s
./tests/run_stress.ps1 -Escenario moderado -Vus 100 -Duracion 45s
# Escalera de CPU: mismo work=100 en cada nivel, 30 s por nivel
./tests/run_extreme_ladder.ps1 -Escalones 10,25,50,100,200 -Work 100 -Duracion 30s
# Al completar corridas: reemplazar por nombres reales bajo tests/results
python tests/graficar_resultados.py --runs <carpeta-referencia> <carpeta-moderada> <carpeta-escalon-10-vu>
# Dependencia de gráficos, si todavía no está instalada
python -m pip install -r tests/requirements-graficos.txt
```

El último nivel debe omitirse o ajustarse si CPU, memoria o health checks se degradan; no se debe interpretar `200 VU` como requisito de ejecución incondicional. Para cambiar el trabajo manteniendo la concurrencia, ejecutar otra escalera separada con `-Work 500` o superior, sin exceder el máximo documentado de 2000. El runner muestrea `docker stats` y `/health` y `/nginx-health` durante cada escalón. La API bloquea el event loop mientras ejecuta `/api/cpu`, por lo que los health checks pueden demorarse. `POST /envios/validar` es validación en memoria, no creación persistente de un envío.

Estado de las pruebas: `npm ci` y 28 pruebas unitarias pasaron; el usuario verificó cuatro contenedores healthy y `VALIDACION ENVIOS OK`. k6 2.3.0 ejecutó la referencia, el escenario de 100 VU y los escalones CPU de 1, 10 y 25 VU. Los resultados, CSV y metadatos están en `tests/results/`; los gráficos y análisis están en `docs/REPORTE_RENDIMIENTO.md`. No se ejecutó 50 VU: a 25 VU hubo latencias de hasta 11,62 s y dos fallos/timeout de `/health`.

## 10. Próximos pasos

1. Lozano revisará las métricas, capturas y borrador del informe, y completará el PDF final.
2. La integración a `main` queda sujeta a la revisión de Lozano.

Historial de traspasos: [docs/ENTREGA_LOZANO.md](docs/ENTREGA_LOZANO.md) y [docs/ENTREGA_SICCARDI.md](docs/ENTREGA_SICCARDI.md).
