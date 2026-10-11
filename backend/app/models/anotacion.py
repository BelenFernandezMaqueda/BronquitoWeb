from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Anotacion(Base):
    """
    TABLA ANOTACIONES — notas que los médicos dejan sobre un punto de un
    gráfico, o comentarios generales de una sesión de evaluación.

    `grafico` y `punto` son claves que arma el front y la API no interpreta
    (ver frontend/src/anotaciones/useAnotaciones.ts), así cualquier gráfico
    nuevo se puede anotar sin tocar la base:
    - Nota en un punto: `grafico` dice en qué gráfico está (ej.
      "evaluacion/12/flujo-tiempo") y `punto` qué punto de ese gráfico (ej.
      el índice de la muestra).
    - Comentario general de una sesión: `grafico` y `punto` en NULL.

    `sesion` es el `fecha_hora` de la sesión de consultorio (espirometría +
    PIM) a la que pertenece la nota, si pertenece a una.

    La nota es del paciente, no del médico: la ven todos los médicos
    vinculados, pero sólo quien la escribió (`id_medico`) la puede editar o
    borrar. El paciente no la ve.
    """

    __tablename__ = "anotaciones"

    id_anotacion: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    id_paciente: Mapped[int] = mapped_column(ForeignKey("usuarios.id_paciente"), index=True)
    id_medico: Mapped[int] = mapped_column(ForeignKey("medicos.id_medico"))

    sesion: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    grafico: Mapped[str | None] = mapped_column(String(120), nullable=True)
    punto: Mapped[str | None] = mapped_column(String(60), nullable=True)

    texto: Mapped[str] = mapped_column(Text)
    # En UTC (sin zona, como el resto de las fechas de la base).
    creado_en: Mapped[datetime] = mapped_column(DateTime)
    editado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    medico = relationship("Medico")

    @property
    def autor(self) -> str:
        """Nombre del médico que la escribió, para mostrarlo junto a la nota."""
        return f"{self.medico.nombre} {self.medico.apellido}"
