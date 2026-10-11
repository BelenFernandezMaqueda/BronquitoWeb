from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.auth import normalizar_nombre_usuario


class MedicoPerfilOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_medico: int
    usuario: str
    nombre: str
    apellido: str
    fecha_registro: date


class MedicoACargoOut(BaseModel):
    """Datos mínimos que un paciente puede ver de un médico con acceso a su ficha."""

    model_config = ConfigDict(from_attributes=True)

    id_medico: int
    nombre: str
    apellido: str


class MedicoPerfilUpdate(BaseModel):
    usuario: EmailStr | None = None
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    apellido: str | None = Field(default=None, min_length=1, max_length=80)
    nueva_contrasena: str | None = Field(default=None, min_length=8)

    @field_validator("nombre", "apellido")
    @classmethod
    def nombre_sin_numeros(cls, valor: str | None) -> str | None:
        if valor is not None and any(caracter.isdigit() for caracter in valor):
            raise ValueError("El nombre y el apellido no pueden contener números.")
        return valor


class VincularPacienteRequest(BaseModel):
    nombre_usuario: str
    pin: str

    @field_validator("nombre_usuario")
    @classmethod
    def nombre_usuario_valido(cls, valor: str) -> str:
        return normalizar_nombre_usuario(valor)
