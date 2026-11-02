"""
Pasa una prueba de la SD de la ESP (el `.json` + el `.csv` de /EVALUACIONES)
al formato de la web: una `Evaluacion` con sus métricas y una
`EvaluacionMuestra` con la curva. Así las pruebas reales se grafican, se
anotan y se exportan igual que los datos de ejemplo de app/seed.py.

Lo que cambia entre la SD y la web:
  - El `.csv` es `tiempo_ms,presion_cmh2o,flujo_lmin`. La web guarda el
    tiempo en segundos y el flujo en L/s, y además necesita el volumen, que la
    ESP no guarda: se integra el flujo igual que lo hace el equipo al mostrar
    el historial (`Evaluaciones::cargarSerie` del firmware).
  - La PIM y la espirometría de una calibración se guardan en momentos
    distintos, pero la web arma cada sesión con el `fecha_hora` exacto: las
    dos toman la hora de la calibración (`eval_AAAAMMDD_HHMMSS`).
  - Las pruebas sin hora (`eval_SINHORA_n`) van a FECHA_SIN_HORA con una hora
    al azar, la misma para todas las pruebas de esa calibración.

Qué no aparece en la web (queda sólo en `archivos_dispositivo`):
  - Las espirometrías que no pasaron la validación (`"valida": false`).
  - La PIM "en cero" que guarda el equipo cuando no tiene sensor de PIM.
"""

import hashlib
import json
import math
import random
import re
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.core.dispositivo import ahora_utc
from app.models.dispositivo import ArchivoDispositivo
from app.models.enums import TipoEvaluacion
from app.models.evaluacion import Evaluacion, EvaluacionMuestra
from app.models.paciente import Paciente

# Las pruebas sin hora que había en la SD cuando se armó la subida son todas
# de este día. Si después aparecen otras sin hora, también caen acá: cambiar
# esta fecha si hace falta.
FECHA_SIN_HORA = date(2026, 11, 1)
# Franja en la que se sortea la hora de las pruebas sin hora.
HORA_SIN_HORA_DESDE = time(8, 0)
HORA_SIN_HORA_HASTA = time(21, 0)

# Columnas del .csv que escribe la ESP. Si el encabezado no está, se asume este orden (como la ESP).
COLUMNAS_CSV = ("tiempo_ms", "presion_cmh2o", "flujo_lmin")

_FECHA_EN_ID = re.compile(r"eval_(\d{8})_(\d{6})")


def _texto(valor) -> str | None:
    return valor if isinstance(valor, str) and valor else None


