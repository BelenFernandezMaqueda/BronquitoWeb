import type { Entrenamiento, Evaluacion } from '../../api/types'
import type { SerieTendencia } from '../../components/ui/TrendChartCarousel'
import { claveGraficoEvolucion } from '../../anotaciones/useAnotaciones'
import { formatearFecha } from '../../data/mockData'

/**
 * Qué se grafica en la evolución del paciente, en un solo lugar: lo usan la
 * ficha del paciente y el informe general en PDF.
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

const PALETA_SERIES = ['#F0459A', '#2FA7A0', '#7C5CF0', '#E0A030', '#3B82F6', '#D1234F', '#1F9D64', '#B9820C']

/** Arma una serie por variable, salteando los valores vacíos. `datos` en orden cronológico. */
function construirSeries<T extends { fecha_hora: string }>(
  grupo: 'evaluaciones' | 'entrenamientos',
  datos: T[],
  idDe: (item: T) => number,
  variables: VariableEvolucion<T>[],
  nombrePaciente: string,
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
      fechasCompletas: puntos.map((p) => p.item.fecha_hora.replace('T', ' ').slice(0, 16)),
      nombreCsv: `${nombrePaciente} - Evolución ${variable.nombreCorto}`,
    }
  })
}

export function seriesDeEvaluaciones(evaluacionesCronologicas: Evaluacion[], nombrePaciente: string): SerieTendencia[] {
  return construirSeries('evaluaciones', evaluacionesCronologicas, (e) => e.id_evaluacion, VARIABLES_EVALUACION, nombrePaciente)
}

export function seriesDeEntrenamientos(
  entrenamientosCronologicos: Entrenamiento[],
  nombrePaciente: string,
): SerieTendencia[] {
  return construirSeries(
    'entrenamientos',
    entrenamientosCronologicos,
    (e) => e.id_entrenamiento,
    VARIABLES_ENTRENAMIENTO,
    nombrePaciente,
  )
}
