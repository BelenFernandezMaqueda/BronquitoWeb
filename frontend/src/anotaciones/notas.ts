import type { Anotacion } from '../api/types'

/** Cómo se describe un punto de un gráfico: el valor primero y el contexto (tiempo, fecha…) después. */
export interface DescripcionPunto {
  principal: string
  secundario: string
}

/** Un punto anotado de un gráfico: sus notas y el número con el que se lo marca. */
export interface Marcador {
  punto: string
  /** Posición del punto dentro de la serie del gráfico. */
  indice: number
  /** 1, 2, 3… de izquierda a derecha en la serie — el mismo en pantalla y en el PDF. */
  numero: number
  notas: Anotacion[]
}

/**
 * Agrupa las notas de un gráfico por punto y las numera en el orden de la
 * serie. Las notas de puntos que ya no están en la serie se descartan.
 */
export function marcadoresDe(claves: string[], notas: Anotacion[]): Marcador[] {
  const indicePorClave = new Map(claves.map((clave, i) => [clave, i]))
  const notasPorPunto = new Map<string, Anotacion[]>()
  for (const nota of notas) {
    if (nota.punto == null || !indicePorClave.has(nota.punto)) continue
    notasPorPunto.set(nota.punto, [...(notasPorPunto.get(nota.punto) ?? []), nota])
  }
  return [...notasPorPunto.entries()]
    .map(([punto, notasDelPunto]) => ({ punto, indice: indicePorClave.get(punto)!, notas: notasDelPunto }))
    .sort((a, b) => a.indice - b.indice)
    .map((marcador, i) => ({ ...marcador, numero: i + 1 }))
}

/** Hasta 3 decimales, sin ceros de más (1.2300 → "1.23"). */
export function formatearValor(valor: number): string {
  return String(Number(valor.toFixed(3)))
}

/** Fecha y hora en 24 h, ej. "11 de oct de 2026, 10:15" (o "11/10/2026, 10:15" con `corta`). */
export function formatearFechaHora(fecha: string | Date, { corta = false } = {}): string {
  return new Date(fecha).toLocaleString('es-AR', {
    day: '2-digit',
    month: corta ? '2-digit' : 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

/** Punto de una señal cruda (ej. flujo vs. tiempo). */
export function describirPuntoXY(etiquetaX: string, etiquetaY: string, x: number, y: number): DescripcionPunto {
  return { principal: `${etiquetaY}: ${formatearValor(y)}`, secundario: `${etiquetaX}: ${formatearValor(x)}` }
}

/** Punto de un gráfico de evolución en el tiempo (una sesión). */
export function describirPuntoEvolucion(etiquetaEje: string, valor: number, fecha: string): DescripcionPunto {
  return { principal: `${etiquetaEje}: ${formatearValor(valor)}`, secundario: fecha }
}

/** Cuándo se escribió una nota, en hora local. */
export function formatearMomentoNota(nota: Anotacion): string {
  const momento = formatearFechaHora(nota.creado_en)
  return nota.editado_en ? `${momento} (editada)` : momento
}

/** Una nota dentro de la columna "Notas" de un CSV, con el gráfico al que pertenece. */
export function notaParaCsv(nota: Anotacion, grafico: string): string {
  return `${grafico}: ${nota.texto} (${nota.autor})`
}
