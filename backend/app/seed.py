"""
Carga datos de ejemplo la primera vez que la base está vacía, para poder
probar login y endpoints sin escribir SQL a mano. Quedan documentadas acá
mismo las credenciales de prueba — usalas en /docs para probar cada flujo.

Médico de prueba:
    usuario:    belen.fernandez@bronquito.app
    contraseña: medico1234

Pacientes de prueba (dni / pin):
    45819569 / 1234   (Malena Salerno) — perfil completo (con mail)
    38123456 / 5678   (Tomás Herrera)  — perfil completo (con mail)
    29987654 / 4321   (Rocío Fernández)
"""

import csv
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.security import hashear_secreto
from app.models.entrenamiento import Entrenamiento, EntrenamientoGraficar
from app.models.evaluacion import Evaluacion, EvaluacionMuestra
from app.models.enums import OrigenRutina, TipoEvaluacion
from app.models.medico import Medico
from app.models.medico_paciente import MedicoPaciente
from app.models.nota_medica import NotaMedica
from app.models.paciente import Paciente
from app.models.rutina import Rutina

# Curva real de espirometría (sujeto 102, visita 2, ensayos 1 y 2) tomada de
# un dataset de referencia, para tener muestras de gráfico realistas en vez
# de 4 puntos inventados.
RUTA_ESPIROMETRIA_102 = Path(__file__).resolve().parent / "seed_data" / "espirometria_102_visita2.csv"


def _muestras_espirometria_102(ensayo: int):
    """Muestras (tiempo_seg, flujo, volumen) del ensayo indicado, ordenadas por tiempo."""
    with RUTA_ESPIROMETRIA_102.open(newline="") as archivo:
        muestras = [
            (float(fila["Time"]) / 1000, float(fila["Flow"]), float(fila["Volume"]))
            for fila in csv.DictReader(archivo)
            if int(fila["Trial"]) == ensayo
        ]
    return sorted(muestras)


def _muestras_pim(pico: float):
    """
    Curva sintética de una maniobra de PIM (presión inspiratoria máxima):
    reposo, subida a `pico` (cmH₂O), sostenida ~1s y vuelta a reposo.
    No hay flujo ni volumen medidos (válvula cerrada), quedan en 0.
    """
    paso = 0.02
    duracion = 3.0
    n = int(duracion / paso)
    tiempos = [round(i * paso, 2) for i in range(n)]
    presiones = []
    for t in tiempos:
        if t < 0.3:
            p = 0.0
        elif t < 0.8:
            frac = (t - 0.3) / 0.5
            p = pico * (1 - math.cos(frac * math.pi)) / 2
        elif t < 1.8:
            p = pico
        elif t < 2.3:
            frac = (t - 1.8) / 0.5
            p = pico * (1 + math.cos(frac * math.pi)) / 2
        else:
            p = 0.0
        presiones.append(round(p, 2))
    return tiempos, presiones


