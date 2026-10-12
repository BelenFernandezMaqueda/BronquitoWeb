"""
Carga datos de ejemplo la primera vez que la base está vacía, para poder
probar login y endpoints sin escribir SQL a mano. Quedan documentadas acá
mismo las credenciales de prueba — usalas en /docs para probar cada flujo.

Médico de prueba:
    usuario:    belen.fernandez@bronquito.app
    contraseña: medico1234

Pacientes de prueba (nombre de usuario / pin):
    msalerno / 1234   (Malena Salerno) — perfil completo (con mail) y
                       ~3 meses de evaluaciones y entrenamientos inventados
    therrera  / 5678   (Tomás Herrera)  — perfil completo (con mail)
    rfernandez  / 4321   (Rocío Fernández)
"""

import csv
import math
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.security import hashear_secreto
from app.models.entrenamiento import Entrenamiento, EntrenamientoGraficar
from app.models.evaluacion import Evaluacion, EvaluacionMuestra
from app.models.enums import OrigenRutina, TipoEvaluacion
from app.models.frecuencia_recomendada import FrecuenciaRecomendada
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


# FVC y PEF con los que se cargaron las dos visitas de Malena que usan los
# ensayos 1 y 2 tal cual (ver seed_if_empty). Las curvas del historial se
# escalan a partir de esos valores.
REFERENCIA_ENSAYOS_102 = {1: (4.15, 445.0), 2: (4.08, 430.0)}

# Días en que entrena Malena: martes, jueves y sábado (0 = lunes).
DIAS_ENTRENAMIENTO_MALENA = [1, 3, 5]

# Resistencia programada a partir de cada día del historial (contando desde
# el primer entrenamiento): se la va subiendo de a poco hasta la de la rutina.
RESISTENCIAS_MALENA = [(0, 25.0), (14, 28.0), (26, 30.0), (34, 32.0), (39, 35.0)]


