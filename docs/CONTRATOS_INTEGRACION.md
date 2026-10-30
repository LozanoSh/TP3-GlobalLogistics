# Contratos de integración

> Actualización de Lozano: el servicio replicado representa Gestión de Envíos. La descripción histórica de la preparación de infraestructura se conserva debajo.

## `POST /envios/validar`

Valida una solicitud de alta internacional con la estructura `CrearEnvioRequest` del OpenAPI del TP2. Nginx reenvía el body JSON a una de las tres réplicas sin caché ni reintento automático del POST. La API no persiste datos.

- Entrada: `Content-Type: application/json`, con `remitente`, `destinatario`, `paquete` y `servicio` obligatorios; `referenciaCliente` es opcional.
- Cada dirección requiere `nombre` (2–120 caracteres), `pais` (dos letras mayúsculas), `direccion` (5–200) y `codigoPostal` (2–20).
- El paquete requiere `pesoKg` (0.01–1000), `descripcion` (3–300) y `valorDeclarado` con `moneda` (tres letras mayúsculas) y `montoMinor` (entero positivo `int64`, validado a partir del literal JSON para conservar precisión).
- `servicio`: `ESTANDAR` o `EXPRESS`. `referenciaCliente`, si se envía, admite 1–64 caracteres. Como en el OpenAPI del TP2, se rechazan propiedades adicionales.
- Éxito: HTTP `200`, `valido: true`, nombre de servicio, tipo, origen, destino, peso, hostname de la réplica e ID real del contenedor.
- Error de estructura, tipo, rango, formato o JSON malformado: HTTP `400`, `valido: false` y lista `errores` con `campo` y `detalle`.

`POST /envios/validar` no equivale a `POST /envios/crear`: no autentica, no reserva claves de idempotencia, no crea un `envioId`, no escribe en una base de datos ni publica eventos mediante outbox. Ver [ADAPTACION_TP2_TP3.md](ADAPTACION_TP2_TP3.md).

Este documento fija las convenciones entre la infraestructura preparada por Lozano, la implementación de Siccardi y las pruebas de Rivamar. No contiene código de los endpoints.

## Servicios y conectividad

| Servicio | Puerto del contenedor | Publicado en el host | Responsabilidad |
|---|---:|---:|---|
| `nginx` | `80` | `8080` | Entrada única y balanceo hacia las tres APIs. |
| `api1` | `3000` | No | Primera réplica del mismo microservicio. |
| `api2` | `3000` | No | Segunda réplica del mismo microservicio. |
| `api3` | `3000` | No | Tercera réplica del mismo microservicio. |

`nginx` pertenece a `frontend` (bridge no interna) y a `backend` (bridge interna). Las tres APIs pertenecen sólo a `backend`. El puerto `8080:80` se publica únicamente en Nginx para recibir solicitudes desde `localhost:8080`. Nginx debe resolver las réplicas por sus nombres de servicio (`api1:3000`, `api2:3000` y `api3:3000`); no se deben fijar direcciones IP de contenedor.

Las tres APIs declaran la misma imagen `tp3-globallogistics-api:local`, construida desde `service/Dockerfile`. Compose les entrega `PORT=3000` y un `INSTANCE_ID` diferente. La identidad expuesta debe provenir del hostname o ID real del contenedor; `INSTANCE_ID` sirve como apoyo de diagnóstico, no para devolver una respuesta idéntica o ficticia desde todas las réplicas.

## `GET /api/instancia`

Objetivo: demostrar de manera observable qué réplica respondió.

- Respuesta exitosa: HTTP `200`.
- Tipo de contenido: `application/json`.
- Campo mínimo: `instancia`, cadena no vacía con el hostname o ID real de la instancia.
- El valor debe permanecer estable durante la vida del contenedor y diferenciar las tres réplicas.
- Nginx debe reenviar la ruta sin cachear la respuesta.

Ejemplo orientativo del contrato, no de una instancia fija:

```json
{
  "instancia": "api1"
}
```

## `GET /health`

Objetivo: indicar si una réplica puede recibir tráfico.

- Una instancia saludable devuelve HTTP `200` con rapidez y sin trabajo intensivo.
- El cuerpo puede ser mínimo; se recomienda `{"estado":"ok","instancia":"<hostname>"}` para facilitar el diagnóstico.
- Una instancia que no puede atender peticiones no debe responder `200`.
- La imagen debe incluir `wget`, que usa el probe inicial de Compose, o Siccardi debe adaptar el comando de `healthcheck` a una herramienta presente en la imagen.
- Nginx debe exponer `/health` en el puerto `8080` y configurar el tratamiento de fallos de upstream que corresponda a su estrategia de balanceo.

Compose consulta `http://127.0.0.1:3000/health` dentro de cada API. El inicio de Nginx queda condicionado a que las tres réplicas alcancen el estado `healthy`.

## `GET /api/cpu?work=N`

Objetivo: producir trabajo computacional controlado para el escenario de saturación de CPU.

- `work` debe ser un entero positivo.
- Los valores ausentes, no enteros o fuera de los límites que defina Siccardi deben responder HTTP `400`.
- Siccardi debe definir y documentar un límite máximo seguro para evitar ejecuciones accidentales sin cota.
- El trabajo debe consumir CPU de manera reproducible; no debe simularse con pausas, acceso a red o esperas de E/S.
- La respuesta HTTP `200` debe identificar la instancia y reflejar el valor de `work`. Puede incluir duración y resultado si se documentan de forma estable.
- Nginx no debe cachear la respuesta ni alterar el query string.

La fórmula concreta, los límites y el esquema final de respuesta son responsabilidad de Siccardi. Rivamar deberá usar valores documentados y aumentar la carga de forma controlada.

## Criterios generales de integración

1. Mantener exactamente los nombres `nginx`, `api1`, `api2` y `api3`.
2. Mantener `8080:80` como única publicación al host y `3000` como puerto interno de las APIs.
3. Implementar una única base de código y una única imagen para las tres réplicas.
4. No incorporar estado local que cambie el comportamiento funcional entre réplicas.
5. No codificar IPs de contenedores ni una identidad ficticia compartida.
6. Conservar las tres rutas y su semántica para que las pruebas sean reproducibles.
7. Evitar secretos en Compose o en el repositorio; usar variables locales ignoradas si luego fueran necesarias.
8. Documentar cualquier ajuste al probe, algoritmo de balanceo o límite de CPU en el README y en el traspaso siguiente.

## Criterios observables para Siccardi

- `docker compose config` no informa errores.
- `docker compose up -d --build` deja cuatro contenedores en ejecución y saludables.
- `docker compose ps` muestra una única publicación `0.0.0.0:8080->80/tcp` para Nginx.
- Varias solicitudes a `http://localhost:8080/api/instancia` permiten observar más de un ID real.
- `http://localhost:8080/health` devuelve `200` con las réplicas saludables.
- Una petición válida a `/api/cpu` realiza trabajo computacional; entradas inválidas reciben `400` sin derribar el servicio.
