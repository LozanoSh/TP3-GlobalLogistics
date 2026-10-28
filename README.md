# TP3 - GlobalLogistics

## 1. Objetivo académico

Trabajo Práctico N.º 3 de Arquitectura de Sistemas de la Universidad Champagnat. El objetivo es desplegar con Infraestructura como Código un entorno cloud-native local que permita observar balanceo de carga, disponibilidad de réplicas y comportamiento de latencia bajo carga.

La consigna final requiere exactamente un balanceador, tres réplicas del microservicio, health checks y dos escenarios de estrés. Este repositorio se encuentra todavía en la etapa de infraestructura inicial de Lozano.

## 2. Contexto de GlobalLogistics

GlobalLogistics S.A. necesita comprobar que una arquitectura distribuida puede escalar horizontalmente y conservar tiempos de respuesta estables frente a picos comerciales. El entorno de este TP simplifica ese problema a un microservicio REST replicado detrás de Nginx, con puntos de observación controlados para identidad, salud y consumo de CPU.

## 3. Relación con el TP2

El TP2 propuso una arquitectura distribuida con una entrada unificada, servicios de dominio sin estado, bases de datos independientes y eventos para los procesos asíncronos. De esa propuesta se reutilizan en este TP los principios de entrada única y escalado horizontal.

El contrato `POST /envios/crear` del TP2 no forma parte de esta primera implementación. El TP3 incorpora endpoints técnicos específicos para demostrar balanceo y medir rendimiento; sus contratos están en [docs/CONTRATOS_INTEGRACION.md](docs/CONTRATOS_INTEGRACION.md).

## 4. Arquitectura prevista

```text
Cliente -> localhost:8080 -> nginx:80
                                |
                      +---------+---------+
                      |         |         |
                   api1:3000 api2:3000 api3:3000
```

- `nginx` será el único punto publicado en el host, mediante `8080:80`.
- `api1`, `api2` y `api3` usarán la misma imagen `tp3-globallogistics-api:local`, construida desde `service/Dockerfile`, y escucharán en el puerto interno `3000`.
- `nginx` se conectará a `frontend` (bridge no interna) para recibir solicitudes publicadas en `localhost:8080` y a `backend` (bridge interna) para comunicarse con las APIs. Las tres APIs estarán sólo en `backend`.
- Compose comprobará `GET /health` en cada API antes de habilitar la dependencia de Nginx.
- Cada réplica recibirá un `INSTANCE_ID` distinto, sin reemplazar la obligación de devolver su identidad real de contenedor.

## 5. Estructura del repositorio

```text
.
├── docker-compose.yml          # Topología inicial de cuatro servicios
├── service/                    # Microservicio y Dockerfile (pendientes)
├── nginx/                      # nginx.conf (pendiente)
├── tests/                      # Pruebas de carga (pendientes)
├── docs/
│   ├── CONTRATOS_INTEGRACION.md
│   └── ENTREGA_LOZANO.md
├── evidencias/                 # Capturas y resultados seleccionados (pendientes)
├── .gitignore
└── README.md
```

Los directorios todavía vacíos se conservan con archivos `.gitkeep`.

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

Disponible en esta etapa:

- estructura base del repositorio;
- topología Compose con `nginx`, `api1`, `api2` y `api3`;
- imagen compartida, puerto, redes, variables, dependencias y probes declarados;
- `.gitignore` permite versionar capturas en `evidencias/` y resultados seleccionados en `tests/results/`;
- contratos de integración y traspaso técnico.

Todavía no están disponibles:

- código del microservicio y endpoints;
- `service/Dockerfile`;
- `nginx/nginx.conf` y algoritmo de balanceo;
- ejecución completa de `docker compose up -d`;
- pruebas de carga, métricas, evidencias e informe final.

En consecuencia, **no debe ejecutarse aún `docker compose up -d` esperando un despliegue funcional**. La configuración puede validarse con:

```bash
docker compose config
```

La validación del manifiesto comprueba la estructura declarada; todavía no demuestra conectividad HTTP ni que la imagen pueda construirse, porque Siccardi debe aportar `service/Dockerfile` y `nginx/nginx.conf`.

## 9. Ejecución prevista al completar la integración

Cuando Siccardi agregue los componentes pendientes, el flujo esperado será:

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
curl http://localhost:8080/health
curl http://localhost:8080/api/instancia
```

Las instrucciones de pruebas de carga se incorporarán en la etapa de Rivamar. Hasta entonces, estos comandos describen el contrato de operación futuro y no una validación realizada de extremo a extremo.

## 10. Próximos pasos

1. Siccardi implementará el servicio, su Dockerfile y la configuración de Nginx sin cambiar los nombres, puertos ni rutas acordados.
2. Siccardi verificará que peticiones consecutivas a `/api/instancia` muestren IDs reales de distintas réplicas y que los health checks estén saludables.
3. Rivamar añadirá escenarios reproducibles de concurrencia moderada y saturación de CPU, con latencia promedio, p95 y p99.
4. Lozano realizará la revisión, integración y documentación final sin fusionar automáticamente a `main`.

El detalle operativo para continuar está en [docs/ENTREGA_LOZANO.md](docs/ENTREGA_LOZANO.md).
