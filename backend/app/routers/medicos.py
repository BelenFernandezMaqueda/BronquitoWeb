from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_medico
from app.core.security import hashear_secreto, verificar_secreto
from app.core.timezone import hoy_argentina
from app.models.anotacion import Anotacion
from app.models.entrenamiento import Entrenamiento
from app.models.evaluacion import Evaluacion, EvaluacionMuestra
from app.models.frecuencia_recomendada import FrecuenciaRecomendada
from app.models.medico import Medico
from app.models.medico_paciente import MedicoPaciente
from app.models.paciente import Paciente
from app.models.rutina import Rutina
from app.schemas.anotacion import AnotacionCrearRequest, AnotacionEditarRequest, AnotacionOut
from app.schemas.entrenamiento import EntrenamientoOut
from app.schemas.evaluacion import EvaluacionMuestraOut, EvaluacionOut
from app.schemas.frecuencia import FrecuenciaCrearRequest, FrecuenciaOut
from app.schemas.medico import MedicoPerfilOut, MedicoPerfilUpdate, VincularPacienteRequest
from app.schemas.paciente import PacientePerfilOut
from app.schemas.rutina import RutinaOut

router = APIRouter(prefix="/medicos", tags=["medicos"])


def _exigir_vinculo(medico: Medico, id_paciente: int, db: Session) -> None:
    """Corta con 403 si ESTE médico no tiene a `id_paciente` vinculado."""
    vinculado = (
        db.query(MedicoPaciente)
        .filter(MedicoPaciente.id_medico == medico.id_medico, MedicoPaciente.id_paciente == id_paciente)
        .first()
    )
    if vinculado is None:
        raise HTTPException(status_code=403, detail="No tenés a ese paciente vinculado.")


@router.get("/me", response_model=MedicoPerfilOut)
def mi_perfil(medico: Medico = Depends(get_current_medico)):
    """
    Ejemplo más simple posible de endpoint protegido: `Depends(get_current_medico)`
    ya se encarga de exigir un token válido de médico antes de llegar acá.
    Si el token falta o es inválido, la función ni se ejecuta.
    """
    return medico


