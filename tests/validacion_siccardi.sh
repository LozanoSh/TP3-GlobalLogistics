#!/usr/bin/env bash
# Validación funcional de la etapa de Siccardi (no es la prueba de estrés).
# Uso, desde la raíz del repositorio con el entorno levantado:
#   bash tests/validacion_siccardi.sh | tee evidencias/validacion_siccardi.txt
set -u

BASE="${BASE:-http://localhost:8080}"
FALLOS=0

seccion() { printf '\n===== %s =====\n' "$1"; }
ok()      { printf '[OK]    %s\n' "$1"; }
falla()   { printf '[FALLA] %s\n' "$1"; FALLOS=$((FALLOS + 1)); }


# Hace N peticiones y devuelve las instancias y códigos HTTP observados.
rafaga() {
  local n="$1" i code
  for ((i = 1; i <= n; i++)); do
    code=$(curl -s --max-time 5 -o /tmp/tp3_resp.json -w '%{http_code}' "$BASE/api/instancia")
    printf '%s %s\n' "$code" "$(sed -n 's/.*"instancia":"\([^"]*\)".*/\1/p' /tmp/tp3_resp.json)"
  done
}

esperar_healthy() {
  local servicio="$1" i estado
  for ((i = 1; i <= 30; i++)); do
    estado=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q "$servicio")" 2>/dev/null)
    [ "$estado" = "healthy" ] && { echo "$servicio healthy tras ~$((i * 2)) s"; return 0; }
    sleep 2
  done
  return 1
}

seccion "Fecha y versiones"
date -u '+%Y-%m-%dT%H:%M:%SZ'
docker version --format 'Docker Engine {{.Server.Version}}'
docker compose version

seccion "1. Contenedores (docker compose ps)"
docker compose ps
N=$(docker compose ps -q | wc -l | tr -d ' ')
[ "$N" -eq 4 ] && ok "Hay exactamente 4 contenedores" || falla "Se esperaban 4 contenedores y hay $N"

seccion "2-3. Health checks de Docker"
for s in api1 api2 api3 nginx; do
  e=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q "$s")")
  echo "$s: $e"
  [ "$e" = "healthy" ] && ok "$s healthy" || falla "$s en estado $e"
done
seccion "Health público vía Nginx"
curl -s -i "$BASE/health"; echo
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")
[ "$code" = "200" ] && ok "GET /health -> 200" || falla "GET /health -> $code"

seccion "4-5. Balanceo round-robin en /api/instancia (9 peticiones)"
R=$(rafaga 9); echo "$R"
DISTINTAS=$(echo "$R" | awk '{print $2}' | sort -u | wc -l | tr -d ' ')
[ "$DISTINTAS" -eq 3 ] && ok "Respondieron 3 réplicas distintas" || falla "Respondieron $DISTINTAS réplicas"
echo "Respuesta completa de ejemplo:"
curl -s "$BASE/api/instancia"; echo
echo "IDs reales de contenedor según Docker:"
docker compose ps -q | xargs docker inspect -f '{{.Name}} {{.Id}}'

seccion "6. /api/cpu: carga válida e inválida"
for w in 1 100 500 2000; do
  printf 'work=%s -> ' "$w"; curl -s "$BASE/api/cpu?work=$w"; echo
done
for w in abc 0 -5 1.5 2001 ''; do
  code=$(curl -s -o /tmp/tp3_resp.json -w '%{http_code}' "$BASE/api/cpu?work=$w")
  printf 'work=%-5s -> %s %s\n' "'$w'" "$code" "$(cat /tmp/tp3_resp.json)"
  [ "$code" = "400" ] && ok "work='$w' rechazado con 400" || falla "work='$w' devolvió $code"
done
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cpu")
[ "$code" = "400" ] && ok "Sin work -> 400" || falla "Sin work -> $code"

seccion "7a. Caída controlada de api2 (docker compose stop api2)"
docker compose stop api2
R=$(rafaga 9); echo "$R"
echo "$R" | grep -qv '^200 ' && falla "Hubo respuestas no 200 con api2 detenida" || ok "Todas las respuestas 200 con api2 detenida"
echo "$R" | grep -q 'api2' && falla "api2 respondió estando detenida" || ok "api2 no recibió tráfico"

seccion "8a. Recuperación de api2 (docker compose start api2)"
docker compose start api2
esperar_healthy api2 || falla "api2 no volvió a healthy"
sleep 11  # más que fail_timeout y resolver valid de Nginx
R=$(rafaga 9); echo "$R"
echo "$R" | grep -q 'api2' && ok "api2 vuelve a recibir tráfico" || falla "api2 no volvió a recibir tráfico"

seccion "7b. Caída abrupta de api3 (docker compose kill api3, SIGKILL)"
docker compose kill api3
R=$(rafaga 9); echo "$R"
echo "$R" | grep -qv '^200 ' && falla "Hubo respuestas no 200 con api3 caída" || ok "Todas las respuestas 200 con api3 caída"
echo "Log de Nginx durante la caída (detección pasiva):"
docker compose logs --since 30s nginx | grep -E 'api3|error|upstream' | tail -10

seccion "8b. Recuperación de api3 (docker compose start api3)"
docker compose start api3
esperar_healthy api3 || falla "api3 no volvió a healthy"
sleep 11
R=$(rafaga 9); echo "$R"
echo "$R" | grep -q 'api3' && ok "api3 vuelve a recibir tráfico" || falla "api3 no volvió a recibir tráfico"

seccion "Estado final"
docker compose ps

seccion "Resultado"
if [ "$FALLOS" -eq 0 ]; then echo "VALIDACIÓN OK"; else echo "VALIDACIÓN CON $FALLOS FALLAS"; fi
exit "$FALLOS"
