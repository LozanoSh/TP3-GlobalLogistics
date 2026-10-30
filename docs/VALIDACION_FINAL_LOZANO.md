# Validación final de Lozano — 30/10/2026

## Veredicto

**Integración detenida.** Las 28 pruebas HTTP locales y la configuración de Compose pasan, pero Docker Desktop no expone su daemon Linux en este equipo. No se pudieron levantar los cuatro contenedores ni comprobar `/envios/validar` mediante Nginx. Por el criterio obligatorio de la entrega, no se creó un Pull Request, no se fusionó `lozano` a `main` y no se actualizó `rivamar`.

## Estado de Git y copia local

La carpeta local de trabajo `TP3-GlobalLogistics-lozano` fue reconstruida desde GitHub y no contiene `.git`; por eso `git status`, `git branch -avv`, `git fetch origin` y `git log` responden `fatal: not a git repository`. La copia original `TP3-GlobalLogistics` también carece de `.git` y permanece intacta. Se verificaron las referencias remotas mediante la conexión de GitHub: `main` y `rivamar` apuntan a `f929290875b84d687010faa2d6682a15efa342de`, y `lozano` a `da562171161c3b94457739e87d3fd4852b2d36dc` antes de este registro. La comparación indica que `lozano` está un commit adelante de `main`, sin commits detrás. No se modificaron `main`, `siccardi` ni `rivamar`.

## Comandos y resultados

| Comando | Resultado |
|---|---|
| `docker version` | Falla: no existe el pipe `dockerDesktopLinuxEngine`. |
| `docker info` | Falla por la misma causa. |
| `docker compose version` | OK: v5.5.1. |
| `docker compose config -q` y `docker compose config --services` | OK: configuración válida; `api1`, `api2`, `api3`, `nginx`. |
| `npm ci --offline=false` en `service/` | OK: 68 paquetes instalados; npm informó 0 vulnerabilidades. |
| `npm test` en `service/` | OK: 28 pruebas aprobadas, 0 fallidas. |
| `docker compose up -d --build` y `docker compose ps` | No ejecutados en esta validación: el daemon no está disponible. |
| `node tests/validacion_envios.js` | Bloqueado: requiere Nginx y las tres réplicas en ejecución. |
| `bash tests/validacion_siccardi.sh` | Bloqueado por Docker; además detiene y reinicia réplicas. |

Se intentó `docker desktop start`, que indicó que la aplicación ya estaba abierta. `docker desktop restart` no completó y se canceló tras no habilitar el daemon. `com.docker.service` figura detenido y Windows no permitió iniciarlo desde este entorno (`CouldNotStartService`). La distribución WSL `docker-desktop` figura detenida. Esto identifica el impedimento del entorno; no demuestra un fallo de los archivos Compose o del servicio.

## Criterios de aceptación

| Criterio | Estado | Evidencia |
|---|---|---|
| Pruebas locales del servicio y endpoints técnicos | Aprobado | [`validacion_final_lozano_npm_test.txt`](../evidencias/validacion_final_lozano_npm_test.txt) |
| Configuración Compose de cuatro servicios | Aprobado en validación estática | `docker compose config -q` y `--services`; [`validacion_final_lozano_docker.txt`](../evidencias/validacion_final_lozano_docker.txt) |
| Cuatro contenedores saludables y una sola publicación 8080 | Bloqueado | Daemon Docker inaccesible. |
| Nueve POST válidos y reparto entre `api1`, `api2`, `api3` | Bloqueado | No se pudo ejecutar `tests/validacion_envios.js`. |
| IDs reales de contenedor coincidentes con Docker | Bloqueado | No hay contenedores en ejecución para comparar. |
| Respuestas 400 por Nginx, logs de upstream y regresión de Siccardi | Bloqueado | Nginx no pudo iniciarse. |
| Capturas nuevas de `docker compose ps` y balanceo de negocio | Bloqueado | No se fabricaron capturas ni se reutilizaron las de Siccardi. |
| PR, revisión de checks, fusión a `main` y actualización de `rivamar` | No iniciado | La validación integrada obligatoria no se completó. |

## Para reanudar

Con Docker Desktop y su daemon Linux operativos, ejecutar desde la raíz `docker compose up -d --build`, `docker compose ps`, `docker compose logs --tail=100 nginx api1 api2 api3` y `node tests/validacion_envios.js`. Comprobar los IDs contra `docker inspect`, guardar las cinco evidencias solicitadas y ejecutar `bash tests/validacion_siccardi.sh` si Bash está disponible. Sólo si todo pasa, revisar el diff y los checks, crear el PR `lozano` → `main`, fusionarlo y actualizar `rivamar` preservando cualquier trabajo propio.
