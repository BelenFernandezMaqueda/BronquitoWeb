import type { Anotacion, EvaluacionMuestras, TipoEvaluacion } from '../../api/types'
import { notaParaCsv } from '../../anotaciones/notas'
import { aCsv } from '../../exportar/archivos'

/**
 * Qué gráficos de señal cruda se muestran para cada tipo de evaluación. Lo
 * usan el visor de señales y el PDF de la sesión: un gráfico nuevo se agrega
 * acá y aparece en los dos, con notas y CSV incluidos.
 */
export interface GraficoSenal {
  /** Identificador estable (parte de la clave de las notas: no cambiarlo). */
  id: string
  x: keyof EvaluacionMuestras
  y: keyof EvaluacionMuestras
  etiquetaX: string
  etiquetaY: string
  titulo: string
  color: string
}

export const GRAFICOS_POR_TIPO: Record<TipoEvaluacion, GraficoSenal[]> = {
  ESPIROMETRIA: [
    { id: 'flujo-tiempo', x: 'tiempo', y: 'flujo', etiquetaX: 'Tiempo (s)', etiquetaY: 'Flujo (L/s)', titulo: 'Flujo en función del tiempo', color: '#2FA7A0' },
    { id: 'volumen-tiempo', x: 'tiempo', y: 'volumen', etiquetaX: 'Tiempo (s)', etiquetaY: 'Volumen (L)', titulo: 'Volumen en función del tiempo', color: '#F0459A' },
    { id: 'flujo-volumen', x: 'volumen', y: 'flujo', etiquetaX: 'Volumen (L)', etiquetaY: 'Flujo (L/s)', titulo: 'Curva flujo-volumen', color: '#7C5CF0' },
    { id: 'presion-tiempo', x: 'tiempo', y: 'presion', etiquetaX: 'Tiempo (s)', etiquetaY: 'Presión (cmH₂O)', titulo: 'Presión en función del tiempo', color: '#E0A030' },
  ],
  PIM_PEM: [
    { id: 'presion-tiempo', x: 'tiempo', y: 'presion', etiquetaX: 'Tiempo (s)', etiquetaY: 'Presión (cmH₂O)', titulo: 'Presión en función del tiempo', color: '#E0A030' },
    { id: 'flujo-tiempo', x: 'tiempo', y: 'flujo', etiquetaX: 'Tiempo (s)', etiquetaY: 'Flujo (L/s)', titulo: 'Flujo en función del tiempo', color: '#2FA7A0' },
  ],
}

export const NOMBRE_TIPO: Record<TipoEvaluacion, string> = {
  ESPIROMETRIA: 'Espirometría',
  PIM_PEM: 'PIM',
}

/** Fecha de la sesión para los nombres de archivo, ej. "2026-10-11". */
export function fechaParaArchivo(fechaHora: string): string {
  return fechaHora.slice(0, 10)
}

/**
 * Los puntos de todos los gráficos de una evaluación en un solo CSV: dos
 * columnas (X e Y) por gráfico, en el mismo orden que en pantalla y con el
 * título del gráfico arriba de cada par, para poder llevar cada uno a Excel
 * o Sheets y volver a graficarlo. Como todos salen de las mismas muestras,
 * cada fila es una muestra y, en "Notas" (al final, para no cortar los
 * pares), van las notas de esa muestra aclarando de qué gráfico es cada una.
 */
export function csvDeSenales(
  graficos: GraficoSenal[],
  muestras: EvaluacionMuestras,
  notasDe: (grafico: GraficoSenal) => Anotacion[],
): string {
  const notasPorMuestra = new Map<number, string[]>()
  for (const g of graficos) {
    for (const nota of notasDe(g)) {
      const indice = Number(nota.punto)
      notasPorMuestra.set(indice, [...(notasPorMuestra.get(indice) ?? []), notaParaCsv(nota, g.titulo)])
    }
  }

  const cantidad = Math.max(0, ...graficos.flatMap((g) => [muestras[g.x].length, muestras[g.y].length]))
  const filas = Array.from({ length: cantidad }, (_, i) => [
    ...graficos.flatMap((g) => [muestras[g.x][i], muestras[g.y][i]]),
    (notasPorMuestra.get(i) ?? []).join(' | '),
  ])
  return aCsv([
    [...graficos.flatMap((g) => [g.titulo, '']), ''],
    [...graficos.flatMap((g) => [g.etiquetaX, g.etiquetaY]), 'Notas'],
    ...filas,
  ])
}
