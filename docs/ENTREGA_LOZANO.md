# Entrega de Lozano a Siccardi

## Propósito del traspaso

Esta entrega deja preparada la infraestructura inicial del TP3 para que Siccardi implemente el microservicio y el balanceador sin rehacer la topología. La consigna oficial y los artefactos del TP2 fueron revisados antes de definirla.

Del TP2 se conservan dos decisiones aplicables: una entrada única delante de servicios sin estado y la posibilidad de escalar horizontalmente. No se reutiliza el `POST /envios/crear` porque el TP3 necesita endpoints técnicos independientes para comprobar identidad de instancia, salud y saturación de CPU.

## Qué implementó Lozano

- Creó la estructura `service/`, `nginx/`, `tests/`, `docs/` y `evidencias/`.
- Preparó `.gitignore` para dependencias, variables locales, secretos y artefactos descartables, permitiendo versionar capturas en `evidencias/` y resultados seleccionados en `tests/results/`.
- Definió en Compose exactamente cuatro servicios: `nginx`, `api1`, `api2` y `api3`.
- Declaró una misma imagen `tp3-globallogistics-api:local` para las tres APIs, construida desde `service/Dockerfile`.
- Separó la red bridge no interna `frontend` de la red bridge interna `backend` y publicó sólo Nginx mediante `8080:80`.
- Estableció el puerto interno `3000`, `PORT`, `INSTANCE_ID`, probes y dependencias basadas en salud.
- Documentó los contratos de `/api/instancia`, `/health` y `/api/cpu`.
- Validó la sintaxis y la expansión del manifiesto con Docker Compose.

No se implementó código de aplicación, Dockerfile, configuración de Nginx ni pruebas de carga, de acuerdo con la división de responsabilidades.

## Archivos de esta etapa

| Archivo | Estado y propósito |
|---|---|
| `docker-compose.yml` | Topología inicial y contratos de ejecución. |
| `.gitignore` | Exclusiones de seguridad y artefactos descartables; admite evidencias y resultados de entrega. |
| `README.md` | Contexto, arquitectura, responsabilidades, estado y próximos pasos. |
| `docs/CONTRATOS_INTEGRACION.md` | Convenciones que Siccardi y Rivamar deben respetar. |
| `docs/ENTREGA_LOZANO.md` | Este documento de continuidad. |
| `service/.gitkeep` | Conserva el directorio hasta que se agregue la API. |
| `nginx/.gitkeep` | Conserva el directorio hasta que se agregue `nginx.conf`. |
| `tests/.gitkeep` | Reserva el lugar de las pruebas de Rivamar. |
| `evidencias/.gitkeep` | Reserva el lugar de evidencias seleccionadas. |

## Decisiones técnicas fijadas

### Nombres, puertos y red

| Componente | Nombre DNS en Compose | Puerto interno | Puerto del host |
|---|---|---:|---:|
| Balanceador | `nginx` | `80` | `8080` |
| Réplica 1 | `api1` | `3000` | No publicado |
| Réplica 2 | `api2` | `3000` | No publicado |
| Réplica 3 | `api3` | `3000` | No publicado |

`nginx` usa `frontend`, una red `bridge` no interna, para recibir tráfico publicado en `localhost:8080`. También usa `backend`, declarada como `bridge` e `internal: true`, para llegar a las APIs. `api1`, `api2` y `api3` sólo usan `backend` y no publican puertos al host. Las APIs se descubren por DNS de Compose, nunca por IP fija.

### Tres réplicas explícitas

Las réplicas están declaradas por separado porque la consigna pide tres instancias y Nginx debe referenciarlas de forma directa. Comparten el ancla `x-api-common`, que fija la imagen `tp3-globallogistics-api:local`, el mismo contexto de build (`service/Dockerfile`), puerto, red, política de reinicio y health check. Sólo cambian `hostname` e `INSTANCE_ID`.

No debe reemplazarse esta forma por `deploy.replicas`, porque dificultaría nombrar los tres upstreams y `deploy` no tiene el mismo comportamiento fuera de Swarm.

### Salud y orden de inicio

Cada API tiene un probe HTTP contra `GET /health`. Nginx depende de `service_healthy` para las tres réplicas y también tiene un probe contra su `/health` público. Estos probes preparan la integración; no implementan la lógica de salud.

El comando inicial usa `wget`. Siccardi debe incluirlo en la imagen o sustituir el probe por una herramienta realmente disponible, sin cambiar la ruta ni la semántica.

