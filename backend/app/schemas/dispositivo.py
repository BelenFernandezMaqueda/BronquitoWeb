from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_serializer, field_validator

from app.models.dispositivo import EstadoSolicitud, TipoSolicitud
from app.schemas.auth import normalizar_nombre_usuario

# --- Lo que manda la ESP ----------------------------------------------------


class IdentificarRequest(BaseModel):
    """Cómo está la ESP en este momento."""

    vacia: bool
    usuario_actual: str | None = Field(default=None, max_length=25)
    archivos_pendientes: int = Field(default=0, ge=0)


class ConfirmarRequest(BaseModel):
    """
    ok=true: el paciente aceptó y se aplicó.
    ok=false: no se aplicó; `detalle` dice por qué ("rechazado_por_usuario",
    "archivos_pendientes" u otro texto corto).
    """

    ok: bool
    detalle: str | None = Field(default=None, max_length=255)


class VerificarPinRequest(BaseModel):
    usuario: str = Field(max_length=25)
    pin: str = Field(pattern=r"^\d{4}$")


# --- Lo que manda la web del médico -------------------------------------------


class AsignarRequest(BaseModel):
    nombre_usuario: str

    @field_validator("nombre_usuario")
    @classmethod
    def nombre_usuario_valido(cls, valor: str) -> str:
        return normalizar_nombre_usuario(valor)


class FormatearRequest(BaseModel):
    """Si viene `nombre_usuario_reemplazo`, es "cambiar usuario"."""

    nombre_usuario_reemplazo: str | None = None

    @field_validator("nombre_usuario_reemplazo")
    @classmethod
    def nombre_usuario_valido(cls, valor: str | None) -> str | None:
        return normalizar_nombre_usuario(valor) if valor else None


# --- Lo que ve la web del médico ----------------------------------------------


def _iso_utc(valor: datetime | None) -> str | None:
    """Las fechas se guardan en UTC sin zona; se mandan con zona para que el
    navegador las pase bien a la hora local."""
    if valor is None:
        return None
    return valor.replace(tzinfo=timezone.utc).isoformat()


class SolicitudOut(BaseModel):
    id_solicitud: int
    tipo: TipoSolicitud
    estado: EstadoSolicitud
    detalle: str | None
    # Usuario del paciente de reemplazo (sólo en un "cambiar usuario").
    reemplazo: str | None
    creada_en: datetime
    entregada_en: datetime | None
    confirmada_en: datetime | None
    # True si este médico la puede cancelar ahora.
    cancelable: bool

    @field_serializer("creada_en", "entregada_en", "confirmada_en")
    def _fechas(self, valor: datetime | None) -> str | None:
        return _iso_utc(valor)


class PacienteAsignadoOut(BaseModel):
    id_paciente: int
    nombre_usuario: str
    nombre: str | None
    apellido: str | None


class ConexionOut(BaseModel):
    """
    Cómo encuentra la ESP a la compu en la red local. `codigo` es el último
    número de la IP: lo único que se tipea en la ESP. En null si no se pudo
    averiguar la IP (ver levantar.sh).
    """

    ip: str | None
    codigo: str | None
    puerto: int


class EstadoDispositivoOut(BaseModel):
    """
    Lo que muestra el panel del dispositivo en la vista del médico.

    Si el paciente asignado no está en la lista de este médico,
    `paciente` y `usuario_en_dispositivo` vienen en null y
    `asignado_a_otro` en true: se sabe que está ocupado, pero no por quién.
    """

    paciente: PacienteAsignadoOut | None
    asignado_a_otro: bool
    # Puede asignar / formatear / cambiar usuario.
    puede_operar: bool
    ultimo_contacto: datetime | None
    archivos_pendientes: int
    vacia: bool | None
    usuario_en_dispositivo: str | None
    # La última solicitud (activa o ya resuelta), para mostrar su estado.
    solicitud: SolicitudOut | None
    conexion: ConexionOut

    @field_serializer("ultimo_contacto")
    def _fecha(self, valor: datetime | None) -> str | None:
        return _iso_utc(valor)


class DispositivoPacienteOut(BaseModel):
    """
    Lo que ve el paciente: sólo para conectar y sincronizar (no puede
    formatear ni asignar). `ultimo_contacto` y `pin_actualizado` vienen en
    null si el dispositivo no está asignado a este paciente.
    """

    asignado: bool
    ultimo_contacto: datetime | None
    # True si el dispositivo ya validó el PIN actual (ej. después de
    # "Olvidé mi PIN" hay que sincronizar para que lo pida de nuevo).
    pin_actualizado: bool | None
    conexion: ConexionOut

    @field_serializer("ultimo_contacto")
    def _fecha(self, valor: datetime | None) -> str | None:
        return _iso_utc(valor)
