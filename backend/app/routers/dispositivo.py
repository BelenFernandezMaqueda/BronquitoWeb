"""
Endpoints que llama la ESP32. Todos exigen el header `X-Device-Key`.

Contrato con el firmware:
  - Los errores vuelven con el código HTTP real y el cuerpo
    `{"ok": false, "error": "texto_sin_acentos"}` (en vez del `{"detail": ...}`
    de FastAPI que usa la web). Eso lo hace `RutaDispositivo`.
  - Ningún texto que viaja a la ESP lleva acentos ni ñ.
  - El PIN nunca viaja del servidor a la ESP: va al revés, la ESP manda lo que
    tipeó el paciente y el servidor dice si coincide.

Orden de una sincronización:
  1. POST /dispositivo/identificar  -> hora + cuántas solicitudes hay.
  2. GET  /dispositivo/solicitudes  -> la cola, en orden.
  3. Por cada una, el paciente toca ACEPTAR / RECHAZAR y la ESP llama a
     POST /dispositivo/solicitudes/{id}/confirmar.
  4. Vuelve a 2 hasta que la lista venga vacía (confirmar un RESET con
     "cambiar usuario" genera el CARGAR_PERFIL siguiente).
"""

import time
from collections.abc import Callable
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dispositivo import (
    ErrorDispositivo,
    ahora_utc,
    armar_perfil,
    exigir_clave_dispositivo,
    obtener_dispositivo,
    pin_version,
    registrar,
    sin_acentos,
)
from app.core.security import verificar_secreto
from app.core.timezone import ARGENTINA
from app.models.dispositivo import (
    ESTADOS_ACTIVOS,
    Dispositivo,
    EstadoSolicitud,
    SolicitudDispositivo,
    TipoSolicitud,
)
from app.models.paciente import Paciente
from app.schemas.dispositivo import ConfirmarRequest, IdentificarRequest, VerificarPinRequest


class RutaDispositivo(APIRoute):
    """
    Convierte los errores de estos endpoints al formato que espera la ESP.
    Vive acá (y no como handler global en main.py) para no cambiar cómo
    responde el resto de la API.
    - ErrorDispositivo -> su código y `{"ok": false, "error": ...}`.
    - Body mal armado o con campos inválidos -> 400 "datos_invalidos".
    """

    def get_route_handler(self) -> Callable:
        handler_original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            try:
                return await handler_original(request)
            except ErrorDispositivo as e:
                return JSONResponse(status_code=e.status, content={"ok": False, "error": e.error, **e.extra})
            except RequestValidationError:
                return JSONResponse(status_code=400, content={"ok": False, "error": "datos_invalidos"})

        return handler


router = APIRouter(
    prefix="/dispositivo",
    tags=["dispositivo (ESP)"],
    route_class=RutaDispositivo,
    dependencies=[Depends(exigir_clave_dispositivo)],
)


def _paciente_asignado(dispositivo: Dispositivo, db: Session) -> Paciente | None:
    if dispositivo.id_paciente is None:
        return None
    return db.get(Paciente, dispositivo.id_paciente)


