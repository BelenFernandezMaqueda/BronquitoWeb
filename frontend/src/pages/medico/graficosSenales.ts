import type { EvaluacionMuestras, TipoEvaluacion } from '../../api/types'

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
