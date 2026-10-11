import { describirPuntoEvolucion } from '../../anotaciones/notas'
import type { AnotacionesGrafico } from './ChartInteractivo'
import { ChartInteractivo } from './ChartInteractivo'

interface PimTrendChartProps {
  /** Valores ordenados cronológicamente (más antiguo primero). */
  valores: number[]
  /** Una fecha corta por valor, mismo orden y largo que `valores`. */
  fechas: string[]
  /** Fecha completa de cada valor (para el CSV y el detalle del punto). Si falta, se usa `fechas`. */
  fechasCompletas?: string[]
  /** Clave estable de cada punto (ej. el id de la evaluación), para anotarlo. */
  claves?: string[]
  /** Título arriba del gráfico, ej. "Evolución de PIM". */
  titulo: string
  /** Unidad para el texto de rango de abajo, ej. "cmH₂O" o "L". */
  unidad: string
  /** Texto del eje Y, ej. "PIM (cmH₂O)" o "FVC (L)". */
  etiquetaEje?: string
  color?: string
  anotaciones?: AnotacionesGrafico
  /** Nombre (sin extensión) del CSV con los valores. Sin esto no aparece el botón de exportar. */
  nombreCsv?: string
}

/** Evolución de una métrica a lo largo de las evaluaciones, con ejes X/Y. */
export function PimTrendChart({
  valores,
  fechas,
  fechasCompletas,
  claves,
  titulo,
  unidad,
  etiquetaEje = 'PIM (cmH₂O)',
  color = '#F0459A',
  anotaciones,
  nombreCsv,
}: PimTrendChartProps) {
  const w = 340
  const h = 220
  const padLeft = 46
  const padRight = 16
  const padTop = 18
  const padBottom = 30

  const plotW = w - padLeft - padRight
  const plotH = h - padTop - padBottom

  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1

  const puntos = valores.map((v, i) => ({
    x: padLeft + (i / Math.max(valores.length - 1, 1)) * plotW,
    y: padTop + plotH - ((v - min) / rango) * plotH,
  }))

  const puntosStr = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  // Hasta 3 marcas en Y (mínimo, medio, máximo) para no saturar de números.
  const marcasY = min === max ? [min] : [min, (min + max) / 2, max]

  // Hasta 3 marcas en X (primera, del medio, última) para que las fechas no se pisen.
  const indicesMarcasX =
    valores.length <= 3
      ? valores.map((_, i) => i)
      : [0, Math.round((valores.length - 1) / 2), valores.length - 1]

  const fechaCompleta = (i: number) => fechasCompletas?.[i] ?? fechas[i]

  return (
    <ChartInteractivo
      ancho={w}
      alto={h}
      ariaLabel={titulo}
      encabezado={
        <>
          <div className="signal-chart-title" style={{ color }}>
            {titulo}
          </div>
          <div className="trend-chart-range">
            {valores[0]} → {valores[valores.length - 1]} {unidad}
          </div>
        </>
      }
      area={{ x: padLeft, y: padTop, ancho: plotW, alto: plotH }}
      posiciones={puntos}
      claves={claves}
      describirPunto={(i) => describirPuntoEvolucion(etiquetaEje, valores[i], fechaCompleta(i))}
      color={color}
      anotaciones={anotaciones}
      csv={
        nombreCsv
          ? { nombreArchivo: nombreCsv, encabezados: ['Fecha', etiquetaEje], fila: (i) => [fechaCompleta(i), valores[i]] }
          : undefined
      }
    >
      <text x={padLeft} y={12} fontSize="9.5" fill="#5C7C82" fontFamily="Nunito, sans-serif">
        {etiquetaEje}
      </text>

      {/* eje Y */}
      <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} stroke="#B7CDD2" strokeWidth={1.5} />
      {/* eje X */}
      <line
        x1={padLeft}
        y1={padTop + plotH}
        x2={padLeft + plotW}
        y2={padTop + plotH}
        stroke="#B7CDD2"
        strokeWidth={1.5}
      />

      {marcasY.map((v) => {
        const y = padTop + plotH - ((v - min) / rango) * plotH
        return (
          <g key={v}>
            <line x1={padLeft - 4} y1={y} x2={padLeft} y2={y} stroke="#B7CDD2" strokeWidth={1.5} />
            <text x={padLeft - 8} y={y + 3} fontSize="9" fill="#5C7C82" fontFamily="Nunito, sans-serif" textAnchor="end">
              {v.toFixed(1)}
            </text>
          </g>
        )
      })}

      {indicesMarcasX.map((i) => (
        <text
          key={i}
          x={puntos[i].x}
          y={padTop + plotH + 16}
          fontSize="9"
          fill="#5C7C82"
          fontFamily="Nunito, sans-serif"
          textAnchor="middle"
        >
          {fechas[i]}
        </text>
      ))}

      <polyline points={puntosStr} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} />
      ))}
    </ChartInteractivo>
  )
}
