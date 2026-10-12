import { useState } from 'react'
import type { AnotacionesGrafico } from './ChartInteractivo'
import { PimTrendChart } from './PimTrendChart'

export interface SerieTendencia {
  /** Nombre corto para el mensaje de "no hay datos", ej. "PIM". */
  nombreCorto: string
  titulo: string
  etiquetaEje: string
  unidad: string
  color: string
  valores: number[]
  fechas: string[]
  /** Clave del gráfico, para guardar sus notas (ver anotaciones/useAnotaciones.ts). */
  clave?: string
  /** Clave estable de cada punto (ej. el id de la evaluación), mismo orden que `valores`. */
  clavesPuntos?: string[]
  /** Fecha y hora completas de cada punto, para el detalle del punto. */
  fechasCompletas?: string[]
}

interface TrendChartCarouselProps {
  series: SerieTendencia[]
  /** Si está, se pueden marcar puntos con notas. */
  anotacionesDe?: (serie: SerieTendencia) => AnotacionesGrafico | undefined
}

const POR_PAGINA = 2

/** Gráficos de evolución en el tiempo, de a dos, navegables con flechas — sin cortar ningún gráfico a la mitad. */
export function TrendChartCarousel({ series, anotacionesDe }: TrendChartCarouselProps) {
  const [pagina, setPagina] = useState(0)
  const totalPaginas = Math.max(1, Math.ceil(series.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const visibles = series.slice(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA)

  return (
    <div className="chart-carousel">
      <button
        type="button"
        className="chart-carousel-btn"
        onClick={() => setPagina((p) => Math.max(0, p - 1))}
        disabled={paginaActual === 0}
        aria-label="Variables anteriores"
      >
        ‹
      </button>

      <div className="chart-carousel-page">
        <div className={`grid ${visibles.length > 1 ? 'cols-2' : ''}`}>
          {visibles.map((serie) =>
            serie.valores.length > 0 ? (
              <PimTrendChart
                key={serie.nombreCorto}
                valores={serie.valores}
                fechas={serie.fechas}
                fechasCompletas={serie.fechasCompletas}
                claves={serie.clavesPuntos}
                anotaciones={anotacionesDe?.(serie)}
                etiquetaEje={serie.etiquetaEje}
                titulo={serie.titulo}
                unidad={serie.unidad}
                color={serie.color}
              />
            ) : (
              <div className="chart-wrap" key={serie.nombreCorto}>
                <p className="empty-state">No hay ningún valor de {serie.nombreCorto} para graficar.</p>
              </div>
            ),
          )}
        </div>
        {totalPaginas > 1 && (
          <div className="chart-carousel-indicador">
            {paginaActual + 1} / {totalPaginas}
          </div>
        )}
      </div>

      <button
        type="button"
        className="chart-carousel-btn"
        onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
        disabled={paginaActual === totalPaginas - 1}
        aria-label="Variables siguientes"
      >
        ›
      </button>
    </div>
  )
}
