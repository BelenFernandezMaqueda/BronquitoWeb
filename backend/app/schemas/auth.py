import re
import unicodedata
from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

EnfermedadPreexistente = Literal[
    "EPOC",
    "Asma",
    "Lesión Medular",
    "Fibrosis quística",
    "Otra",
    "NS/NC",
]


def validar_nombre_sin_numeros(valor: str) -> str:
    if any(caracter.isdigit() for caracter in valor):
        raise ValueError("El nombre y el apellido no pueden contener números.")
    return valor


_PATRON_NOMBRE_USUARIO = re.compile(r"[a-zñ]{4,25}")


def normalizar_nombre_usuario(valor: str) -> str:
    """
    Nombre de usuario del paciente: sin distinguir mayúsculas (se guarda
    siempre en minúscula), sólo letras a-z y ñ, de 4 a 25. El NFC junta una
    "ñ" que llegue como "n" + tilde combinable en un solo carácter.
    """
    usuario = unicodedata.normalize("NFC", valor.strip()).lower()
    if not _PATRON_NOMBRE_USUARIO.fullmatch(usuario):
        raise ValueError(
            "El nombre de usuario debe tener entre 4 y 25 letras, sin números, "
            "tildes, espacios ni caracteres especiales."
        )
    return usuario


# --- Médicos ---------------------------------------------------------------


class MedicoRegistro(BaseModel):
    """Lo que manda el formulario de registro de médico."""

    usuario: EmailStr
    contrasena: str = Field(min_length=8, description="Mínimo 8 caracteres")
    nombre: str = Field(min_length=1, max_length=80)
    apellido: str = Field(min_length=1, max_length=80)
    acepto_terminos: bool

    @field_validator("nombre", "apellido")
    @classmethod
    def nombre_sin_numeros(cls, valor: str) -> str:
        return validar_nombre_sin_numeros(valor)

    @field_validator("acepto_terminos")
    @classmethod
    def debe_aceptar_terminos(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Tenés que aceptar los términos y la política de privacidad para registrarte.")
        return v


class MedicoLogin(BaseModel):
    usuario: EmailStr
    contrasena: str


# --- Pacientes ------------------------------------------------------------


class PacienteRegistro(BaseModel):
    """
    Registro web del paciente con sus datos personales y clínicos completos.
    """

    nombre_usuario: str
    pin: str = Field(pattern=r"^\d{4}$", description="4 dígitos")
    nombre: str = Field(min_length=1, max_length=80)
    apellido: str = Field(min_length=1, max_length=80)
    email: EmailStr
    altura_cm: float = Field(gt=0, lt=300)
    peso_kg: float = Field(gt=0, lt=500)
    fecha_nacimiento: date
    sexo: Literal["F", "M", "X"]
    fumador: bool = False
    enfermedades: list[EnfermedadPreexistente] = Field(min_length=1, max_length=6)
    acepto_terminos: bool

    @field_validator("nombre_usuario")
    @classmethod
    def nombre_usuario_valido(cls, valor: str) -> str:
        return normalizar_nombre_usuario(valor)

    @field_validator("nombre", "apellido")
    @classmethod
    def nombre_sin_numeros(cls, valor: str) -> str:
        return validar_nombre_sin_numeros(valor)

    @field_validator("enfermedades")
    @classmethod
    def enfermedades_sin_repetir(cls, valores: list[EnfermedadPreexistente]) -> list[EnfermedadPreexistente]:
        if len(valores) != len(set(valores)):
            raise ValueError("No podés seleccionar la misma enfermedad más de una vez.")
        return valores

    @field_validator("acepto_terminos")
    @classmethod
    def debe_aceptar_terminos(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Tenés que aceptar los términos y la política de privacidad para registrarte.")
        return v


class PacienteLogin(BaseModel):
    nombre_usuario: str
    pin: str = Field(pattern=r"^\d{4}$", description="4 dígitos")

    @field_validator("nombre_usuario")
    @classmethod
    def nombre_usuario_valido(cls, valor: str) -> str:
        return normalizar_nombre_usuario(valor)


# --- Salida común -------------------------------------------------------


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    rol: Literal["medico", "paciente"]


# --- Recuperar credencial (mismo mecanismo para médico y paciente) ------
# El médico se identifica siempre por mail; el paciente puede identificarse
# por mail o por nombre de usuario, pero el flujo interno (generar token, vencimiento,
# respuesta genérica, standin de desarrollo) es idéntico en los dos casos.


class OlvideContrasenaRequest(BaseModel):
    """Médico: 'olvidé mi contraseña'."""

    usuario: EmailStr


class OlvidePinRequest(BaseModel):
    """Paciente: 'olvidé mi PIN'. `identificador` = su mail o su nombre de usuario."""

    identificador: str = Field(min_length=4)


class RecuperacionOut(BaseModel):
    # Siempre el mismo mensaje genérico, exista o no la cuenta. El token del
    # link va sólo por mail, nunca en esta respuesta.
    mensaje: str


class ResetearContrasenaRequest(BaseModel):
    token: str
    nueva_contrasena: str = Field(min_length=8)


class ResetearPinRequest(BaseModel):
    token: str
    nuevo_pin: str = Field(pattern=r"^\d{4}$", description="4 dígitos")
