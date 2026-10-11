"""
Todo el login/registro vive acá. Dos flujos parecidos pero separados:

- MÉDICOS: se registran con mail + contraseña.
- PACIENTES: se registran desde la web con DNI + PIN + mail + perfil clínico.

El vínculo médico↔paciente NO se crea acá: arranca desde la cuenta del
médico (`POST /medicos/me/vincular`).

Recuperar la credencial ("olvidé mi contraseña" / "olvidé mi PIN") usa el
mismo mecanismo para los dos roles — ver `_generar_reset_token` /
`_reset_token_vigente` abajo. El link se manda por mail (en un BackgroundTask,
para no demorar la respuesta) y la respuesta HTTP nunca incluye el token.
"""

import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.email import enviar_email
from app.core.email_templates import DUCK_CID, DUCK_PNG, recuperar_credencial
from app.core.security import crear_token, hashear_secreto, verificar_secreto
from app.models.medico import Medico
from app.models.paciente import Paciente
from app.schemas.auth import (
    MedicoLogin,
    MedicoRegistro,
    OlvideContrasenaRequest,
    OlvidePinRequest,
    PacienteLogin,
    PacienteRegistro,
    RecuperacionOut,
    ResetearContrasenaRequest,
    ResetearPinRequest,
    TokenOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Mensaje único para "olvidé..." exista o no la cuenta: así nadie puede usar
# este endpoint para averiguar qué mails/DNIs están registrados.
_MENSAJE_RECUPERACION = "Si la cuenta existe, vas a recibir instrucciones para recuperar el acceso."


def _generar_reset_token(cuenta: Medico | Paciente) -> str:
    """Setea reset_token / reset_token_expira en la cuenta y devuelve el token."""
    token = secrets.token_urlsafe(32)
    cuenta.reset_token = token
    cuenta.reset_token_expira = datetime.now(timezone.utc) + timedelta(
        minutes=settings.reset_token_expire_minutes
    )
    return token


def _reset_token_vigente(cuenta: Medico | Paciente | None) -> bool:
    """True si la cuenta tiene un token de reseteo que todavía no venció."""
    if cuenta is None or cuenta.reset_token_expira is None:
        return False
    return datetime.now(timezone.utc) <= cuenta.reset_token_expira.replace(tzinfo=timezone.utc)


def _encolar_mail_recuperacion(
    background_tasks: BackgroundTasks,
    *,
    destinatario: str,
    nombre: str | None,
    token: str,
    tipo: str,  # "contrasena" | "pin"
) -> None:
    """Arma el link + el mail branded y lo deja para enviar en segundo plano."""
    ruta = "/resetear/pin" if tipo == "pin" else "/resetear/contrasena"
    url = f"{settings.frontend_url}{ruta}?token={token}"
    asunto, html, texto = recuperar_credencial(nombre=nombre, url=url, tipo=tipo)
    background_tasks.add_task(
        enviar_email,
        destinatario=destinatario,
        asunto=asunto,
        html=html,
        texto=texto,
        imagenes_inline={DUCK_CID: DUCK_PNG},
    )


# --- Médicos -----------------------------------------------------------------


@router.post("/medicos/registro", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def registrar_medico(payload: MedicoRegistro, db: Session = Depends(get_db)):
    ya_existe = db.query(Medico).filter(Medico.usuario == payload.usuario).first()
    if ya_existe:
        raise HTTPException(status_code=400, detail="Ya existe una cuenta de médico con ese mail.")

    nuevo = Medico(
        usuario=payload.usuario,
        contrasena_hash=hashear_secreto(payload.contrasena),
        nombre=payload.nombre.strip(),
        apellido=payload.apellido.strip(),
        fecha_registro=date.today(),
        acepto_terminos=True,
        fecha_aceptacion_terminos=datetime.now(timezone.utc),
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    token = crear_token(sujeto_id=nuevo.id_medico, rol="medico")
    return TokenOut(access_token=token, rol="medico")


@router.post("/medicos/login", response_model=TokenOut)
def login_medico(payload: MedicoLogin, db: Session = Depends(get_db)):
    medico = db.query(Medico).filter(Medico.usuario == payload.usuario).first()

    # Mismo mensaje para "mail no existe" y "contraseña mal", así nadie puede
    # deducir qué mails están registrados.
    credenciales_invalidas = HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

    if medico is None:
        raise credenciales_invalidas
    if not verificar_secreto(payload.contrasena, medico.contrasena_hash):
        raise credenciales_invalidas

    token = crear_token(sujeto_id=medico.id_medico, rol="medico")
    return TokenOut(access_token=token, rol="medico")


@router.post("/medicos/olvide-contrasena", response_model=RecuperacionOut)
def olvide_contrasena(
    payload: OlvideContrasenaRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    medico = db.query(Medico).filter(Medico.usuario == payload.usuario).first()
    if medico is None:
        return RecuperacionOut(mensaje=_MENSAJE_RECUPERACION)

    token = _generar_reset_token(medico)
    db.commit()
    _encolar_mail_recuperacion(
        background_tasks,
        destinatario=medico.usuario,
        nombre=medico.nombre,
        token=token,
        tipo="contrasena",
    )
    return RecuperacionOut(mensaje=_MENSAJE_RECUPERACION)


@router.post("/medicos/resetear-contrasena", status_code=status.HTTP_204_NO_CONTENT)
def resetear_contrasena(payload: ResetearContrasenaRequest, db: Session = Depends(get_db)):
    medico = db.query(Medico).filter(Medico.reset_token == payload.token).first()

    if not _reset_token_vigente(medico):
        raise HTTPException(
            status_code=400, detail="El link para resetear la contraseña es inválido o venció."
        )

    medico.contrasena_hash = hashear_secreto(payload.nueva_contrasena)
    medico.reset_token = None
    medico.reset_token_expira = None
    db.commit()


# --- Pacientes -----------------------------------------------------------------


@router.post("/pacientes/registro", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def registrar_paciente(payload: PacienteRegistro, db: Session = Depends(get_db)):
    """
    Alta de paciente desde la web con sus datos y consentimiento completos.
    """
    if db.query(Paciente).filter(Paciente.dni == payload.dni).first():
        raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese DNI.")
    if db.query(Paciente).filter(Paciente.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese mail.")

    nuevo = Paciente(
        dni=payload.dni,
        pin_hash=hashear_secreto(payload.pin),
        nombre=payload.nombre.strip(),
        apellido=payload.apellido.strip(),
        email=payload.email,
        altura_cm=payload.altura_cm,
        peso_kg=payload.peso_kg,
        fecha_nacimiento=payload.fecha_nacimiento,
        sexo=payload.sexo,
        fumador=payload.fumador,
        enfermedades=", ".join(payload.enfermedades),
        fecha_registro=date.today(),
        acepto_terminos=True,
        fecha_aceptacion_terminos=datetime.now(timezone.utc),
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    token = crear_token(sujeto_id=nuevo.id_paciente, rol="paciente")
    return TokenOut(access_token=token, rol="paciente")


@router.post("/pacientes/login", response_model=TokenOut)
def login_paciente(payload: PacienteLogin, db: Session = Depends(get_db)):
    """
    Login estándar con DNI + PIN contra una cuenta registrada en la web.
    Sin bloqueo por intentos fallidos — decisión
    explícita para esta primera versión.
    """
    paciente = db.query(Paciente).filter(Paciente.dni == payload.dni).first()

    credenciales_invalidas = HTTPException(status_code=401, detail="DNI o PIN incorrectos.")

    if paciente is None:
        raise credenciales_invalidas
    if not verificar_secreto(payload.pin, paciente.pin_hash):
        raise credenciales_invalidas

    token = crear_token(sujeto_id=paciente.id_paciente, rol="paciente")
    return TokenOut(access_token=token, rol="paciente")


@router.post("/pacientes/olvide-pin", response_model=RecuperacionOut)
def olvide_pin(
    payload: OlvidePinRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    El paciente se identifica con su mail o con su DNI. Si la cuenta no tiene
    mail cargado no hay a dónde mandar el link — respondemos igual el mensaje
    genérico (no generamos token) para no revelar el estado de la cuenta.
    """
    ident = payload.identificador.strip()
    paciente = (
        db.query(Paciente)
        .filter(or_(Paciente.email == ident, Paciente.dni == ident))
        .first()
    )
    if paciente is None or paciente.email is None:
        return RecuperacionOut(mensaje=_MENSAJE_RECUPERACION)

    token = _generar_reset_token(paciente)
    db.commit()
    _encolar_mail_recuperacion(
        background_tasks,
        destinatario=paciente.email,
        nombre=paciente.nombre,
        token=token,
        tipo="pin",
    )
    return RecuperacionOut(mensaje=_MENSAJE_RECUPERACION)


@router.post("/pacientes/resetear-pin", status_code=status.HTTP_204_NO_CONTENT)
def resetear_pin(payload: ResetearPinRequest, db: Session = Depends(get_db)):
    paciente = db.query(Paciente).filter(Paciente.reset_token == payload.token).first()

    if not _reset_token_vigente(paciente):
        raise HTTPException(
            status_code=400, detail="El link para resetear el PIN es inválido o venció."
        )

    paciente.pin_hash = hashear_secreto(payload.nuevo_pin)
    paciente.reset_token = None
    paciente.reset_token_expira = None
    db.commit()
