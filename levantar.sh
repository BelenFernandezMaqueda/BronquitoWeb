#!/bin/sh
# Levanta Bronquito con Docker y le pasa a la API la IP de esta compu en la
# red local. La web la muestra en "Conectar a dispositivo" como el código
# (el último número) que se tipea en la ESP.
#
# Desde adentro de Docker no se puede averiguar esa IP, así que este script
# la escribe en .red_local/ip (la API lee ese archivo) y deja un vigilante en
# segundo plano que la actualiza cada 5 s si la compu cambia de red. El
# vigilante se apaga solo cuando se apaga la API (docker compose down/stop).
#
# Uso:  ./levantar.sh            (los argumentos extra van a docker compose up,
#       ./levantar.sh --build     ej. --build después de cambiar código)

cd "$(dirname "$0")" || exit 1
CARPETA=.red_local
mkdir -p "$CARPETA"

ip_actual() {
  ip=""
  # macOS: probar las interfaces más comunes (WiFi suele ser en0).
  if command -v ipconfig >/dev/null 2>&1; then
    for interfaz in en0 en1 en2; do
      ip=$(ipconfig getifaddr "$interfaz" 2>/dev/null) && [ -n "$ip" ] && break
    done
  fi
  # Linux.
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  echo "$ip"
}

api_corriendo() {
  [ -n "$(docker compose ps --status running -q api 2>/dev/null)" ]
}

vigilar() {
  # Se apaga después de 3 vueltas seguidas (15 s) sin la API: así no se
  # muere mientras Docker recrea el contenedor en un `--build`.
  sin_api=0
  while [ "$sin_api" -lt 3 ]; do
    if api_corriendo; then sin_api=0; else sin_api=$((sin_api + 1)); fi
    ip=$(ip_actual)
    if [ "$ip" != "$(cat "$CARPETA/ip" 2>/dev/null)" ]; then
      echo "$ip" > "$CARPETA/ip"
    fi
    sleep 5
  done
  rm -f "$CARPETA/vigilante.pid"
}

ip=$(ip_actual)
echo "$ip" > "$CARPETA/ip"
if [ -z "$ip" ]; then
  echo "No pude detectar la IP de esta compu. ¿Estás conectada a una red?"
  echo "Igual levanto todo; el código aparece solo cuando te conectes."
else
  echo "IP de esta compu: $ip  ->  código para la ESP: ${ip##*.}"
fi

docker compose up -d "$@" || exit 1

# Un solo vigilante por vez.
pid=$(cat "$CARPETA/vigilante.pid" 2>/dev/null)
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  echo "El vigilante de IP ya estaba corriendo."
else
  # Ignorar SIGHUP: que siga vivo aunque se cierre esta terminal.
  (trap '' HUP; vigilar) > /dev/null 2>&1 &
  echo $! > "$CARPETA/vigilante.pid"
  echo "Vigilando la IP: si cambiás de red, el código se actualiza solo."
fi
