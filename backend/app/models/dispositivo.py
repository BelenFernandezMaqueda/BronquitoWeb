"""
Tablas de la conexión con el dispositivo (la ESP32). No son parte de las 9
tablas del documento de arquitectura: son nuevas y no tocan ninguna de las
existentes, así `create_all` las crea sin migrar nada.

Cómo se hablan la web y la ESP:
  - La ESP siempre inicia la comunicación (la web nunca la llama). Sincroniza
    en momentos puntuales: al arrancar, al tocar un botón, al terminar un
    ejercicio.
  - Lo que la web le quiere pedir a la ESP queda en una cola
    (`SolicitudDispositivo`). La ESP la retira cuando sincroniza, le muestra
    cada pedido al paciente con ACEPTAR / RECHAZAR y avisa cómo le fue.
  - Todo lo que pasa queda anotado en `RegistroSync`, para poder reconstruir
    qué pasó si algo sale mal.
"""

import enum
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TipoSolicitud(str, enum.Enum):
    """Qué le pide la web a la ESP."""

    cargar_perfil = "CARGAR_PERFIL"
    reset = "RESET"
    # Segunda etapa (rutina + frecuencia en CONFIGURACION.JSON); todavía no
    # se crea desde ningún lado.
    rutina = "RUTINA"


class EstadoSolicitud(str, enum.Enum):
    """
    PENDIENTE -> la web la creó, la ESP todavía no la retiró.
    ENTREGADA -> la ESP la retiró; espera que el paciente acepte o rechace.
    CONFIRMADA -> el paciente aceptó y la ESP la aplicó.
    RECHAZADA -> el paciente tocó RECHAZAR en el dispositivo.
    ERROR -> la ESP no la pudo aplicar (ej. "archivos_pendientes").
    CANCELADA -> el médico la canceló desde la web antes de que se aplicara.
    """

    pendiente = "PENDIENTE"
    entregada = "ENTREGADA"
    confirmada = "CONFIRMADA"
    rechazada = "RECHAZADA"
    error = "ERROR"
    cancelada = "CANCELADA"


# Las que todavía pueden pasar a la ESP: la cola "viva".
ESTADOS_ACTIVOS = (EstadoSolicitud.pendiente, EstadoSolicitud.entregada)


class Dispositivo(Base):
    """
    TABLA DISPOSITIVO — una sola fila, porque hay un único dispositivo. Guarda
    a qué paciente está asignado y lo último que la ESP contó de sí misma.
    """

    __tablename__ = "dispositivo"

    id_dispositivo: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Paciente cuyo perfil tiene (o está por tener) cargado. NULL = sin paciente.
    id_paciente: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id_paciente"), nullable=True)

    # Lo que la ESP informó en su último `identificar` (informativo: lo usa
    # la vista del médico). En UTC, sin zona, como el resto de la base.
    ultimo_contacto: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    archivos_pendientes: Mapped[int] = mapped_column(Integer, default=0)
    vacia: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    usuario_reportado: Mapped[str | None] = mapped_column(String(25), nullable=True)

    paciente = relationship("Paciente")


class SolicitudDispositivo(Base):
    """
    TABLA SOLICITUDES_DISPOSITIVO — la cola web -> ESP. La ESP las procesa en
    orden de `id_solicitud`.

    `payload` es lo que viaja a la ESP tal cual (sin acentos). Nunca lleva el
    PIN: la ESP se lo pide al paciente y lo valida con
    `POST /dispositivo/verificar-pin`.
    """

    __tablename__ = "solicitudes_dispositivo"

    id_solicitud: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_dispositivo: Mapped[int] = mapped_column(ForeignKey("dispositivo.id_dispositivo"), index=True)
    tipo: Mapped[TipoSolicitud] = mapped_column(Enum(TipoSolicitud, native_enum=False, length=20))
    estado: Mapped[EstadoSolicitud] = mapped_column(
        Enum(EstadoSolicitud, native_enum=False, length=20), default=EstadoSolicitud.pendiente,
    )
    payload: Mapped[dict] = mapped_column(JSON)

    # Quién la pidió y a qué paciente apunta. Ninguno de los dos viaja a la ESP.
    #   - CARGAR_PERFIL: el paciente cuyo perfil se carga.
    #   - RESET: el paciente "de reemplazo" (cambiar usuario), o NULL si sólo
    #     se formatea. Se asigna al dispositivo recién cuando la ESP confirma.
    id_medico: Mapped[int | None] = mapped_column(ForeignKey("medicos.id_medico"), nullable=True)
    id_paciente_destino: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id_paciente"), nullable=True,
    )

    # Lo que contestó la ESP (ej. "archivos_pendientes", "rechazado_por_usuario").
    detalle: Mapped[str | None] = mapped_column(String(255), nullable=True)

    creada_en: Mapped[datetime] = mapped_column(DateTime)
    entregada_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Cuándo la ESP respondió (aceptada, rechazada o error).
    confirmada_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    paciente_destino = relationship("Paciente", foreign_keys=[id_paciente_destino])


class ArchivoDispositivo(Base):
    """
    TABLA ARCHIVOS_DISPOSITIVO — cada prueba que la ESP subió desde su SD
    (`POST /dispositivo/evaluaciones`, ver app/core/evaluaciones_dispositivo.py).

    Guarda el `.json` tal cual vino, así no se pierde nada de lo que la web
    todavía no muestra (pico, intentos, BEV, factor BTPS...) ni las pruebas
    que no aparecen en la web (espirometrías inválidas, PIM en cero).

    También sirve para no duplicar: si la ESP vuelve a mandar un archivo que
    ya llegó (ej. se cortó la luz antes de marcarlo como sincronizado), se
    reconoce por la huella del contenido.
    """

    __tablename__ = "archivos_dispositivo"

    id_archivo: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_paciente: Mapped[int] = mapped_column(ForeignKey("usuarios.id_paciente"), index=True)
    # Nombre del archivo en la SD, sin la extensión (ej. "eval_20261030_162009_ESP").
    nombre: Mapped[str] = mapped_column(String(80))
    # Las pruebas de una misma calibración (PIM + espirometría + intentos) comparten este id.
    calibracion_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # SHA-256 del contenido (.json sin "sincronizado" + .csv).
    huella: Mapped[str] = mapped_column(String(64), index=True)
    resumen: Mapped[dict] = mapped_column(JSON)
    # `fecha_hora` que se le asignó a la sesión (para las pruebas sin hora, la inventada).
    fecha_hora: Mapped[datetime] = mapped_column(DateTime)

    # La evaluación que se creó en la web. NULL si no se muestra; `motivo_oculta` dice por qué.
    id_evaluacion: Mapped[int | None] = mapped_column(ForeignKey("evaluaciones.id_evaluacion"), nullable=True)
    motivo_oculta: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # En UTC, sin zona, como el resto de las fechas de la base.
    recibido_en: Mapped[datetime] = mapped_column(DateTime)


class RegistroSync(Base):
    """
    TABLA REGISTRO_SYNC — bitácora de todo lo que pasa entre la web y la ESP
    (cada sincronización, cada pedido de un médico, cada respuesta).
    """

    __tablename__ = "registro_sync"

    id_registro: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_dispositivo: Mapped[int] = mapped_column(ForeignKey("dispositivo.id_dispositivo"), index=True)
    momento: Mapped[datetime] = mapped_column(DateTime)
    evento: Mapped[str] = mapped_column(String(40))
    detalle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    id_medico: Mapped[int | None] = mapped_column(ForeignKey("medicos.id_medico"), nullable=True)
