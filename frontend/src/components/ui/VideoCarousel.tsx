import { useState } from 'react'

export interface VideoTutorial {
  id: string
  titulo: string
}

interface VideoCarouselProps {
  videos: VideoTutorial[]
  onSeleccionar: (video: VideoTutorial) => void
}

const POR_PAGINA = 3

/** Miniaturas de tutoriales en video, de a tres, navegables con flechas — mismo patrón que TrendChartCarousel. */
export function VideoCarousel({ videos, onSeleccionar }: VideoCarouselProps) {
  const [pagina, setPagina] = useState(0)
  const totalPaginas = Math.max(1, Math.ceil(videos.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const visibles = videos.slice(paginaActual * POR_PAGINA, paginaActual * POR_PAGINA + POR_PAGINA)

  return (
    <div className="chart-carousel">
      <button
        type="button"
        className="chart-carousel-btn"
        onClick={() => setPagina((p) => Math.max(0, p - 1))}
        disabled={paginaActual === 0}
        aria-label="Tutoriales anteriores"
      >
        ‹
      </button>

      <div className="chart-carousel-page">
        <div className="grid cols-3">
          {visibles.map((video) => (
            <button
              key={video.id}
              type="button"
              className="video-thumb"
              onClick={() => onSeleccionar(video)}
              aria-label={`Ver video: ${video.titulo}`}
            >
              <img src={`https://img.youtube.com/vi/${video.id}/hqdefault.jpg`} alt={video.titulo} />
              <span className="video-thumb-play" aria-hidden="true">
                <span>▶</span>
              </span>
            </button>
          ))}
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
        aria-label="Tutoriales siguientes"
      >
        ›
      </button>
    </div>
  )
}