def seed_if_empty(db: Session) -> None:
    if db.query(Medico).first() is not None:
        return  # ya hay datos, no volvemos a insertar

    medico = Medico(
        usuario="belen.fernandez@bronquito.app",
        contrasena_hash=hashear_secreto("medico1234"),
        nombre="Belén",
        apellido="Fernández",
        fecha_registro=date(2026, 5, 1),
        acepto_terminos=True,
        fecha_aceptacion_terminos=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    db.add(medico)
    db.flush()  # para que medico.id_medico ya exista antes de usarlo abajo

    # Pacientes de ejemplo registrados con el perfil web completo.
    pacientes = [
        Paciente(
            dni="45819569", pin_hash=hashear_secreto("1234"),
            nombre="Malena", apellido="Salerno",
            email="malena.salerno@mail.com",
            altura_cm=171, peso_kg=70, fecha_nacimiento=date(2004, 5, 31),
            sexo="F", fumador=False, fecha_registro=date(2026, 7, 18),
            acepto_terminos=True,
            fecha_aceptacion_terminos=datetime(2026, 7, 18, tzinfo=timezone.utc),
        ),
        Paciente(
            dni="38123456", pin_hash=hashear_secreto("5678"),
            nombre="Tomás", apellido="Herrera",
            email="tomas.herrera@mail.com",
            altura_cm=178, peso_kg=82, fecha_nacimiento=date(1998, 3, 14),
            sexo="M", fumador=False, fecha_registro=date(2026, 6, 1),
            acepto_terminos=True,
            fecha_aceptacion_terminos=datetime(2026, 6, 1, tzinfo=timezone.utc),
        ),
        Paciente(
            dni="29987654", pin_hash=hashear_secreto("4321"),
            nombre="Rocío", apellido="Fernández",
            email="rocio.fernandez@mail.com",
            altura_cm=160, peso_kg=65, fecha_nacimiento=date(1965, 11, 2),
            sexo="F", fumador=True, fecha_registro=date(2026, 6, 20),
            acepto_terminos=True,
            fecha_aceptacion_terminos=datetime(2026, 6, 20, tzinfo=timezone.utc),
        ),
    ]
    db.add_all(pacientes)
    db.flush()  # para que cada paciente.id_paciente ya exista

    malena = pacientes[0]

    db.add_all(
        MedicoPaciente(
            id_medico=medico.id_medico,
            id_paciente=p.id_paciente,
            fecha_vinculacion=datetime.now(timezone.utc),
        )
        for p in pacientes
    )

    db.add_all(
        Rutina(
            id_paciente=p.id_paciente,
            resistencia_activa=35.0,
            tiempo_descanso=60,
            repeticiones=12,
            modificado_por=OrigenRutina.medico,
            fecha_actualizacion=date(2026, 8, 25),
        )
        for p in pacientes
    )

    # Dos evaluaciones de Malena con la curva real del sujeto 102 (visita 2,
    # ensayos 1 y 2), como si fueran dos visitas distintas: una de hoy y otra de
    # antes de ayer. Es espirometría (válvulas abiertas), así que no hay presión
    # medida y queda en 0 para todas sus muestras.
    hoy = datetime.now(timezone.utc).replace(hour=10, minute=15, second=0, microsecond=0)
    anteayer = hoy - timedelta(days=2)

    for ensayo, fecha_hora, (fvc, fev1, pef, fivc, fiv1, temperatura, humedad) in [
        (1, hoy, (4.15, 3.52, 445.0, 4.05, 3.40, 23.0, 53.0)),
        (2, anteayer, (4.08, 3.45, 430.0, 3.95, 3.30, 22.5, 50.0)),
    ]:
        evaluacion_102 = Evaluacion(
            id_paciente=malena.id_paciente,
            tipo=TipoEvaluacion.espirometria,
            fecha_hora=fecha_hora,
            fvc=fvc, fev1=fev1, pef=pef, fivc=fivc, fiv1=fiv1,
            temperatura=temperatura, humedad=humedad,
        )
        db.add(evaluacion_102)
        db.flush()

        muestras = _muestras_espirometria_102(ensayo)
        tiempos, flujos, volumenes = zip(*muestras)
        db.add(
            EvaluacionMuestra(
                id_evaluacion=evaluacion_102.id_evaluacion,
                tiempo=list(tiempos),
                flujo=list(flujos),
                presion=[0.0] * len(muestras),
                volumen=list(volumenes),
            )
        )

    # Una evaluación de PIM por cada visita de espirometría, misma sesión de
    # consultorio: se guarda el mismo `fecha_hora` exacto que su espirometría
    # (se captura una sola vez al arrancar la sesión), así el front puede
    # reconocer que forman parte de la misma evaluación.
    for fecha_hora, pico in [
        (hoy, 58.0),
        (anteayer, 52.0),
    ]:
        evaluacion_pim = Evaluacion(
            id_paciente=malena.id_paciente,
            tipo=TipoEvaluacion.pim_pem,
            fecha_hora=fecha_hora,
            pim=pico,
            temperatura=23.0, humedad=52.0,
        )
        db.add(evaluacion_pim)
        db.flush()

        tiempos, presiones = _muestras_pim(pico)
        db.add(
            EvaluacionMuestra(
                id_evaluacion=evaluacion_pim.id_evaluacion,
                tiempo=tiempos,
                flujo=[0.0] * len(tiempos),
                presion=presiones,
                volumen=[0.0] * len(tiempos),
            )
        )

    entrenamientos_malena = [
        Entrenamiento(
            id_paciente=malena.id_paciente,
            fecha_hora=datetime(2026, 8, 29, 9, 0, tzinfo=timezone.utc),
            resistencia_programada=35.0,
            repeticiones_programadas=12,
            presion_max=48.5,
            presion_promedio=41.2,
            indice_fatiga=8.5,
            potencia_insp=3.8,
            trabajo=45.2,
            duty_cycle=42.0,
            tiempo_entre_reps=3.5,
            volumen_total=18.4,
            temperatura=23.5,
            humedad=55.0,
        ),
        Entrenamiento(
            id_paciente=malena.id_paciente,
            fecha_hora=datetime(2026, 8, 27, 9, 0, tzinfo=timezone.utc),
            resistencia_programada=32.0,
            repeticiones_programadas=12,
            presion_max=45.0,
            presion_promedio=38.5,
            indice_fatiga=11.0,
            potencia_insp=3.4,
            trabajo=40.1,
            duty_cycle=39.5,
            tiempo_entre_reps=4.0,
            volumen_total=17.2,
            temperatura=22.0,
            humedad=58.0,
        ),
    ]
    db.add_all(entrenamientos_malena)
    db.flush()

    db.add_all(
        EntrenamientoGraficar(
            id_entrenamiento=entrenamientos_malena[0].id_entrenamiento,
            tiempo=t, volumen=v, flujo=f, presion=p, fase=fase, repeticion=rep,
        )
        for t, v, f, p, fase, rep in [
            (0.0, 0.0, 0.0, 0.0, "DESCANSO", 1),
            (1.0, 0.4, 2.8, 30.0, "ESFUERZO", 1),
            (2.0, 0.9, 3.1, 45.0, "ESFUERZO", 1),
            (3.0, 0.9, 0.0, 0.0, "DESCANSO", 2),
        ]
    )

    db.add(
        NotaMedica(
            id_paciente=malena.id_paciente,
            id_medico=medico.id_medico,
            mensaje="Buena evolución esta semana. Mantené la resistencia actual una semana más.",
            fecha=date(2026, 8, 29),
        )
    )

    db.commit()
