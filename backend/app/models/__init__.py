"""
Importa las 9 tablas del documento de arquitectura en un solo lugar, para
que `Base.metadata.create_all()` (en app/main.py) las conozca a todas al
crear las tablas, y para que las relaciones declaradas como strings
(ej. "MedicoPaciente") se puedan resolver sin problema.
"""

from app.models.anotacion import Anotacion
from app.models.dispositivo import Dispositivo, RegistroSync, SolicitudDispositivo
from app.models.entrenamiento import Entrenamiento, EntrenamientoGraficar
from app.models.evaluacion import Evaluacion, EvaluacionMuestra
from app.models.frecuencia_recomendada import FrecuenciaRecomendada
from app.models.medico import Medico
from app.models.medico_paciente import MedicoPaciente
from app.models.nota_medica import NotaMedica
from app.models.paciente import Paciente
from app.models.rutina import Rutina

__all__ = [
    "Paciente",  # tabla usuarios
    "Medico",  # tabla medicos
    "MedicoPaciente",  # tabla medico_paciente
    "Evaluacion",  # tabla evaluaciones
    "EvaluacionMuestra",  # tabla evaluaciones_muestras
    "Entrenamiento",  # tabla entrenamientos
    "EntrenamientoGraficar",  # tabla entrenamientos_graficar
    "Rutina",  # tabla rutina
    "NotaMedica",  # tabla notas_medicas
    # No es una de las 9 tablas del documento de arquitectura — es exclusiva
    # de la web, no la sincroniza el dispositivo.
    "FrecuenciaRecomendada",  # tabla frecuencia_recomendada
    "Anotacion",  # tabla anotaciones (notas de los médicos en gráficos/sesiones)
    # Conexión con la ESP (ver app/models/dispositivo.py).
    "Dispositivo",  # tabla dispositivo
    "SolicitudDispositivo",  # tabla solicitudes_dispositivo
    "RegistroSync",  # tabla registro_sync
]
