"""
Lo que ve el paciente del dispositivo desde la web: el código para
conectarlo y si ya tiene su PIN actual. Es sólo lectura: el paciente no
puede formatear, asignar ni cambiar el usuario (eso es del médico, ver
app/routers/dispositivo_medico.py).

Sirve sobre todo después de "Olvidé mi PIN": el PIN nuevo llega al
dispositivo recién cuando sincroniza, y acá el paciente ve si ya pasó.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_paciente
from app.core.dispositivo import direccion_red_local, obtener_dispositivo, pin_version
from app.models.dispositivo import RegistroSync
from app.models.paciente import Paciente
from app.schemas.dispositivo import ConexionOut, DispositivoPacienteOut

router = APIRouter(prefix="/pacientes/me/dispositivo", tags=["dispositivo (paciente)"])


@router.get("", response_model=DispositivoPacienteOut)
def mi_dispositivo(paciente: Paciente = Depends(get_current_paciente), db: Session = Depends(get_db)):
    dispositivo = obtener_dispositivo(db)
    db.commit()
    conexion = ConexionOut(**direccion_red_local())

    # Si el dispositivo es de otro paciente, sólo el código: nada de su estado.
    if dispositivo.id_paciente != paciente.id_paciente:
        return DispositivoPacienteOut(asignado=False, ultimo_contacto=None, pin_actualizado=None, conexion=conexion)

    # El último PIN que validó el dispositivo (verificar-pin anota su versión).
    ultimo_pin_ok = (
        db.query(RegistroSync)
        .filter(RegistroSync.id_dispositivo == dispositivo.id_dispositivo, RegistroSync.evento == "PIN_OK")
        .order_by(RegistroSync.id_registro.desc())
        .first()
    )
    return DispositivoPacienteOut(
        asignado=True,
        ultimo_contacto=dispositivo.ultimo_contacto,
        pin_actualizado=ultimo_pin_ok is not None and ultimo_pin_ok.detalle == pin_version(paciente),
        conexion=conexion,
    )
