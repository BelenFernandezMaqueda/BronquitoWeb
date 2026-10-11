from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Paciente(Base):
    """
    TABLA 1: USUARIOS (del documento de arquitectura). La llamamos `Paciente`
    en el código porque es más claro para nosotros, pero la tabla real en
    MySQL se llama `usuarios` — así coincide con lo que definieron.

    Los pacientes se registran desde la web con su perfil completo. El vínculo
    con un médico se crea después, desde la cuenta del médico
    (`POST /medicos/me/vincular`).
    """

    __tablename__ = "usuarios"

    id_paciente: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Sólo letras minúsculas (a-z y ñ), de 4 a 25 — ver
    # `normalizar_nombre_usuario` en app/schemas/auth.py. La collation binaria
    # hace que MySQL compare exacto: con la de por defecto (`_ai_ci`) "nino" y
    # "niño" serían el mismo usuario.
    nombre_usuario: Mapped[str] = mapped_column(
        String(25, collation="utf8mb4_bin"), unique=True, index=True,
    )

    # Se mantienen nullable para admitir perfiles previos a este flujo.
    nombre: Mapped[str | None] = mapped_column(String(80), nullable=True)
    apellido: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # El PIN nunca se guarda en texto plano — se guarda "hasheado" (ver
    # app/core/security.py). Esta columna guarda ese hash, no el PIN en sí.
    pin_hash: Mapped[str] = mapped_column(String(255))

    # Único cuando está presente (MySQL permite varios NULL). Se usa para
    # recuperar el PIN por mail.
    email: Mapped[str | None] = mapped_column(String(160), unique=True, index=True, nullable=True)

    altura_cm: Mapped[float] = mapped_column(Float)
    peso_kg: Mapped[float] = mapped_column(Float)
    fecha_nacimiento: Mapped[date] = mapped_column(Date)
    sexo: Mapped[str] = mapped_column(String(1))  # 'F' / 'M' / 'X'
    fumador: Mapped[bool] = mapped_column(Boolean, default=False)
    enfermedades: Mapped[str | None] = mapped_column(String(160), nullable=True)
    fecha_registro: Mapped[date] = mapped_column(Date)

    # Columna heredada de la base anterior; no forma parte del perfil/API.
    # Se conserva para que instalaciones existentes sigan aceptando altas.
    origen: Mapped[str] = mapped_column(
        String(20), default="WEB", server_default="WEB",
    )

    # Consentimiento informado aceptado durante el registro web.
    acepto_terminos: Mapped[bool] = mapped_column(Boolean, default=False)
    fecha_aceptacion_terminos: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # "Olvidé mi PIN" — mismo mecanismo que el reset de contraseña del médico
    # (ver app/routers/auth.py).
    reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_expira: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    vinculos = relationship("MedicoPaciente", back_populates="paciente")
    evaluaciones = relationship("Evaluacion", back_populates="paciente")
    entrenamientos = relationship("Entrenamiento", back_populates="paciente")
    rutina = relationship("Rutina", back_populates="paciente", uselist=False)
    notas = relationship("NotaMedica", back_populates="paciente")
    frecuencias_recomendadas = relationship("FrecuenciaRecomendada", back_populates="paciente")