@router.patch("/me", response_model=MedicoPerfilOut)
def actualizar_mi_perfil(
    payload: MedicoPerfilUpdate,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    datos = payload.model_dump(exclude_unset=True, exclude_none=True)

    nuevo_usuario = datos.pop("usuario", None)
    if nuevo_usuario is not None and nuevo_usuario != medico.usuario:
        ya_usado = db.query(Medico).filter(Medico.usuario == nuevo_usuario).first()
        if ya_usado is not None:
            raise HTTPException(status_code=400, detail="Ese mail ya está en uso por otra cuenta.")
        medico.usuario = nuevo_usuario

    nueva_contrasena = datos.pop("nueva_contrasena", None)
    if nueva_contrasena is not None:
        medico.contrasena_hash = hashear_secreto(nueva_contrasena)

    for campo, valor in datos.items():
        setattr(medico, campo, valor.strip() if campo in {"nombre", "apellido"} else valor)

    db.commit()
    db.refresh(medico)
    return medico


@router.get("/me/pacientes", response_model=list[PacientePerfilOut])
def mis_pacientes(medico: Medico = Depends(get_current_medico), db: Session = Depends(get_db)):
    """Pacientes vinculados a ESTE médico (el que mandó el token), no a cualquiera."""
    return (
        db.query(Paciente)
        .join(MedicoPaciente, MedicoPaciente.id_paciente == Paciente.id_paciente)
        .filter(MedicoPaciente.id_medico == medico.id_medico)
        .all()
    )


@router.post("/me/vincular", response_model=PacientePerfilOut, status_code=201)
def vincular_paciente(
    payload: VincularPacienteRequest,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """
    Vinculación por nombre de usuario + PIN: el médico tiene que saber las
    credenciales del paciente (se las pasa el paciente en persona), no alcanza
    con el usuario.
    Si coinciden, se crea la fila en medico_paciente al toque (sin pedirle
    confirmación al paciente — así lo definiste para esta versión).
    """
    paciente = db.query(Paciente).filter(Paciente.nombre_usuario == payload.nombre_usuario).first()
    if paciente is None:
        raise HTTPException(status_code=404, detail="No existe ningún paciente con ese nombre de usuario.")

    if not verificar_secreto(payload.pin, paciente.pin_hash):
        raise HTTPException(status_code=401, detail="PIN incorrecto.")

    ya_vinculado = (
        db.query(MedicoPaciente)
        .filter(MedicoPaciente.id_medico == medico.id_medico, MedicoPaciente.id_paciente == paciente.id_paciente)
        .first()
    )
    if ya_vinculado is not None:
        raise HTTPException(status_code=400, detail="Ya tenés a este paciente vinculado.")

    vinculo = MedicoPaciente(
        id_medico=medico.id_medico,
        id_paciente=paciente.id_paciente,
        fecha_vinculacion=datetime.now(timezone.utc),
    )
    db.add(vinculo)
    db.commit()

    return paciente


@router.delete("/me/pacientes/{id_paciente}", status_code=204)
def desvincular_paciente(
    id_paciente: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """Saca al paciente de la lista de ESTE médico. No borra al paciente, solo el vínculo."""
    vinculo = (
        db.query(MedicoPaciente)
        .filter(MedicoPaciente.id_medico == medico.id_medico, MedicoPaciente.id_paciente == id_paciente)
        .first()
    )
    if vinculo is None:
        raise HTTPException(status_code=404, detail="No tenés a ese paciente vinculado.")

    db.delete(vinculo)
    db.commit()


@router.get("/me/pacientes/{id_paciente}/evaluaciones", response_model=list[EvaluacionOut])
def evaluaciones_de_paciente(
    id_paciente: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """Evaluaciones (espirometría/PIM) de un paciente vinculado a ESTE médico, más recientes primero."""
    _exigir_vinculo(medico, id_paciente, db)
    return (
        db.query(Evaluacion)
        .filter(Evaluacion.id_paciente == id_paciente)
        .order_by(Evaluacion.fecha_hora.desc())
        .all()
    )


@router.get("/me/pacientes/{id_paciente}/entrenamientos", response_model=list[EntrenamientoOut])
def entrenamientos_de_paciente(
    id_paciente: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """Entrenamientos de un paciente vinculado a ESTE médico, más recientes primero."""
    _exigir_vinculo(medico, id_paciente, db)
    return (
        db.query(Entrenamiento)
        .filter(Entrenamiento.id_paciente == id_paciente)
        .order_by(Entrenamiento.fecha_hora.desc())
        .all()
    )


@router.get("/me/pacientes/{id_paciente}/rutina", response_model=RutinaOut | None)
def rutina_de_paciente(
    id_paciente: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """
    Rutina activa de un paciente vinculado a ESTE médico. `None` si todavía
    no tiene ninguna (por ejemplo, se registró por la web y nunca se conectó
    al dispositivo ni el médico le cargó una).
    """
    _exigir_vinculo(medico, id_paciente, db)
    return db.query(Rutina).filter(Rutina.id_paciente == id_paciente).first()


@router.get(
    "/me/pacientes/{id_paciente}/evaluaciones/{id_evaluacion}/muestras",
    response_model=EvaluacionMuestraOut,
)
def muestras_de_evaluacion(
    id_paciente: int,
    id_evaluacion: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """La curva cruda de una evaluación puntual, para graficar flujo/volumen/presión."""
    _exigir_vinculo(medico, id_paciente, db)

    evaluacion = (
        db.query(Evaluacion)
        .filter(Evaluacion.id_evaluacion == id_evaluacion, Evaluacion.id_paciente == id_paciente)
        .first()
    )
    if evaluacion is None:
        raise HTTPException(status_code=404, detail="No existe esa evaluación para ese paciente.")

    muestras = (
        db.query(EvaluacionMuestra).filter(EvaluacionMuestra.id_evaluacion == id_evaluacion).first()
    )
    if muestras is None:
        raise HTTPException(status_code=404, detail="Esa evaluación no tiene curva cargada.")

    return muestras


@router.get("/me/pacientes/{id_paciente}/frecuencia", response_model=list[FrecuenciaOut])
def historial_frecuencia(
    id_paciente: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """
    Historial de frecuencia/días recomendados de un paciente. Es del
    paciente, no de este médico: si tiene más de un médico vinculado, todos
    ven el mismo historial completo (más recientes primero).
    """
    _exigir_vinculo(medico, id_paciente, db)
    return (
        db.query(FrecuenciaRecomendada)
        .filter(FrecuenciaRecomendada.id_paciente == id_paciente)
        .order_by(FrecuenciaRecomendada.vigente_desde.desc(), FrecuenciaRecomendada.creado_en.desc())
        .all()
    )


@router.post("/me/pacientes/{id_paciente}/frecuencia", response_model=FrecuenciaOut, status_code=201)
def crear_frecuencia(
    id_paciente: int,
    payload: FrecuenciaCrearRequest,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """
    Agrega una entrada nueva al historial (no pisa las anteriores), vigente
    desde hoy. `id_medico` queda guardado solo para saber quién hizo el
    cambio — no filtra qué ven los demás médicos vinculados a este paciente.
    """
    _exigir_vinculo(medico, id_paciente, db)

    frecuencia = FrecuenciaRecomendada(
        id_paciente=id_paciente,
        id_medico=medico.id_medico,
        sesiones_por_semana=payload.sesiones_por_semana,
        dias_semana=payload.dias_semana,
        vigente_desde=hoy_argentina(),
        creado_en=datetime.now(timezone.utc),
    )
    db.add(frecuencia)
    db.commit()
    db.refresh(frecuencia)

    return frecuencia


@router.get("/me/pacientes/{id_paciente}/anotaciones", response_model=list[AnotacionOut])
def anotaciones_de_paciente(
    id_paciente: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    """
    Todas las notas sobre este paciente (en puntos de gráficos y comentarios
    generales de sesión), de todos sus médicos vinculados, más viejas primero.
    El front las reparte entre los gráficos según `grafico`/`sesion`.
    """
    _exigir_vinculo(medico, id_paciente, db)
    return (
        db.query(Anotacion)
        .filter(Anotacion.id_paciente == id_paciente)
        .order_by(Anotacion.creado_en, Anotacion.id_anotacion)
        .all()
    )


@router.post("/me/pacientes/{id_paciente}/anotaciones", response_model=AnotacionOut, status_code=201)
def crear_anotacion(
    id_paciente: int,
    payload: AnotacionCrearRequest,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    _exigir_vinculo(medico, id_paciente, db)

    anotacion = Anotacion(
        id_paciente=id_paciente,
        id_medico=medico.id_medico,
        sesion=payload.sesion,
        grafico=payload.grafico,
        punto=payload.punto,
        texto=payload.texto,
        creado_en=datetime.now(timezone.utc),
    )
    db.add(anotacion)
    db.commit()
    db.refresh(anotacion)

    return anotacion


def _anotacion_propia(medico: Medico, id_paciente: int, id_anotacion: int, db: Session) -> Anotacion:
    """La nota pedida, cortando con 403 si la escribió otro médico (sólo el autor la modifica)."""
    _exigir_vinculo(medico, id_paciente, db)
    anotacion = (
        db.query(Anotacion)
        .filter(Anotacion.id_anotacion == id_anotacion, Anotacion.id_paciente == id_paciente)
        .first()
    )
    if anotacion is None:
        raise HTTPException(status_code=404, detail="No existe esa nota.")
    if anotacion.id_medico != medico.id_medico:
        raise HTTPException(status_code=403, detail="Sólo quien escribió la nota la puede modificar.")
    return anotacion


@router.patch("/me/pacientes/{id_paciente}/anotaciones/{id_anotacion}", response_model=AnotacionOut)
def editar_anotacion(
    id_paciente: int,
    id_anotacion: int,
    payload: AnotacionEditarRequest,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    anotacion = _anotacion_propia(medico, id_paciente, id_anotacion, db)
    anotacion.texto = payload.texto
    anotacion.editado_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(anotacion)
    return anotacion


@router.delete("/me/pacientes/{id_paciente}/anotaciones/{id_anotacion}", status_code=204)
def borrar_anotacion(
    id_paciente: int,
    id_anotacion: int,
    medico: Medico = Depends(get_current_medico),
    db: Session = Depends(get_db),
):
    anotacion = _anotacion_propia(medico, id_paciente, id_anotacion, db)
    db.delete(anotacion)
    db.commit()
