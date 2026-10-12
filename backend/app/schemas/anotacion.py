from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

# Se recortan los espacios antes de validar el largo, así "   " cuenta como vacía.
TextoNota = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class AnotacionOut(BaseModel):
    """Una nota de un médico: sobre un punto de un gráfico, o general de una sesión."""

    model_config = ConfigDict(from_attributes=True)

    id_anotacion: int
    id_medico: int
    autor: str
    sesion: datetime | None
    grafico: str | None
    punto: str | None
    texto: str
    creado_en: datetime
    editado_en: datetime | None

    @field_validator("creado_en", "editado_en")
    @classmethod
    def _marcar_como_utc(cls, valor: datetime | None) -> datetime | None:
        """
        La base las guarda en UTC pero sin zona; se la agregamos para que el
        front las muestre en hora argentina y no 3 horas corridas. `sesion`
        no se toca: tiene que salir idéntica al `fecha_hora` de la evaluación.
        """
        if valor is not None and valor.tzinfo is None:
            return valor.replace(tzinfo=timezone.utc)
        return valor


class AnotacionCrearRequest(BaseModel):
    texto: TextoNota
    sesion: datetime | None = None
    grafico: str | None = Field(default=None, min_length=1, max_length=120)
    punto: str | None = Field(default=None, min_length=1, max_length=60)

    @model_validator(mode="after")
    def _nota_de_punto_o_de_sesion(self):
        if (self.grafico is None) != (self.punto is None):
            raise ValueError("Una nota en un gráfico necesita el gráfico y el punto.")
        if self.grafico is None and self.sesion is None:
            raise ValueError("Un comentario general tiene que ser de una sesión.")
        return self


class AnotacionEditarRequest(BaseModel):
    texto: TextoNota
