from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MedicoPaciente(Base):
    """
    TABLA 3: MEDICO_PACIENTE. Vinculación DIRECTA (decidiste esto explícito):
    el médico ingresa el nombre de usuario + PIN del paciente y toca
    "Vincular", y esta fila se crea al toque — no hay estado
    pendiente/aceptado que gestionar por ahora.

    `fecha_vinculacion` es lo único que agregamos por nuestra cuenta a tu
    par de columnas original (ID_MEDICO, ID_PACIENTE): sirve para ordenar u
    ordenar/auditar quién se vinculó cuándo. Si no la querés, se borra sin
    romper nada más.
    """

    __tablename__ = "medico_paciente"

    id_medico: Mapped[int] = mapped_column(ForeignKey("medicos.id_medico"), primary_key=True)
    id_paciente: Mapped[int] = mapped_column(ForeignKey("usuarios.id_paciente"), primary_key=True)
    fecha_vinculacion: Mapped[datetime] = mapped_column(DateTime)

    medico = relationship("Medico", back_populates="vinculos")
    paciente = relationship("Paciente", back_populates="vinculos")
