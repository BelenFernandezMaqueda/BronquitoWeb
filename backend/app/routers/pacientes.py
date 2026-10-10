from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_paciente
from app.core.security import hashear_secreto
from app.models.entrenamiento import Entrenamiento
from app.models.evaluacion import Evaluacion
from app.models.medico import Medico
from app.models.medico_paciente import MedicoPaciente
from app.models.paciente import Paciente
from app.schemas.entrenamiento import EntrenamientoOut
from app.schemas.evaluacion import EvaluacionOut
from app.schemas.medico import MedicoACargoOut
from app.schemas.paciente import PacientePerfilOut, PacientePerfilUpdate

from app.models.frecuencia_recomendada import FrecuenciaRecomendada
from app.schemas.frecuencia import FrecuenciaOut

router = APIRouter(prefix="/pacientes", tags=["pacientes"])


@router.get("/me", response_model=PacientePerfilOut)
def mi_perfil(paciente: Paciente = Depends(get_current_paciente)):
    """El propio paciente viendo su perfil (protegido con SU token, no el de un médico)."""
    return paciente


@router.patch("/me", response_model=PacientePerfilOut)
def actualizar_mi_perfil(
    payload: PacientePerfilUpdate,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    """
    El paciente completa/edita su perfil una vez logueado. El caso central es
    la cuenta creada por el dispositivo que llega sin mail: la web la manda
    acá con `email` + `acepto_terminos=true` antes de dejarla entrar al
    dashboard (ver `perfil_completo` en el schema).
    """
    datos = payload.model_dump(exclude_unset=True, exclude_none=True)

    nuevo_dni = datos.pop("dni", None)
    if nuevo_dni is not None and nuevo_dni != paciente.dni:
        ya_usado = db.query(Paciente).filter(Paciente.dni == nuevo_dni).first()
        if ya_usado is not None:
            raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese DNI.")
        paciente.dni = nuevo_dni

    nuevo_pin = datos.pop("pin", None)
    if nuevo_pin is not None:
        paciente.pin_hash = hashear_secreto(nuevo_pin)

    enfermedades = datos.pop("enfermedades", None)
    if enfermedades is not None:
        paciente.enfermedades = ", ".join(enfermedades)

    nuevo_email = datos.get("email")
    if nuevo_email is not None and nuevo_email != paciente.email:
        ya_usado = db.query(Paciente).filter(Paciente.email == nuevo_email).first()
        if ya_usado is not None:
            raise HTTPException(status_code=400, detail="Ese mail ya está en uso por otra cuenta.")

    # `acepto_terminos` sólo se puede pasar a True desde acá; si el paciente
    # manda false lo ignoramos (no hay un flujo de "revocar consentimiento").
    if datos.get("acepto_terminos") is True and not paciente.acepto_terminos:
        paciente.acepto_terminos = True
        paciente.fecha_aceptacion_terminos = datetime.now(timezone.utc)
    datos.pop("acepto_terminos", None)

    for campo, valor in datos.items():
        setattr(paciente, campo, valor.strip() if campo in {"nombre", "apellido"} else valor)

    db.commit()
    db.refresh(paciente)
    return paciente


@router.get("/me/frecuencia", response_model=list[FrecuenciaOut])
def mi_historial_frecuencia(
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    """Historial de frecuencia/días recomendados del propio paciente logueado."""
    return (
        db.query(FrecuenciaRecomendada)
        .filter(FrecuenciaRecomendada.id_paciente == paciente.id_paciente)
        .order_by(FrecuenciaRecomendada.vigente_desde.desc(), FrecuenciaRecomendada.creado_en.desc())
        .all()
    )


@router.get("/me/evaluaciones", response_model=list[EvaluacionOut])
def mis_evaluaciones(
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    """Evaluaciones (espirometría/PIM) del propio paciente logueado, más recientes primero."""
    return (
        db.query(Evaluacion)
        .filter(Evaluacion.id_paciente == paciente.id_paciente)
        .order_by(Evaluacion.fecha_hora.desc())
        .all()
    )


@router.get("/me/entrenamientos", response_model=list[EntrenamientoOut])
def mis_entrenamientos(
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    """Entrenamientos del propio paciente logueado, más recientes primero."""
    return (
        db.query(Entrenamiento)
        .filter(Entrenamiento.id_paciente == paciente.id_paciente)
        .order_by(Entrenamiento.fecha_hora.desc())
        .all()
    )


@router.get("/me/medicos", response_model=list[MedicoACargoOut])
def mis_medicos_a_cargo(
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    """Médicos que actualmente tienen un vínculo y pueden ver la ficha del paciente."""
    return (
        db.query(Medico)
        .join(MedicoPaciente, MedicoPaciente.id_medico == Medico.id_medico)
        .filter(MedicoPaciente.id_paciente == paciente.id_paciente)
        .order_by(Medico.apellido, Medico.nombre)
        .all()
    )
