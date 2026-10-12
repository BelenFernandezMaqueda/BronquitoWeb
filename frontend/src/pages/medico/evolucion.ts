import type { Anotacion, Entrenamiento, Evaluacion } from '../../api/types'
import type { SerieTendencia } from '../../components/ui/TrendChartCarousel'
import { notaParaCsv } from '../../anotaciones/notas'
import { claveGraficoEvolucion } from '../../anotaciones/useAnotaciones'
import { formatearFecha } from '../../data/mockData'
import { aCsv } from '../../exportar/archivos'

/**
 * Qué se grafica en la evolución del paciente, en un solo lugar: lo usan la
 * ficha del paciente, su CSV y el informe general en PDF.
 */

/** Una sesión de consultorio: la espirometría y el PIM que se tomaron juntos. */
export interface SesionEvaluacion {
  fecha_hora: string
  espirometria?: Evaluacion
  pim?: Evaluacion
}

/**
 * Dos evaluaciones son la misma sesión de consultorio si comparten el
 * `fecha_hora` exacto (se captura una sola vez al arrancar la sesión).
 * Mantiene el orden de entrada.
 */
export function agruparEnSesiones(evaluaciones: Evaluacion[]): SesionEvaluacion[] {
  const porFecha = new Map<string, SesionEvaluacion>()
  for (const e of evaluaciones) {
    const sesion = porFecha.get(e.fecha_hora) ?? { fecha_hora: e.fecha_hora }
    if (e.tipo === 'ESPIROMETRIA') sesion.espirometria = e
    else sesion.pim = e
    porFecha.set(e.fecha_hora, sesion)
  }
  return [...porFecha.values()]
}

export interface VariableEvolucion<T> {
  /** Identificador estable (parte de la clave de las notas: no cambiarlo). */
  id: string
  nombreCorto: string
  /** Para el título: "Evolución de <etiqueta>". */
  etiqueta: string
  etiquetaEje: string
  unidad: string
  valor: (item: T) => number | null | undefined
}

export const VARIABLES_EVALUACION: VariableEvolucion<Evaluacion>[] = [
  { id: 'pim', nombreCorto: 'PIM', etiqueta: 'PIM', etiquetaEje: 'PIM (cmH₂O)', unidad: 'cmH₂O', valor: (e) => e.pim },
  { id: 'fvc', nombreCorto: 'FVC', etiqueta: 'FVC', etiquetaEje: 'FVC (L)', unidad: 'L', valor: (e) => e.fvc },
  { id: 'fev1', nombreCorto: 'FEV1', etiqueta: 'FEV1', etiquetaEje: 'FEV1 (L)', unidad: 'L', valor: (e) => e.fev1 },
  { id: 'pef', nombreCorto: 'PEF', etiqueta: 'PEF', etiquetaEje: 'PEF (L/min)', unidad: 'L/min', valor: (e) => e.pef },
  { id: 'fivc', nombreCorto: 'FIVC', etiqueta: 'FIVC', etiquetaEje: 'FIVC (L)', unidad: 'L', valor: (e) => e.fivc },
  { id: 'fiv1', nombreCorto: 'FIV1', etiqueta: 'FIV1', etiquetaEje: 'FIV1 (L)', unidad: 'L', valor: (e) => e.fiv1 },
]

export const VARIABLES_ENTRENAMIENTO: VariableEvolucion<Entrenamiento>[] = [
  { id: 'resistencia', nombreCorto: 'Resistencia', etiqueta: 'resistencia programada', etiquetaEje: 'Resistencia', unidad: '', valor: (e) => e.resistencia_programada },
  { id: 'repeticiones', nombreCorto: 'Repeticiones', etiqueta: 'repeticiones programadas', etiquetaEje: 'Repeticiones', unidad: '', valor: (e) => e.repeticiones_programadas },
  { id: 'presion-max', nombreCorto: 'Presión máx.', etiqueta: 'presión máxima', etiquetaEje: 'Presión máx. (cmH₂O)', unidad: 'cmH₂O', valor: (e) => e.presion_max },
  { id: 'presion-prom', nombreCorto: 'Presión prom.', etiqueta: 'presión promedio', etiquetaEje: 'Presión prom. (cmH₂O)', unidad: 'cmH₂O', valor: (e) => e.presion_promedio },
  { id: 'indice-fatiga', nombreCorto: 'Índice de fatiga', etiqueta: 'índice de fatiga', etiquetaEje: 'Índice de fatiga (%)', unidad: '%', valor: (e) => e.indice_fatiga },
  { id: 'potencia', nombreCorto: 'Potencia', etiqueta: 'potencia inspiratoria', etiquetaEje: 'Potencia insp. (W)', unidad: 'W', valor: (e) => e.potencia_insp },
  { id: 'trabajo', nombreCorto: 'Trabajo', etiqueta: 'trabajo', etiquetaEje: 'Trabajo (J)', unidad: 'J', valor: (e) => e.trabajo },
  { id: 'duty-cycle', nombreCorto: 'Duty cycle', etiqueta: 'duty cycle', etiquetaEje: 'Duty cycle (%)', unidad: '%', valor: (e) => e.duty_cycle },
  { id: 'tiempo-entre-reps', nombreCorto: 'Tiempo entre reps', etiqueta: 'tiempo entre repeticiones', etiquetaEje: 'Tiempo entre reps (s)', unidad: 's', valor: (e) => e.tiempo_entre_reps },
  { id: 'volumen-total', nombreCorto: 'Volumen total', etiqueta: 'volumen total', etiquetaEje: 'Volumen total (L)', unidad: 'L', valor: (e) => e.volumen_total },
]

