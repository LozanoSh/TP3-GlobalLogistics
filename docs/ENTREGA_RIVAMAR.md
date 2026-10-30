# Entrega de Rivamar — pruebas de rendimiento

## Implementación preparada

- Escenarios k6 de referencia, 100 usuarios concurrentes y carga de CPU.
- Payload de Gestión de Envíos compartido, checks de HTTP 200, `valido: true` e instancia identificada.
- Runner PowerShell que conserva resumen y métricas k6, metadatos, muestreo de CPU/memoria por contenedor y probes `/health` y `/nginx-health`.
- Runner de escalones con `work` constante para permitir comparar concurrencia.
- README, reporte de rendimiento y borrador integral del TP3.

## Archivos

Scripts: `tests/k6_common.js`, `tests/k6_escenario_referencia.js`, `tests/k6_escenario_moderado.js`, `tests/k6_escenario_extremo.js`, `tests/run_stress.ps1`, `tests/run_extreme_ladder.ps1`.

Documentos: `docs/REPORTE_RENDIMIENTO.md`, `docs/INFORME_TP3_BORRADOR.md`, este traspaso y README actualizado.

## Comandos para reproducir

Con Docker Desktop iniciado y k6 instalado:

```powershell
docker compose up -d --build
node tests/validacion_envios.js
./tests/run_stress.ps1 -Escenario referencia -Vus 5 -Duracion 30s
./tests/run_stress.ps1 -Escenario moderado -Vus 100 -Duracion 45s
./tests/run_extreme_ladder.ps1 -Escalones 10,25,50,100,200 -Work 100 -Duracion 30s
```

Si una escalera muestra degradación fuerte, detener niveles posteriores o excluir 200 VU según capacidad de la máquina. Para cambiar `work`, ejecutar otra escalera separada con un valor constante por serie. Resultados fechados se escriben en `tests/results/`.

## Pruebas ejecutadas y estado

- `npm ci`: completado, 0 vulnerabilidades reportadas por npm.
- `npm test`: 28/28 pruebas aprobadas.
- `docker compose config -q`: correcto; topología de cuatro servicios.
- `docker version` / `docker info`: el daemon no estaba disponible; error de pipe `dockerDesktopLinuxEngine`.
- `docker compose up`, `docker compose ps`, `node tests/validacion_envios.js` por Nginx y cargas k6: no ejecutados por ese bloqueo.
- k6 no estaba instalado al iniciar el trabajo.

La salida literal de las verificaciones de esta sesión está en `evidencias/validacion_rivamar_local.txt`. No se reutilizaron capturas viejas como resultados de esta API y no se generaron métricas sintéticas.

## Resultados y problemas

Hay resultados unitarios verificables, pero no mediciones de rendimiento, reparto por Nginx, contenedores healthy o CPU del contenedor en esta máquina. En consecuencia, el punto de degradación y el cumplimiento de latencia máxima permanecen indeterminados. El reporte deja explícito qué evidencia falta y cuál es el criterio de degradación para la próxima corrida.

## Instrucciones para Lozano

1. Iniciar Docker Desktop y confirmar que `docker info` devuelve Server.
2. Instalar k6 y verificar `k6 version`.
3. Ejecutar `docker compose up -d --build`, `docker compose ps` y `node tests/validacion_envios.js`.
4. Ejecutar referencia, 100 VU y escalera extrema según README; conservar carpetas `tests/results/`.
5. Completar tablas, gráficos y conclusión numérica del reporte desde esas métricas.
6. Obtener capturas auténticas del nuevo despliegue y actualizar el borrador PDF. La entrega final y la integración a `main` quedan a cargo de Lozano.

La rama de trabajo es `rivamar`; los dos commits previos de Lozano fueron incorporados por fast-forward local desde `origin/lozano`. No hubo push durante esta sesión.
