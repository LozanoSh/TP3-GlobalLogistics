# TP3 - GlobalLogistics

## 1. Objetivo académico

Trabajo Práctico N.º 3 de Arquitectura de Sistemas de la Universidad Champagnat. El objetivo es desplegar con Infraestructura como Código un entorno cloud-native local que permita observar balanceo de carga, disponibilidad de réplicas y comportamiento de latencia bajo carga.

La consigna final requiere exactamente un balanceador, tres réplicas del microservicio, health checks y dos escenarios de estrés. El repositorio tiene completas la infraestructura inicial de Lozano y la etapa de Siccardi (API, imagen, Nginx y balanceo). Falta la etapa de pruebas de estrés de Rivamar.

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
│   └── validacion_envios.js    # Validación funcional de Envios por Nginx
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

- pruebas de carga, métricas (promedio, p95, p99) y análisis (Rivamar);
- revisión final e informe (Lozano).

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

Las instrucciones de pruebas de carga se incorporarán en la etapa de Rivamar.

## 10. Próximos pasos

1. Rivamar añadirá escenarios reproducibles de concurrencia moderada con `POST /envios/validar` y saturación de CPU con `GET /api/cpu?work=N`, con latencia promedio, p95 y p99. Las recomendaciones de valores de `work` están en [docs/ENTREGA_SICCARDI.md](docs/ENTREGA_SICCARDI.md).
2. Lozano realizará la revisión, integración y documentación final sin fusionar automáticamente a `main`.

Historial de traspasos: [docs/ENTREGA_LOZANO.md](docs/ENTREGA_LOZANO.md) y [docs/ENTREGA_SICCARDI.md](docs/ENTREGA_SICCARDI.md).
