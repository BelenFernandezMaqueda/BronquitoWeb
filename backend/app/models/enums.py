"""
Enums compartidos por varios modelos. Se guardan en MySQL como texto corto
(`native_enum=False`), no como el tipo ENUM propio de MySQL, para que sea más
fácil de leer/migrar después.
"""

import enum


class TipoEvaluacion(str, enum.Enum):
    """TABLA EVALUACIONES.TIPO"""

    espirometria = "ESPIROMETRIA"
    pim_pem = "PIM_PEM"


class OrigenRutina(str, enum.Enum):
    """TABLA RUTINA.MODIFICADO_POR — quién generó/ajustó la rutina activa."""

    algoritmo = "ALGORITMO"
    medico = "MEDICO"