def _numero(valor) -> float | None:
    """Número del .json, o None si viene null, como texto o no es finito."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    return float(valor) if math.isfinite(valor) else None


def _csv_normalizado(csv: str | None) -> str:
    """Sin \\r ni líneas vacías: así da igual cómo cortó las líneas quien lo mandó."""
    return "\n".join(linea.strip() for linea in (csv or "").splitlines() if linea.strip())


def huella(resumen: dict, csv: str | None) -> str:
    """
    Huella del contenido de la prueba. No incluye "sincronizado": es lo único
    del archivo que cambia la ESP después de subirlo.
    """
    datos = {clave: valor for clave, valor in resumen.items() if clave != "sincronizado"}
    texto = json.dumps(datos, sort_keys=True, separators=(",", ":")) + "\n" + _csv_normalizado(csv)
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def tipo_de(resumen: dict) -> TipoEvaluacion | None:
    """Mismo criterio que el historial del equipo: "PIM..." o "ESPIRO..."."""
    tipo = str(resumen.get("tipo") or "").upper()
    if tipo.startswith("ESPIRO"):
        return TipoEvaluacion.espirometria
    if tipo.startswith("PIM"):
        return TipoEvaluacion.pim_pem
    return None


def motivo_oculta(resumen: dict) -> str | None:
    """Por qué una prueba no se muestra en la web, o None si se muestra."""
    tipo = tipo_de(resumen)
    if tipo is None:
        return "tipo_desconocido"
    if tipo == TipoEvaluacion.espirometria and resumen.get("valida") is False:
        return "espirometria_invalida"
    # Sin sensor de PIM el equipo guarda una PIM en 0 (sin "valida" ni intentos):
    # no es una medición y metería un 0 en la evolución.
    if tipo == TipoEvaluacion.pim_pem and "valida" not in resumen and resumen.get("pim_sostenida_cmh2o") == 0:
        return "pim_en_cero"
    return None


def leer_csv(csv: str | None) -> list[tuple[float, float, float]]:
    """
    Filas (tiempo_ms, presion_cmh2o, flujo_lmin) del `.csv`. Igual que la ESP,
    saltea el encabezado y las líneas que no son números. Si el encabezado
    trae las columnas en otro orden, las busca por nombre.
    """
    orden = (0, 1, 2)
    filas = []
    for linea in (csv or "").splitlines():
        partes = [parte.strip() for parte in linea.split(",")]
        if len(partes) < 3:
            continue
        try:
            valores = [float(parte) for parte in partes]
        except ValueError:
            nombres = [parte.lower() for parte in partes]
            if all(columna in nombres for columna in COLUMNAS_CSV):
                orden = tuple(nombres.index(columna) for columna in COLUMNAS_CSV)
            continue
        fila = tuple(valores[i] for i in orden)
        if all(math.isfinite(v) for v in fila):
            filas.append(fila)
    return filas


def curva(filas: list[tuple[float, float, float]], resumen: dict) -> dict[str, list[float]] | None:
    """
    La curva en las unidades de la web: tiempo (s), flujo (L/s), presión
    (cmH₂O) y volumen (L). El volumen es la integral del flujo, sólo dentro de
    la ventana del soplido si el .json la trae (`evento_inicio_ms` /
    `evento_fin_ms`): antes vale 0 y después queda constante.
    None si no hay curva (ej. una PIM sin intento informado).
    """
    if len(filas) < 2:
        return None
    inicio = _numero(resumen.get("evento_inicio_ms"))
    fin = _numero(resumen.get("evento_fin_ms"))
    con_ventana = inicio is not None and fin is not None and inicio >= 0

    tiempo, flujo, presion, volumen = [], [], [], []
    acumulado = 0.0
    t_anterior = None
    for t_ms, p, q in filas:
        if t_anterior is not None and (not con_ventana or inicio <= t_ms <= fin):
            acumulado += q * (t_ms - t_anterior) / 60000
        t_anterior = t_ms
        tiempo.append(round(t_ms / 1000, 3))
        flujo.append(round(q / 60, 4))
        presion.append(round(p, 2))
        volumen.append(round(acumulado, 4))
    return {"tiempo": tiempo, "flujo": flujo, "presion": presion, "volumen": volumen}


def _fecha_en_id(*ids: str | None) -> datetime | None:
    """La hora que va en el nombre: "eval_20261030_162009_ESP" -> 30/10/2026 16:20:09."""
    for texto in ids:
        coincidencia = _FECHA_EN_ID.search(texto or "")
        if coincidencia:
            try:
                return datetime.strptime(coincidencia.group(1) + coincidencia.group(2), "%Y%m%d%H%M%S")
            except ValueError:
                pass
    return None


def _fecha_del_resumen(resumen: dict) -> datetime | None:
    texto = _texto(resumen.get("fecha_hora"))
    if texto:
        try:
            return datetime.strptime(texto[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    return None


def _fecha_sin_hora(db: Session, paciente: Paciente, calibracion_id: str | None, nombre: str) -> datetime:
    """
    Si ya llegó otra prueba de la misma calibración, usa su hora (así la PIM y
    la espirometría quedan en la misma sesión). Si ya había llegado una prueba
    con este mismo nombre, es una calibración nueva que reusó el número (el
    contador de SINHORA vuelve a 1 después de formatear el equipo).

    Si no, sortea una hora de FECHA_SIN_HORA que no use ninguna otra sesión
    del paciente.
    """
    if calibracion_id:
        anterior = (
            db.query(ArchivoDispositivo)
            .filter(
                ArchivoDispositivo.id_paciente == paciente.id_paciente,
                ArchivoDispositivo.calibracion_id == calibracion_id,
            )
            .order_by(ArchivoDispositivo.id_archivo.desc())
            .first()
        )
        if anterior is not None:
            mismo_nombre = (
                db.query(ArchivoDispositivo)
                .filter(
                    ArchivoDispositivo.id_paciente == paciente.id_paciente,
                    ArchivoDispositivo.calibracion_id == calibracion_id,
                    ArchivoDispositivo.fecha_hora == anterior.fecha_hora,
                    ArchivoDispositivo.nombre == nombre,
                )
                .first()
            )
            if mismo_nombre is None:
                return anterior.fecha_hora

    ocupadas = {
        fila.fecha_hora
        for fila in db.query(Evaluacion.fecha_hora).filter(Evaluacion.id_paciente == paciente.id_paciente)
    } | {
        fila.fecha_hora
        for fila in db.query(ArchivoDispositivo.fecha_hora).filter(
            ArchivoDispositivo.id_paciente == paciente.id_paciente,
        )
    }
    desde = datetime.combine(FECHA_SIN_HORA, HORA_SIN_HORA_DESDE)
    segundos = int((datetime.combine(FECHA_SIN_HORA, HORA_SIN_HORA_HASTA) - desde).total_seconds())
    fecha = desde
    for _ in range(100):
        fecha = desde + timedelta(seconds=random.randrange(segundos))
        if fecha not in ocupadas:
            break
    return fecha


def guardar_prueba(db: Session, paciente: Paciente, archivo: str, resumen: dict, csv: str | None) -> dict:
    """
    Guarda una prueba que subió la ESP. Si ya había llegado (misma huella), no
    hace nada. Devuelve lo que se le contesta a la ESP (sin acentos):
      - estado: "nueva" o "repetida".
      - visible: si aparece en la web.
      - id_evaluacion: la evaluación de la web (null si no aparece).
    """
    marca = huella(resumen, csv)
    existente = (
        db.query(ArchivoDispositivo)
        .filter(ArchivoDispositivo.id_paciente == paciente.id_paciente, ArchivoDispositivo.huella == marca)
        .first()
    )
    if existente is not None:
        return {
            "estado": "repetida",
            "visible": existente.id_evaluacion is not None,
            "id_evaluacion": existente.id_evaluacion,
        }

    calibracion_id = _texto(resumen.get("calibracion_id"))
    fecha = (
        _fecha_en_id(calibracion_id, _texto(resumen.get("id_evaluacion")), archivo)
        or _fecha_del_resumen(resumen)
        or _fecha_sin_hora(db, paciente, calibracion_id, archivo)
    )

    motivo = motivo_oculta(resumen)
    evaluacion = None
    if motivo is None:
        evaluacion = Evaluacion(
            id_paciente=paciente.id_paciente,
            tipo=tipo_de(resumen),
            fecha_hora=fecha,
            fvc=_numero(resumen.get("fvc")),
            fev1=_numero(resumen.get("fev1")),
            pef=_numero(resumen.get("pef")),
            fivc=_numero(resumen.get("fivc")),
            fiv1=_numero(resumen.get("fiv1")),
            pim=_numero(resumen.get("pim_sostenida_cmh2o")),
            temperatura=_numero(resumen.get("temperatura_c")),
            humedad=_numero(resumen.get("humedad_rel_pct")),
        )
        db.add(evaluacion)
        db.flush()  # para tener el id_evaluacion
        puntos = curva(leer_csv(csv), resumen)
        if puntos is not None:
            db.add(EvaluacionMuestra(id_evaluacion=evaluacion.id_evaluacion, **puntos))

    db.add(
        ArchivoDispositivo(
            id_paciente=paciente.id_paciente,
            nombre=archivo,
            calibracion_id=calibracion_id,
            huella=marca,
            resumen=resumen,
            fecha_hora=fecha,
            id_evaluacion=evaluacion.id_evaluacion if evaluacion else None,
            motivo_oculta=motivo,
            recibido_en=ahora_utc(),
        )
    )
    db.flush()
    return {
        "estado": "nueva",
        "visible": evaluacion is not None,
        "id_evaluacion": evaluacion.id_evaluacion if evaluacion else None,
    }