@router.post("/identificar")
def identificar(payload: IdentificarRequest, db: Session = Depends(get_db)):
    """
    La ESP cuenta cómo está. El servidor guarda eso (lo muestra la vista del
    médico) y le devuelve:
      - la hora: la ESP no tiene reloj propio al arrancar.
      - cuántas solicitudes tiene esperando.
      - el usuario asignado y su `pin_version`: si la ESP tiene cargado ese
        usuario pero con otro `pin_version`, es que cambiaron el PIN desde la
        web y tiene que pedirle el nuevo al paciente (verificar-pin).
    """
    dispositivo = obtener_dispositivo(db)
    dispositivo.ultimo_contacto = ahora_utc()
    dispositivo.vacia = payload.vacia
    dispositivo.usuario_reportado = None if payload.vacia else payload.usuario_actual
    dispositivo.archivos_pendientes = payload.archivos_pendientes
    registrar(
        db, dispositivo, "IDENTIFICAR",
        f"vacia={payload.vacia} usuario={payload.usuario_actual} pendientes={payload.archivos_pendientes}",
    )

    pendientes = (
        db.query(SolicitudDispositivo)
        .filter(
            SolicitudDispositivo.id_dispositivo == dispositivo.id_dispositivo,
            SolicitudDispositivo.estado.in_(ESTADOS_ACTIVOS),
        )
        .count()
    )
    paciente = _paciente_asignado(dispositivo, db)
    db.commit()

    ahora = datetime.now(ARGENTINA)
    return {
        "ok": True,
        "epoch": int(time.time()),
        "offset_minutos": int(ahora.utcoffset().total_seconds() // 60),
        "solicitudes_pendientes": pendientes,
        "usuario": sin_acentos(paciente.nombre_usuario) if paciente else None,
        "pin_version": pin_version(paciente) if paciente else None,
    }


@router.get("/solicitudes")
def listar_solicitudes(db: Session = Depends(get_db)):
    """
    Devuelve, en orden, las solicitudes que la ESP todavía tiene que
    responder: las nuevas (PENDIENTE) y las que ya retiró pero nunca contestó
    (ENTREGADA, ej. se cortó la luz con la pantalla de ACEPTAR abierta). Las
    nuevas pasan a ENTREGADA.

    El perfil de un CARGAR_PERFIL se arma en este momento, así lleva los
    datos más recientes del paciente aunque los haya editado después de
    que se creó la solicitud.
    """
    dispositivo = obtener_dispositivo(db)
    dispositivo.ultimo_contacto = ahora_utc()

    solicitudes = (
        db.query(SolicitudDispositivo)
        .filter(
            SolicitudDispositivo.id_dispositivo == dispositivo.id_dispositivo,
            SolicitudDispositivo.estado.in_(ESTADOS_ACTIVOS),
        )
        .order_by(SolicitudDispositivo.id_solicitud)
        .all()
    )

    salida = []
    for solicitud in solicitudes:
        if solicitud.tipo == TipoSolicitud.cargar_perfil and solicitud.paciente_destino is not None:
            solicitud.payload = {"perfil": armar_perfil(solicitud.paciente_destino)}
        if solicitud.estado == EstadoSolicitud.pendiente:
            solicitud.estado = EstadoSolicitud.entregada
            solicitud.entregada_en = ahora_utc()
            registrar(db, dispositivo, "ENTREGADA", f"solicitud {solicitud.id_solicitud} {solicitud.tipo.value}")
        salida.append({"id": solicitud.id_solicitud, "tipo": solicitud.tipo.value, "payload": solicitud.payload})

    db.commit()
    return {"ok": True, "solicitudes": salida}


def _aplicar(solicitud: SolicitudDispositivo, dispositivo: Dispositivo, db: Session, cancelada: bool) -> None:
    """Lo que cambia en la base cuando la ESP confirma que APLICÓ una solicitud."""
    if solicitud.tipo == TipoSolicitud.reset:
        dispositivo.vacia = True
        dispositivo.usuario_reportado = None
        dispositivo.archivos_pendientes = 0
        # Si el médico lo había cancelado, el dispositivo igual quedó vacío,
        # pero no le cargamos el reemplazo que ya no quería.
        reemplazo = None if cancelada else solicitud.id_paciente_destino
        dispositivo.id_paciente = reemplazo
        if reemplazo is not None:
            # Recién ahora: así el CARGAR_PERFIL nunca le llega antes que el RESET.
            db.add(SolicitudDispositivo(
                id_dispositivo=dispositivo.id_dispositivo,
                tipo=TipoSolicitud.cargar_perfil,
                estado=EstadoSolicitud.pendiente,
                payload={},
                id_medico=solicitud.id_medico,
                id_paciente_destino=reemplazo,
                creada_en=ahora_utc(),
            ))
            registrar(db, dispositivo, "CARGAR_PERFIL_CREADA", f"reemplazo paciente {reemplazo}", solicitud.id_medico)

    elif solicitud.tipo == TipoSolicitud.cargar_perfil:
        dispositivo.vacia = False
        dispositivo.usuario_reportado = (solicitud.payload.get("perfil") or {}).get("usuario")
        # Si estaba cancelada se había desasignado: el dispositivo tiene ese
        # perfil cargado, así que lo volvemos a asignar (si nadie lo ocupó).
        if dispositivo.id_paciente is None:
            dispositivo.id_paciente = solicitud.id_paciente_destino


@router.post("/solicitudes/{id_solicitud}/confirmar")
def confirmar_solicitud(id_solicitud: int, payload: ConfirmarRequest, db: Session = Depends(get_db)):
    """
    La ESP avisa qué pasó con una solicitud.

    Reglas:
      - Se puede repetir sin problema (si se cortó la luz antes de recibir la
        respuesta): si ya estaba resuelta, contesta 200 con el estado actual.
      - "Si la ESP dice que la aplicó, el servidor le cree": aunque el médico
        la haya cancelado mientras estaba en pantalla, se registra lo que
        realmente pasó en el dispositivo.
      - Un error no se reintenta solo: el médico la vuelve a pedir.
    """
    dispositivo = obtener_dispositivo(db)
    dispositivo.ultimo_contacto = ahora_utc()

    solicitud = db.get(SolicitudDispositivo, id_solicitud)
    if solicitud is None or solicitud.id_dispositivo != dispositivo.id_dispositivo:
        raise ErrorDispositivo(404, "solicitud_inexistente")

    finales = (EstadoSolicitud.confirmada, EstadoSolicitud.rechazada, EstadoSolicitud.error)
    if solicitud.estado in finales:
        db.commit()
        return {"ok": True, "estado": solicitud.estado.value}

    cancelada = solicitud.estado == EstadoSolicitud.cancelada
    solicitud.detalle = payload.detalle
    solicitud.confirmada_en = ahora_utc()

    if payload.ok:
        _aplicar(solicitud, dispositivo, db, cancelada)
        solicitud.estado = EstadoSolicitud.confirmada
        if cancelada:
            solicitud.detalle = "aplicada despues de cancelada"
    elif not cancelada:
        rechazada = payload.detalle == "rechazado_por_usuario"
        solicitud.estado = EstadoSolicitud.rechazada if rechazada else EstadoSolicitud.error
        # Un perfil que no se cargó deja el dispositivo libre otra vez.
        if (
            solicitud.tipo == TipoSolicitud.cargar_perfil
            and dispositivo.id_paciente == solicitud.id_paciente_destino
        ):
            dispositivo.id_paciente = None

    registrar(
        db, dispositivo, "CONFIRMAR",
        f"solicitud {solicitud.id_solicitud} {solicitud.tipo.value} ok={payload.ok} "
        f"detalle={payload.detalle} -> {solicitud.estado.value}",
    )
    db.commit()
    return {"ok": True, "estado": solicitud.estado.value}


# --- PIN ----------------------------------------------------------------------


@router.post("/verificar-pin")
def verificar_pin(payload: VerificarPinRequest, db: Session = Depends(get_db)):
    """
    La ESP manda el PIN que tipeó el paciente y el servidor lo compara contra
    el hash guardado. Si coincide, la ESP lo guarda y lo usa offline.

    Sólo se puede verificar el PIN del paciente asignado al dispositivo (no
    sirve para probar PINs de cualquier usuario). Sin límite de intentos, igual
    que el login de pacientes (ver app/core/security.py).
    """
    dispositivo = obtener_dispositivo(db)
    dispositivo.ultimo_contacto = ahora_utc()

    paciente = _paciente_asignado(dispositivo, db)
    if paciente is None:
        db.commit()
        raise ErrorDispositivo(404, "sin_paciente_asignado")
    if payload.usuario != sin_acentos(paciente.nombre_usuario):
        db.commit()
        raise ErrorDispositivo(404, "usuario_no_asignado")

    if not verificar_secreto(payload.pin, paciente.pin_hash):
        registrar(db, dispositivo, "PIN_INCORRECTO")
        db.commit()
        raise ErrorDispositivo(401, "pin_incorrecto")

    # Se anota la versión: así la vista del paciente sabe si el dispositivo
    # ya tiene su PIN actual (ver app/routers/dispositivo_paciente.py).
    registrar(db, dispositivo, "PIN_OK", pin_version(paciente))
    db.commit()
    return {"ok": True, "pin_version": pin_version(paciente)}
