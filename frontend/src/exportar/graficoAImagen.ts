import type { ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

export interface ImagenGrafico {
  /** PNG en data URL. */
  dataUrl: string
  /** Proporciones del gráfico (las del viewBox). */
  ancho: number
  alto: number
}

/** Renderiza el gráfico fuera de la vista y devuelve su SVG serializado. */
function serializarSvg(grafico: ReactElement): { texto: string; ancho: number; alto: number } {
  const contenedor = document.createElement('div')
  contenedor.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;pointer-events:none;'
  document.body.appendChild(contenedor)
  const root = createRoot(contenedor)
  try {
    flushSync(() => root.render(grafico))
    const svg = contenedor.querySelector<SVGSVGElement>('svg[data-grafico]')
    if (!svg) throw new Error('El gráfico no generó un SVG.')
    const { width: ancho, height: alto } = svg.viewBox.baseVal
    const copia = svg.cloneNode(true) as SVGSVGElement
    copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    copia.setAttribute('width', String(ancho))
    copia.setAttribute('height', String(alto))
    copia.removeAttribute('style')
    return { texto: new XMLSerializer().serializeToString(copia), ancho, alto }
  } finally {
    root.unmount()
    contenedor.remove()
  }
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => rechazar(new Error('No se pudo dibujar un gráfico para el PDF.'))
    imagen.src = src
  })
}

/**
 * Pasa a PNG un gráfico de la app — el mismo componente que se ve en
 * pantalla, con sus marcadores de notas — para meterlo en un PDF. Sólo se
 * captura el SVG: títulos y botones (que son HTML) quedan afuera.
 */
export async function graficoAImagen(grafico: ReactElement, escala = 3): Promise<ImagenGrafico> {
  const { texto, ancho, alto } = serializarSvg(grafico)
  const imagen = await cargarImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(ancho * escala)
  canvas.height = Math.round(alto * escala)
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('El navegador no pudo dibujar los gráficos del PDF.')
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, canvas.width, canvas.height)
  contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height)

  return { dataUrl: canvas.toDataURL('image/png'), ancho, alto }
}
