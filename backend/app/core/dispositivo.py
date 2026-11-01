"""
Piezas compartidas por los dos routers del dispositivo
(`app/routers/dispositivo.py`, el que llama la ESP, y
`app/routers/dispositivo_medico.py`, el que usa la web del médico).

- La clave del dispositivo (`X-Device-Key`): la ESP no tiene login de médico
  ni de paciente; se identifica con una clave fija que vive en la variable de
  entorno DEVICE_API_KEY. Esa clave sirve sólo para los endpoints
  /dispositivo/..., para nada más.
- El armado del perfil que se manda a la ESP (todo texto, sin acentos).
- Helpers para la fila única de `dispositivo` y para la bitácora.
"""

import hashlib
import ipaddress
import secrets
import socket
import unicodedata
from datetime import datetime, timezone

from fastapi import Header
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT
from app.models.dispositivo import Dispositivo, RegistroSync
from app.models.paciente import Paciente


class _ConfigDispositivo(BaseSettings):
    """
    Se lee aparte de `settings` (app/core/config.py) para no tocar ese
    archivo. Mismo origen: variables de entorno o el `.env` de la raíz.
    """

    device_api_key: str = ""
    # IP de la compu en la red local, para el "código" que se tipea en la ESP
    # (ver `direccion_red_local`). En Docker la escribe `levantar.sh` en un
    # archivo, y la actualiza sola si la compu cambia de red; la variable fija
    # queda para correr la API a mano sin Docker.
    server_lan_ip_archivo: str = ""
    server_lan_ip: str = ""
    # Puerto en el que la compu expone la API (docker-compose: "8000:8000").
    server_lan_puerto: int = 8000

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")


config_dispositivo = _ConfigDispositivo()


def _ip_detectada() -> str | None:
    """
    IP por la que esta máquina sale a la red (mismo truco que
    servidor_prueba/servidor.py: un socket UDP no manda nada, sólo elige la
    interfaz). Sirve cuando la API corre directo en la compu; dentro de
    Docker devuelve la IP interna del contenedor, que la ESP no puede usar.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = ipaddress.ip_address(s.getsockname()[0])
    except (OSError, ValueError):
        return None
    finally:
        s.close()
    # 172.16.0.0/12 es el rango que usa Docker para sus redes internas.
    if ip in ipaddress.ip_network("172.16.0.0/12"):
        return None
    return str(ip)


def _ip_del_archivo() -> str | None:
    """Se lee en cada pedido: así un cambio de red se ve sin reiniciar la API."""
    if not config_dispositivo.server_lan_ip_archivo:
        return None
    try:
        with open(config_dispositivo.server_lan_ip_archivo, encoding="utf-8") as archivo:
            return archivo.read().strip() or None
    except OSError:
        return None


def direccion_red_local() -> dict:
    """
    Lo que la ESP necesita para encontrar a la compu en la red local. La ESP
    completa sola el principio de la IP con el de su propia red
    ("10.200.0.") y el usuario sólo tipea el último número: ese es el
    "código". En la nube esto deja de existir (la ESP usa una URL fija).
    """
    ip = _ip_del_archivo() or config_dispositivo.server_lan_ip.strip() or _ip_detectada()
    return {
        "ip": ip,
        "codigo": ip.rsplit(".", 1)[-1] if ip else None,
        "puerto": config_dispositivo.server_lan_puerto,
    }


class ErrorDispositivo(Exception):
    """
    Error que se le contesta a la ESP con el formato que acordamos:
    `{"ok": false, "error": "texto_sin_acentos", ...extra}` y el código HTTP
    real. Lo convierte en respuesta `RutaDispositivo` (app/routers/dispositivo.py).
    """

    def __init__(self, status: int, error: str, **extra):
        self.status = status
        self.error = error
        self.extra = extra


def exigir_clave_dispositivo(x_device_key: str | None = Header(default=None)) -> None:
    """
    Dependencia de todos los endpoints /dispositivo/...
    - Si el servidor no tiene DEVICE_API_KEY configurada: 503 a todos (mejor
      no dejar pasar a nadie que dejar pasar a cualquiera).
    - Si la clave no coincide: 401.
    `compare_digest` compara sin dar pistas por el tiempo que tarda.
    """
    esperada = config_dispositivo.device_api_key
    if not esperada:
        raise ErrorDispositivo(503, "dispositivo_no_configurado")
    if x_device_key is None or not secrets.compare_digest(x_device_key, esperada):
        raise ErrorDispositivo(401, "clave_invalida")


def ahora_utc() -> datetime:
    """Ahora en UTC sin zona, como se guardan las fechas en la base."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def obtener_dispositivo(db: Session) -> Dispositivo:
    """Devuelve la única fila de `dispositivo`, creándola la primera vez."""
    dispositivo = db.query(Dispositivo).order_by(Dispositivo.id_dispositivo).first()
    if dispositivo is None:
        dispositivo = Dispositivo(archivos_pendientes=0)
        db.add(dispositivo)
        db.flush()
    return dispositivo


def registrar(
    db: Session, dispositivo: Dispositivo, evento: str, detalle: str | None = None, id_medico: int | None = None,
) -> None:
    """Agrega una línea a la bitácora (se guarda con el commit del endpoint)."""
    db.add(RegistroSync(
        id_dispositivo=dispositivo.id_dispositivo,
        momento=ahora_utc(),
        evento=evento,
        detalle=detalle[:255] if detalle else None,
        id_medico=id_medico,
    ))


# --- Perfil para la ESP -----------------------------------------------------


def sin_acentos(texto: str) -> str:
    """
    La pantalla de la ESP no dibuja acentos ni ñ: "Lesión" -> "Lesion",
    "ñ" -> "n". Cualquier otro carácter que no sea ASCII se descarta.
    """
    descompuesto = unicodedata.normalize("NFKD", texto)
    return descompuesto.encode("ascii", "ignore").decode("ascii")


def pin_version(paciente: Paciente) -> str:
    """
    Huella corta del PIN actual, para que la ESP se dé cuenta de que lo
    cambiaron desde la web sin que el PIN viaje nunca. Sale del hash
    guardado (que ya cambia cada vez que se cambia el PIN), así que no revela
    nada del PIN en sí.
    """
    return hashlib.sha256(paciente.pin_hash.encode("utf-8")).hexdigest()[:12]


def _numero(valor: float) -> str:
    """171.0 -> "171", 171.5 -> "171.5" (punto decimal sólo si hace falta)."""
    return f"{valor:g}"


def armar_perfil(paciente: Paciente) -> dict:
    """
    El perfil.json que la ESP guarda en la SD. Todos los valores son texto.
    No lleva PIN: la ESP lo pide en pantalla y lo valida con verificar-pin.
    """
    enfermedades = [
        sin_acentos(e.strip()) for e in (paciente.enfermedades or "").split(",") if e.strip()
    ]
    return {
        "usuario": sin_acentos(paciente.nombre_usuario),
        "nombre": sin_acentos(paciente.nombre or ""),
        "apellido": sin_acentos(paciente.apellido or ""),
        "pin_version": pin_version(paciente),
        "sexo": paciente.sexo,
        "altura": _numero(paciente.altura_cm),
        "peso": _numero(paciente.peso_kg),
        "fumador": "s" if paciente.fumador else "n",
        "nacimiento": paciente.fecha_nacimiento.strftime("%d/%m/%Y"),
        "registro": paciente.fecha_registro.strftime("%d/%m/%Y"),
        "enfermedad": ",".join(enfermedades),
    }