def _historial_malena(db: Session, malena: Paciente, medico: Medico, hoy: datetime) -> None:
    """
    ~3 meses de historial inventado para Malena, para ver cómo quedan los
    gráficos de evolución con más puntos: una sesión de consultorio cada dos
    semanas y entrenamientos tres veces por semana. Va mejorando de a poco,
    con algún día malo y una semana sin entrenar por un resfrío (y el bajón
    a la vuelta). Usa un `random` con semilla fija para que salga siempre
    igual.
    """
    azar = random.Random(102)

    # Sesiones de consultorio anteriores a las dos visitas de seed_if_empty:
    # (días antes de hoy, hora, (fvc, fev1, pef, fivc, fiv1), pim).
    sesiones = [
        (84, 15, (3.88, 3.24, 398.0, 3.76, 3.10), 38.0),
        (70, 9, (3.93, 3.30, 405.0, 3.80, 3.16), 41.0),
        (56, 16, (3.90, 3.27, 402.0, 3.79, 3.14), 42.0),
        (42, 11, (3.98, 3.36, 418.0, 3.86, 3.22), 46.0),
        (28, 17, (3.95, 3.31, 410.0, 3.83, 3.18), 44.0),  # a la vuelta del resfrío
        (14, 10, (4.03, 3.41, 425.0, 3.92, 3.27), 49.0),
    ]
    for i, (dias, hora, (fvc, fev1, pef, fivc, fiv1), pim) in enumerate(sesiones):
        fecha_hora = (hoy - timedelta(days=dias)).replace(hour=hora)
        temperatura = round(azar.uniform(21.5, 24.0), 1)
        humedad = round(azar.uniform(46.0, 58.0), 1)

        espirometria = Evaluacion(
            id_paciente=malena.id_paciente,
            tipo=TipoEvaluacion.espirometria,
            fecha_hora=fecha_hora,
            fvc=fvc, fev1=fev1, pef=pef, fivc=fivc, fiv1=fiv1,
            temperatura=temperatura, humedad=humedad,
        )
        pim_pem = Evaluacion(
            id_paciente=malena.id_paciente,
            tipo=TipoEvaluacion.pim_pem,
            fecha_hora=fecha_hora,
            pim=pim,
            temperatura=temperatura, humedad=humedad,
        )
        db.add_all([espirometria, pim_pem])
        db.flush()

        # La curva real del sujeto 102 escalada a los valores de esta sesión,
        # y un poco más rápida o más lenta para que no sean todas iguales.
        ensayo = 1 + i % 2
        fvc_ref, pef_ref = REFERENCIA_ENSAYOS_102[ensayo]
        escala_volumen = fvc / fvc_ref
        escala_flujo = pef / pef_ref
        escala_tiempo = azar.uniform(0.94, 1.06)
        muestras = _muestras_espirometria_102(ensayo)
        db.add(
            EvaluacionMuestra(
                id_evaluacion=espirometria.id_evaluacion,
                tiempo=[round(t * escala_tiempo, 3) for t, _, _ in muestras],
                flujo=[round(f * escala_flujo, 4) for _, f, _ in muestras],
                presion=[0.0] * len(muestras),
                volumen=[round(v * escala_volumen, 4) for _, _, v in muestras],
            )
        )

        tiempos, presiones = _muestras_pim(pim)
        db.add(
            EvaluacionMuestra(
                id_evaluacion=pim_pem.id_evaluacion,
                tiempo=tiempos,
                flujo=[0.0] * len(tiempos),
                presion=presiones,
                volumen=[0.0] * len(tiempos),
            )
        )

    # Entrenamientos desde hace 12 semanas hasta ayer, salteando los días que
    # ya tienen uno cargado, la semana del resfrío y alguna sesión suelta.
    inicio = (hoy - timedelta(days=82)).date()
    fin = (hoy - timedelta(days=1)).date()
    resfrio_desde = (hoy - timedelta(days=38)).date()
    resfrio_hasta = (hoy - timedelta(days=31)).date()
    ya_cargados = {
        e.fecha_hora.date()
        for e in db.query(Entrenamiento).filter_by(id_paciente=malena.id_paciente)
    }

    entrenamientos = []
    dia = inicio
    while dia <= fin:
        if (
            dia.weekday() in DIAS_ENTRENAMIENTO_MALENA
            and dia not in ya_cargados
            and not resfrio_desde <= dia <= resfrio_hasta
            and azar.random() > 0.12
        ):
            dias_desde_inicio = (dia - inicio).days
            p = dias_desde_inicio / (fin - inicio).days  # 0 → 1 a lo largo del historial
            resistencia = next(r for d, r in reversed(RESISTENCIAS_MALENA) if dias_desde_inicio >= d)
            repeticiones = 10 if dias_desde_inicio < 20 else 12

            # Los primeros días después del resfrío y algún día suelto rinde menos.
            mal_dia = (dia - resfrio_hasta).days in range(1, 7) or azar.random() < 0.08
            forma = 0.88 if mal_dia else 1.0

            presion_max = (36 + 20 * p) * forma + azar.gauss(0, 1.2)
            entrenamientos.append(
                Entrenamiento(
                    id_paciente=malena.id_paciente,
                    fecha_hora=datetime(
                        dia.year, dia.month, dia.day,
                        azar.choice([12, 13, 21, 22]), azar.choice([0, 15, 30, 45]),
                        tzinfo=timezone.utc,
                    ),
                    resistencia_programada=resistencia,
                    repeticiones_programadas=repeticiones,
                    presion_max=round(presion_max, 1),
                    presion_promedio=round(presion_max * azar.uniform(0.82, 0.88), 1),
                    indice_fatiga=round(15 - 9 * p + azar.gauss(0, 1.0) + (5 if mal_dia else 0), 1),
                    potencia_insp=round((2.6 + 2.0 * p) * forma + azar.gauss(0, 0.12), 2),
                    trabajo=round((2.5 + 1.8 * p) * repeticiones * forma + azar.gauss(0, 1.5), 1),
                    duty_cycle=round(34 + 13 * p + azar.gauss(0, 1.2) - (3 if mal_dia else 0), 1),
                    tiempo_entre_reps=round(5.0 - 2.0 * p + azar.gauss(0, 0.2) + (0.6 if mal_dia else 0), 1),
                    volumen_total=round((1.25 + 0.4 * p) * repeticiones * forma + azar.gauss(0, 0.4), 1),
                    temperatura=round(19 + 4 * p + azar.gauss(0, 1.0), 1),
                    humedad=round(azar.uniform(50.0, 68.0), 1),
                )
            )
        dia += timedelta(days=1)
    db.add_all(entrenamientos)

    # La frecuencia recomendada que coincide con esos días, para el calendario.
    db.add(
        FrecuenciaRecomendada(
            id_paciente=malena.id_paciente,
            id_medico=medico.id_medico,
            sesiones_por_semana=len(DIAS_ENTRENAMIENTO_MALENA),
            dias_semana=DIAS_ENTRENAMIENTO_MALENA,
            vigente_desde=inicio,
            creado_en=datetime(inicio.year, inicio.month, inicio.day, 12, 0, tzinfo=timezone.utc),
        )
    )


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
            nombre_usuario="msalerno", pin_hash=hashear_secreto("1234"),
            nombre="Malena", apellido="Salerno",
            email="malena.salerno@mail.com",
            altura_cm=171, peso_kg=70, fecha_nacimiento=date(2004, 5, 31),
            sexo="F", fumador=False, fecha_registro=date(2026, 7, 18),
            acepto_terminos=True,
            fecha_aceptacion_terminos=datetime(2026, 7, 18, tzinfo=timezone.utc),
        ),
        Paciente(
            nombre_usuario="therrera", pin_hash=hashear_secreto("5678"),
            nombre="Tomás", apellido="Herrera",
            email="tomas.herrera@mail.com",
            altura_cm=178, peso_kg=82, fecha_nacimiento=date(1998, 3, 14),
            sexo="M", fumador=False, fecha_registro=date(2026, 6, 1),
            acepto_terminos=True,
            fecha_aceptacion_terminos=datetime(2026, 6, 1, tzinfo=timezone.utc),
        ),
        Paciente(
            nombre_usuario="rfernandez", pin_hash=hashear_secreto("4321"),
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

    _historial_malena(db, malena, medico, hoy)

    db.commit()