## Partes pendientes del Compose

El manifiesto referencia deliberadamente dos archivos que todavía no existen:

- `service/Dockerfile`;
- `nginx/nginx.conf`.

Por esa razón `docker compose config` funciona, pero `docker compose build` y `docker compose up -d` no completarán el despliegue actual. Esto es un estado esperado de traspaso, no una falla que deba ocultarse con servicios simulados.

Siccardi puede ajustar dentro de su implementación:

- el comando del health check si la imagen no incluye `wget`;
- tiempos del probe si el arranque real lo requiere;
- detalles de reinicio y manejo pasivo de fallos de Nginx.

Debe conservar los cuatro nombres, los puertos, la separación entre `frontend` y `backend`, la imagen compartida, las tres réplicas explícitas y las rutas públicas.

## Trabajo que debe realizar Siccardi

1. Crear en `service/` una API REST sin estado que escuche en `0.0.0.0:3000` y respete `PORT`.
2. Implementar `GET /api/instancia` con hostname o ID real del contenedor.
3. Implementar `GET /health` con HTTP `200` sólo cuando la instancia pueda atender tráfico.
4. Diseñar e implementar `GET /api/cpu?work=N`, con validación, cota segura y trabajo de CPU reproducible.
5. Crear `service/Dockerfile` para una única imagen reutilizada por `api1`, `api2` y `api3`.
6. Crear `nginx/nginx.conf` con los tres upstreams por nombre DNS y el algoritmo de balanceo elegido.
7. Enrutar las tres rutas, preservar el query string, evitar caché y configurar el manejo de upstreams no saludables.
8. Confirmar que los probes usan herramientas presentes en las imágenes.
9. Actualizar README con las instrucciones finales verificadas, sin borrar el historial de esta etapa.

El contrato completo está en `docs/CONTRATOS_INTEGRACION.md`.

## Validación después de completar la implementación

### Configuración y construcción

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

Se esperan exactamente cuatro servicios, tres APIs saludables y una instancia de Nginx publicada en el puerto `8080`.

### Identidad y balanceo

```bash
for i in 1 2 3 4 5 6; do
  curl --fail --silent http://localhost:8080/api/instancia
  printf '\n'
done
```

Las respuestas deben mostrar IDs reales de más de una instancia. La secuencia exacta dependerá del algoritmo documentado por Siccardi.

### Salud

```bash
curl --include http://localhost:8080/health
docker compose ps
docker compose logs nginx api1 api2 api3
```

La respuesta pública debe ser `200` cuando las réplicas estén sanas. Compose debe mostrar el estado de salud esperado y los logs no deben contener ciclos de reinicio.

### Carga de CPU funcional

```bash
curl --fail 'http://localhost:8080/api/cpu?work=1000'
curl --include 'http://localhost:8080/api/cpu?work=valor-invalido'
```

El primer valor es sólo un ejemplo funcional y debe reemplazarse por uno permitido por la implementación. La segunda petición debe producir `400`. Las pruebas de estrés y la selección de cargas pertenecen a Rivamar.

### Apagado del entorno

```bash
docker compose down
```

## Funcionalidades no disponibles en este corte

- No existe aún una API ejecutable.
- Los tres endpoints no están implementados.
- No existe la imagen del microservicio.
- Nginx no tiene configuración de upstreams ni algoritmo de balanceo.
- No se puede demostrar todavía rotación de IDs ni tolerancia a una réplica caída.
- No existen pruebas de concurrencia, saturación, percentiles, gráficos ni análisis crítico.
- No existe informe PDF final.

## Validaciones realizadas por Lozano

- Rama comprobada: `lozano`.
- Estructura y archivos obligatorios comprobados.
- YAML expandido correctamente con `docker compose config` usando Docker Compose v5.5.1.
- Servicios comprobados: un `nginx` y exactamente `api1`, `api2`, `api3`.
- Publicación comprobada: `8080:80` sólo en Nginx.
- Redes comprobadas: `nginx` en `frontend` y `backend`; las tres APIs sólo en `backend`, marcada como interna.
- Imagen comprobada: las tres APIs declaran `tp3-globallogistics-api:local` y el mismo `service/Dockerfile`.
- `.gitignore` comprobado: permite capturas en `evidencias/` y resultados en `tests/results/`.
- Dependencias pendientes identificadas y documentadas.

No se ejecutó `docker compose up`, no se descargaron imágenes y no se realizaron pruebas de rendimiento.
