"""
Lo que hace el médico con el dispositivo desde la web: verlo, asignarle un
paciente, formatearlo ("cambiar usuario" = formatear + paciente de
reemplazo) y cancelar un pedido.

La web nunca le habla a la ESP: todo esto deja solicitudes en la cola que la
ESP retira la próxima vez que sincroniza (ver app/routers/dispositivo.py).

Quién puede operar: cualquier médico si el dispositivo no tiene paciente; si
tiene, sólo los médicos vinculados a ese paciente. Los demás ven que está
ocupado, pero no por quién.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_medico
from app.core.dispositivo import ahora_utc, direccion_red_local, obtener_dispositivo, registrar
from app.models.dispositivo import (
    ESTADOS_ACTIVOS,
    Dispositivo,
    EstadoSolicitud,
    SolicitudDispositivo,
    TipoSolicitud,
)
from app.models.medico import Medico
from app.models.medico_paciente import MedicoPaciente
from app.models.paciente import Paciente
from app.schemas.dispositivo import (
    AsignarRequest,
    ConexionOut,
    EstadoDispositivoOut,
    FormatearRequest,
    PacienteAsignadoOut,
    SolicitudOut,
)

router = APIRouter(prefix="/medicos/me/dispositivo", tags=["dispositivo (medico)"])


def _vinculado(medico: Medico, id_paciente: int, db: Session) -> bool:
    return (
        db.query(MedicoPaciente)
        .filter(MedicoPaciente.id_medico == medico.id_medico, MedicoPaciente.id_paciente == id_paciente)
        .first()
        is not None
    )


def _puede_operar(medico: Medico, dispositivo: Dispositivo, db: Session) -> bool:
    return dispositivo.id_paciente is None or _vinculado(medico, dispositivo.id_paciente, db)


def _exigir_operar(medico: Medico, dispositivo: Dispositivo, db: Session) -> None:
    if not _puede_operar(medico, dispositivo, db):
        raise HTTPException(
            status_code=403,
            detail="El dispositivo está asignado a un paciente que no está en tu lista.",
        )


def _paciente_vinculado(medico: Medico, nombre_usuario: str, db: Session) -> Paciente:
    """Busca un paciente por usuario, exigiendo que esté en la lista de este médico."""
    paciente = db.query(Paciente).filter(Paciente.nombre_usuario == nombre_usuario).first()
    if paciente is None or not _vinculado(medico, paciente.id_paciente, db):
        raise HTTPException(status_code=404, detail="No tenés ningún paciente vinculado con ese nombre de usuario.")
    return paciente


def _solicitud_activa(dispositivo: Dispositivo, db: Session) -> SolicitudDispositivo | None:
    return (
        db.query(SolicitudDispositivo)
        .filter(
            SolicitudDispositivo.id_dispositivo == dispositivo.id_dispositivo,
            SolicitudDispositivo.estado.in_(ESTADOS_ACTIVOS),
        )
        .order_by(SolicitudDispositivo.id_solicitud)
        .first()
    )


def _exigir_sin_solicitud_activa(dispositivo: Dispositivo, db: Session) -> None:
    """
    De a un pedido por vez: así el orden es obvio y nunca hay, por ejemplo,
    dos RESET en la cola. Si hay uno esperando, el médico lo cancela primero.
    """
    if _solicitud_activa(dispositivo, db) is not None:
        raise HTTPException(
            status_code=409,
            detail="Ya hay un pedido esperando al dispositivo. Esperá a que se aplique o cancelalo.",
        )


def _estado(medico: Medico, dispositivo: Dispositivo, db: Session) -> EstadoDispositivoOut:
    puede = _puede_operar(medico, dispositivo, db)

    paciente = None
    if dispositivo.id_paciente is not None and puede:
        p = db.get(Paciente, dispositivo.id_paciente)
        paciente = PacienteAsignadoOut(
            id_paciente=p.id_paciente, nombre_usuario=p.nombre_usuario, nombre=p.nombre, apellido=p.apellido,
        )

    # La última solicitud (la activa si hay, si no la más reciente).
    ultima = _solicitud_activa(dispositivo, db) or (
        db.query(SolicitudDispositivo)
        .filter(SolicitudDispositivo.id_dispositivo == dispositivo.id_dispositivo)
        .order_by(SolicitudDispositivo.id_solicitud.desc())
        .first()
    )
    solicitud = None
    if ultima is not None and puede:
        reemplazo = None
        if ultima.tipo == TipoSolicitud.reset and ultima.paciente_destino is not None:
            reemplazo = ultima.paciente_destino.nombre_usuario
        solicitud = SolicitudOut(
            id_solicitud=ultima.id_solicitud,
            tipo=ultima.tipo,
            estado=ultima.estado,
            detalle=ultima.detalle,
            reemplazo=reemplazo,
            creada_en=ultima.creada_en,
            entregada_en=ultima.entregada_en,
            confirmada_en=ultima.confirmada_en,
            cancelable=ultima.estado in ESTADOS_ACTIVOS,
        )

    return EstadoDispositivoOut(
        paciente=paciente,
        asignado_a_otro=dispositivo.id_paciente is not None and not puede,
        puede_operar=puede,
        ultimo_contacto=dispositivo.ultimo_contacto,
        archivos_pendientes=dispositivo.archivos_pendientes,
        vacia=dispositivo.vacia,
        usuario_en_dispositivo=dispositivo.usuario_reportado if puede else None,
        solicitud=solicitud,
        conexion=ConexionOut(**direccion_red_local()),
    )


@router.get("", response_model=EstadoDispositivoOut)
def estado_dispositivo(medico: Medico = Depends(get_current_medico), db: Session = Depends(get_db)):
    """Estado del dispositivo y de su último pedido (lo que muestra el panel)."""
    dispositivo = obtener_dispositivo(db)
    db.commit()
    return _estado(medico, dispositivo, db)


@router.post("/asignar", response_model=EstadoDispositivoOut, status_code=201)
def asignar_paciente(
    payload: AsignarRequest, medico: Medico = Depends(get_current_medico), db: Session = Depends(get_db),
):
    """
    Para un dispositivo sin paciente: lo asigna a uno de tus pacientes y le
    manda su perfil (CARGAR_PERFIL). Si el paciente lo rechaza en el
    dispositivo, el dispositivo vuelve a quedar sin paciente.
    """
    dispositivo = obtener_dispositivo(db)
    if dispositivo.id_paciente is not None:
        raise HTTPException(
            status_code=409,
            detail="El dispositivo ya tiene un paciente. Usá \"Cambiar usuario\" para reemplazarlo.",
        )
    if dispositivo.vacia is False:
        raise HTTPException(
            status_code=409,
            detail="El dispositivo todavía tiene datos de otro paciente. Formatealo primero.",
        )
    _exigir_sin_solicitud_activa(dispositivo, db)
    paciente = _paciente_vinculado(medico, payload.nombre_usuario, db)

    dispositivo.id_paciente = paciente.id_paciente
    db.add(SolicitudDispositivo(
        id_dispositivo=dispositivo.id_dispositivo,
        tipo=TipoSolicitud.cargar_perfil,
        estado=EstadoSolicitud.pendiente,
        payload={},  # el perfil se arma cuando la ESP lo retira
        id_medico=medico.id_medico,
        id_paciente_destino=paciente.id_paciente,
        creada_en=ahora_utc(),
    ))
    registrar(db, dispositivo, "ASIGNAR", f"paciente {paciente.id_paciente}", medico.id_medico)
    db.commit()
    return _estado(medico, dispositivo, db)


@router.post("/formatear", response_model=EstadoDispositivoOut, status_code=201)
def formatear(
    payload: FormatearRequest, medico: Medico = Depends(get_current_medico), db: Session = Depends(get_db),
):
    """
    Pide un RESET: la ESP borra el perfil, la configuración, las
    evaluaciones y los entrenamientos. Si tiene pruebas sin sincronizar se
    niega (queda en ERROR "archivos_pendientes") y no borra nada.

    Con `nombre_usuario_reemplazo` es "cambiar usuario": cuando la ESP
    confirma el RESET, se le asigna ese paciente y se le manda su perfil.
    """
    dispositivo = obtener_dispositivo(db)
    _exigir_operar(medico, dispositivo, db)
    _exigir_sin_solicitud_activa(dispositivo, db)

    reemplazo = None
    if payload.nombre_usuario_reemplazo:
        reemplazo = _paciente_vinculado(medico, payload.nombre_usuario_reemplazo, db)

    db.add(SolicitudDispositivo(
        id_dispositivo=dispositivo.id_dispositivo,
        tipo=TipoSolicitud.reset,
        estado=EstadoSolicitud.pendiente,
        payload={},
        id_medico=medico.id_medico,
        id_paciente_destino=reemplazo.id_paciente if reemplazo else None,
        creada_en=ahora_utc(),
    ))
    registrar(
        db, dispositivo, "RESET_PEDIDO",
        f"reemplazo paciente {reemplazo.id_paciente}" if reemplazo else "sin reemplazo",
        medico.id_medico,
    )
    db.commit()
    return _estado(medico, dispositivo, db)


@router.post("/solicitudes/{id_solicitud}/cancelar", response_model=EstadoDispositivoOut)
def cancelar_solicitud(
    id_solicitud: int, medico: Medico = Depends(get_current_medico), db: Session = Depends(get_db),
):
    """
    Cancela un pedido que todavía no se aplicó. Si la ESP aún no lo retiró,
    nunca le llega. Si ya lo está mostrando y el paciente acepta igual, el
    servidor registra lo que realmente pasó (ver `confirmar_solicitud`).
    """
    dispositivo = obtener_dispositivo(db)
    _exigir_operar(medico, dispositivo, db)

    solicitud = db.get(SolicitudDispositivo, id_solicitud)
    if solicitud is None or solicitud.id_dispositivo != dispositivo.id_dispositivo:
        raise HTTPException(status_code=404, detail="Ese pedido no existe.")
    if solicitud.estado not in ESTADOS_ACTIVOS:
        raise HTTPException(status_code=409, detail="Ese pedido ya no se puede cancelar.")

    solicitud.estado = EstadoSolicitud.cancelada
    # Un perfil que no se va a cargar deja el dispositivo libre.
    if (
        solicitud.tipo == TipoSolicitud.cargar_perfil
        and dispositivo.id_paciente == solicitud.id_paciente_destino
    ):
        dispositivo.id_paciente = None
    registrar(
        db, dispositivo, "CANCELAR", f"solicitud {solicitud.id_solicitud} {solicitud.tipo.value}", medico.id_medico,
    )
    db.commit()
    return _estado(medico, dispositivo, db)
