import { describirPuntoXY } from '../../anotaciones/notas'
import type { AnotacionesGrafico } from './ChartInteractivo'
import { ChartInteractivo } from './ChartInteractivo'

interface SignalXYChartProps {
  /** Valores del eje X, mismo orden y largo que `y`. */
  x: number[]
  /** Valores del eje Y. */
  y: number[]
  etiquetaX: string
  etiquetaY: string
  caption?: string
  color?: string
  /** Si está, se pueden marcar muestras con notas (la clave de cada punto es su índice). */
  anotaciones?: AnotacionesGrafico
}

/** Gráfico XY genérico para una señal cruda (flujo/volumen/presión vs. tiempo, o flujo-volumen). */
export function SignalXYChart({
  x,
  y,
  etiquetaX,
  etiquetaY,
  caption,
  color = '#2FA7A0',
  anotaciones,
}: SignalXYChartProps) {
  const w = 360
  const h = 240
  const padLeft = 50
  const padRight = 16
  const padTop = 18
  const padBottom = 34

  const plotW = w - padLeft - padRight
  const plotH = h - padTop - padBottom

  const xMin = Math.min(...x)
  const xMax = Math.max(...x)
  const yMin = Math.min(...y)
  const yMax = Math.max(...y)
  const xRango = xMax - xMin || 1
  const yRango = yMax - yMin || 1

  const puntos = x.map((xv, i) => ({
    x: padLeft + ((xv - xMin) / xRango) * plotW,
    y: padTop + plotH - ((y[i] - yMin) / yRango) * plotH,
  }))
  const puntosStr = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const marcasY = yMin === yMax ? [yMin] : [yMin, (yMin + yMax) / 2, yMax]
  const marcasX = xMin === xMax ? [xMin] : [xMin, (xMin + xMax) / 2, xMax]

  return (
    <ChartInteractivo
      ancho={w}
      alto={h}
      ariaLabel={caption ?? `${etiquetaY} vs ${etiquetaX}`}
      encabezado={
        caption && (
          <div className="signal-chart-title" style={{ color }}>
            {caption}
          </div>
        )
      }
      area={{ x: padLeft, y: padTop, ancho: plotW, alto: plotH }}
      posiciones={puntos}
      describirPunto={(i) => describirPuntoXY(etiquetaX, etiquetaY, x[i], y[i])}
      color={color}
      anotaciones={anotaciones}
    >
      <text x={padLeft} y={12} fontSize="9.5" fill="#5C7C82" fontFamily="Nunito, sans-serif">
        {etiquetaY}
      </text>
      <text x={padLeft + plotW} y={h - 4} fontSize="9.5" fill="#5C7C82" fontFamily="Nunito, sans-serif" textAnchor="end">
        {etiquetaX}
      </text>

      {/* líneas de guía */}
      {marcasY.map((v) => {
        const yy = padTop + plotH - ((v - yMin) / yRango) * plotH
        return <line key={`gy-${v}`} x1={padLeft} y1={yy} x2={padLeft + plotW} y2={yy} stroke="#E7EDEF" strokeWidth={1} />
      })}
      {marcasX.map((v) => {
        const xx = padLeft + ((v - xMin) / xRango) * plotW
        return <line key={`gx-${v}`} x1={xx} y1={padTop} x2={xx} y2={padTop + plotH} stroke="#E7EDEF" strokeWidth={1} />
      })}

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
        const yy = padTop + plotH - ((v - yMin) / yRango) * plotH
        return (
          <g key={`y-${v}`}>
            <line x1={padLeft - 4} y1={yy} x2={padLeft} y2={yy} stroke="#B7CDD2" strokeWidth={1.5} />
            <text x={padLeft - 8} y={yy + 3} fontSize="9" fill="#5C7C82" fontFamily="Nunito, sans-serif" textAnchor="end">
              {v.toFixed(1)}
            </text>
          </g>
        )
      })}

      {marcasX.map((v) => {
        const xx = padLeft + ((v - xMin) / xRango) * plotW
        return (
          <g key={`x-${v}`}>
            <line x1={xx} y1={padTop + plotH} x2={xx} y2={padTop + plotH + 4} stroke="#B7CDD2" strokeWidth={1.5} />
            <text x={xx} y={padTop + plotH + 16} fontSize="9" fill="#5C7C82" fontFamily="Nunito, sans-serif" textAnchor="middle">
              {v.toFixed(1)}
            </text>
          </g>
        )
      })}

      <polyline points={puntosStr} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </ChartInteractivo>
  )
}