/** Fecha y hora para el CSV y el detalle de un punto, ej. "2026-10-11 10:15". */
function fechaHoraCompleta(fechaHora: string): string {
  return fechaHora.replace('T', ' ').slice(0, 16)
}

const PALETA_SERIES = ['#F0459A', '#2FA7A0', '#7C5CF0', '#E0A030', '#3B82F6', '#D1234F', '#1F9D64', '#B9820C']

/** Arma una serie por variable, salteando los valores vacíos. `datos` en orden cronológico. */
function construirSeries<T extends { fecha_hora: string }>(
  grupo: 'evaluaciones' | 'entrenamientos',
  datos: T[],
  idDe: (item: T) => number,
  variables: VariableEvolucion<T>[],
): SerieTendencia[] {
  return variables.map((variable, i) => {
    const puntos = datos
      .map((item) => ({ item, valor: variable.valor(item) }))
      .filter((p): p is { item: T; valor: number } => p.valor != null)
    return {
      nombreCorto: variable.nombreCorto,
      titulo: `Evolución de ${variable.etiqueta}`,
      etiquetaEje: variable.etiquetaEje,
      unidad: variable.unidad,
      color: PALETA_SERIES[i % PALETA_SERIES.length],
      valores: puntos.map((p) => p.valor),
      fechas: puntos.map((p) => formatearFecha(p.item.fecha_hora)),
      clave: claveGraficoEvolucion(grupo, variable.id),
      clavesPuntos: puntos.map((p) => String(idDe(p.item))),
      fechasCompletas: puntos.map((p) => fechaHoraCompleta(p.item.fecha_hora)),
    }
  })
}

export function seriesDeEvaluaciones(evaluacionesCronologicas: Evaluacion[]): SerieTendencia[] {
  return construirSeries('evaluaciones', evaluacionesCronologicas, (e) => e.id_evaluacion, VARIABLES_EVALUACION)
}

export function seriesDeEntrenamientos(entrenamientosCronologicos: Entrenamiento[]): SerieTendencia[] {
  return construirSeries('entrenamientos', entrenamientosCronologicos, (e) => e.id_entrenamiento, VARIABLES_ENTRENAMIENTO)
}

/**
 * CSV con todos los puntos de los gráficos de evolución de una pestaña: una
 * fila por fecha, una columna por variable y, en "Notas", las notas de esos
 * puntos aclarando de qué variable es cada una. Cada fila puede juntar
 * varios registros de la misma fecha (la espirometría y el PIM de una sesión).
 */
function csvDeEvolucion<T extends { fecha_hora: string }>(
  grupo: 'evaluaciones' | 'entrenamientos',
  filas: T[][],
  variables: VariableEvolucion<T>[],
  idDe: (item: T) => number,
  anotaciones: Anotacion[],
): string {
  const cuerpo = filas.map((items) => {
    const ids = new Set(items.map((item) => String(idDe(item))))
    const notas = variables.flatMap((variable) => {
      const grafico = claveGraficoEvolucion(grupo, variable.id)
      return anotaciones
        .filter((a) => a.grafico === grafico && a.punto != null && ids.has(a.punto))
        .map((a) => notaParaCsv(a, variable.nombreCorto))
    })
    return [
      fechaHoraCompleta(items[0].fecha_hora),
      ...variables.map((variable) => items.map(variable.valor).find((v) => v != null) ?? null),
      notas.join(' | '),
    ]
  })
  return aCsv([['Fecha', ...variables.map((v) => v.etiquetaEje), 'Notas'], ...cuerpo])
}

/** En el CSV, las columnas van en el mismo orden que la tabla de la ficha (PIM al final). */
const VARIABLES_EVALUACION_CSV = ['fvc', 'fev1', 'pef', 'fivc', 'fiv1', 'pim'].map(
  (id) => VARIABLES_EVALUACION.find((v) => v.id === id)!,
)

export function csvDeEvaluaciones(evaluacionesCronologicas: Evaluacion[], anotaciones: Anotacion[]): string {
  const sesiones = agruparEnSesiones(evaluacionesCronologicas).map((s) =>
    [s.espirometria, s.pim].filter((e): e is Evaluacion => e != null),
  )
  return csvDeEvolucion('evaluaciones', sesiones, VARIABLES_EVALUACION_CSV, (e) => e.id_evaluacion, anotaciones)
}

export function csvDeEntrenamientos(entrenamientosCronologicos: Entrenamiento[], anotaciones: Anotacion[]): string {
  return csvDeEvolucion(
    'entrenamientos',
    entrenamientosCronologicos.map((e) => [e]),
    VARIABLES_ENTRENAMIENTO,
    (e) => e.id_entrenamiento,
    anotaciones,
  )
}
