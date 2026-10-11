import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Anotacion } from '../../api/types'
import type { DescripcionPunto } from '../../anotaciones/notas'
import { marcadoresDe, textoNotasCsv } from '../../anotaciones/notas'
import { TIPO_CSV, aCsv, elegirDestino } from '../../exportar/archivos'
import { NotaComposer, NotaItem } from './Notas'

/** Lo que necesita un gráfico para mostrar notas en sus puntos y dejar agregar nuevas. */
export interface AnotacionesGrafico {
  /** Las notas de ESTE gráfico. */
  notas: Anotacion[]
  /** Médico logueado: sólo puede editar o borrar sus propias notas. */
  idMedicoActual: number | null
  onCrear: (punto: string, texto: string) => Promise<void>
  onEditar: (idAnotacion: number, texto: string) => Promise<void>
  onBorrar: (idAnotacion: number) => Promise<void>
  /** Pasá un objeto nuevo para abrir la burbuja de ese punto (ej. desde un panel de notas). */
  enfocar?: { punto: string } | null
}

/** Exportar los puntos del gráfico a CSV: una fila por punto, más una columna con sus notas. */
export interface CsvGrafico {
  nombreArchivo: string
  encabezados: string[]
  fila: (indice: number) => (string | number | null)[]
}

interface ChartInteractivoProps {
  /** Tamaño del viewBox del SVG. */
  ancho: number
  alto: number
  ariaLabel: string
  /** Título (y lo que vaya arriba del gráfico). */
  encabezado?: ReactNode
  /** Zona de ploteo dentro del viewBox: el puntero sólo "agarra" puntos ahí adentro. */
  area: { x: number; y: number; ancho: number; alto: number }
  /** Posición de cada punto en coordenadas del viewBox. */
  posiciones: { x: number; y: number }[]
  /** Clave estable de cada punto, para anotarlo (por defecto, su índice). */
  claves?: string[]
  describirPunto: (indice: number) => DescripcionPunto
  color: string
  /** Si está, se pueden marcar puntos con notas. */
  anotaciones?: AnotacionesGrafico
  /** Si está, aparece el botón para exportar a CSV. */
  csv?: CsvGrafico
  /** Ejes, líneas, etc.: contenido SVG en coordenadas del viewBox. */
  children: ReactNode
}

/** Distancia (en px de pantalla) a la que el puntero agarra un punto, en gráficos que no son series de tiempo. */
const RADIO_CERCANIA_PX = 18
const RADIO_MARCADOR = 7
const ANCHO_BURBUJA = 300

/**
 * Marco común de los gráficos: pasando el mouse muestra el valor del punto
 * más cercano; con `anotaciones`, un click en un punto abre una burbuja para
 * dejarle una nota, y los puntos con notas quedan marcados con un número.
 * Con `csv`, agrega el botón para exportar los puntos.
 *
 * Para que un gráfico nuevo tenga todo esto, alcanza con dibujarlo adentro
 * de este componente y pasarle la posición de sus puntos.
 */
export function ChartInteractivo({
  ancho,
  alto,
  ariaLabel,
  encabezado,
  area,
  posiciones,
  claves,
  describirPunto,
  color,
  anotaciones,
  csv,
  children,
}: ChartInteractivoProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const burbujaRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [, setReubicaciones] = useState(0)
  const [exportando, setExportando] = useState(false)
  const [errorCsv, setErrorCsv] = useState<string | null>(null)

  const clavesPuntos = useMemo(() => claves ?? posiciones.map((_, i) => String(i)), [claves, posiciones])
  const indicePorClave = useMemo(() => new Map(clavesPuntos.map((clave, i) => [clave, i])), [clavesPuntos])
  // En las series de tiempo el puntero busca el punto más cercano en X (como un
  // cursor vertical); en las demás (ej. flujo-volumen), el más cercano en el plano.
  const xCreciente = useMemo(() => posiciones.every((p, i) => i === 0 || p.x >= posiciones[i - 1].x), [posiciones])
  const marcadores = useMemo(
    () => (anotaciones ? marcadoresDe(clavesPuntos, anotaciones.notas) : []),
    [anotaciones, clavesPuntos],
  )

  const enfocar = anotaciones?.enfocar
  useEffect(() => {
    if (!enfocar) return
    setAbierto(enfocar.punto)
    svgRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [enfocar])

  // Con la burbuja abierta: se cierra con Escape o con un click afuera, y se
  // reubica si la página scrollea o cambia de tamaño.
  useEffect(() => {
    if (abierto == null) return
    function alPresionar(e: PointerEvent) {
      const objetivo = e.target as Node
      if (burbujaRef.current?.contains(objetivo) || svgRef.current?.contains(objetivo)) return
      setAbierto(null)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(null)
    }
    function reubicar() {
      setReubicaciones((n) => n + 1)
    }
    document.addEventListener('pointerdown', alPresionar)
    document.addEventListener('keydown', alTeclear)
    window.addEventListener('scroll', reubicar, true)
    window.addEventListener('resize', reubicar)
    return () => {
      document.removeEventListener('pointerdown', alPresionar)
      document.removeEventListener('keydown', alTeclear)
      window.removeEventListener('scroll', reubicar, true)
      window.removeEventListener('resize', reubicar)
    }
  }, [abierto])

  /** Pasa un punto de la pantalla a coordenadas del viewBox (el SVG puede estar escalado y centrado). */
  function aViewBox(clientX: number, clientY: number) {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y, escala: ctm.a || 1 }
  }

  function enPantalla(indice: number) {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm || !posiciones[indice]) return null
    const p = new DOMPoint(posiciones[indice].x, posiciones[indice].y).matrixTransform(ctm)
    return { left: p.x, top: p.y }
  }

  function puntoMasCercano(x: number, y: number, escala: number): number | null {
    if (posiciones.length === 0) return null
    const margen = 8 / escala
    const afuera =
      x < area.x - margen || x > area.x + area.ancho + margen || y < area.y - margen || y > area.y + area.alto + margen
    if (afuera) return null

    if (xCreciente) {
      let izquierda = 0
      let derecha = posiciones.length - 1
      while (izquierda < derecha) {
        const medio = (izquierda + derecha) >> 1
        if (posiciones[medio].x < x) izquierda = medio + 1
        else derecha = medio
      }
      const anterior = izquierda - 1
      if (anterior >= 0 && Math.abs(posiciones[anterior].x - x) <= Math.abs(posiciones[izquierda].x - x)) return anterior
      return izquierda
    }

    let mejor = 0
    let mejorDistancia = Infinity
    posiciones.forEach((p, i) => {
      const distancia = (p.x - x) ** 2 + (p.y - y) ** 2
      if (distancia < mejorDistancia) {
        mejorDistancia = distancia
        mejor = i
      }
    })
    return Math.sqrt(mejorDistancia) * escala <= RADIO_CERCANIA_PX ? mejor : null
  }

  /** Los marcadores tapan a las muestras de al lado: si el puntero está sobre uno, gana el marcador. */
  function marcadorEn(x: number, y: number, escala: number) {
    const radio = RADIO_MARCADOR + 4 / escala
    return marcadores.find((m) => {
      const p = posiciones[m.indice]
      return (p.x - x) ** 2 + (p.y - y) ** 2 <= radio ** 2
    })
  }

  function alMover(e: ReactPointerEvent<SVGSVGElement>) {
    const c = aViewBox(e.clientX, e.clientY)
    if (!c) return
    setHover(marcadorEn(c.x, c.y, c.escala)?.indice ?? puntoMasCercano(c.x, c.y, c.escala))
  }

  function alClickear(e: ReactMouseEvent<SVGSVGElement>) {
    if (!anotaciones) return
    const c = aViewBox(e.clientX, e.clientY)
    if (!c) return
    const marcador = marcadorEn(c.x, c.y, c.escala)
    if (marcador) {
      setAbierto(marcador.punto)
      return
    }
    const indice = puntoMasCercano(c.x, c.y, c.escala)
    setAbierto(indice == null ? null : clavesPuntos[indice])
  }

  async function exportarCsv() {
    if (!csv) return
    setErrorCsv(null)
    const destino = await elegirDestino(`${csv.nombreArchivo}.csv`, TIPO_CSV)
    if (!destino) return
    setExportando(true)
    try {
      const notasPorPunto = new Map(marcadores.map((m) => [m.punto, m.notas]))
      const filas = [
        [...csv.encabezados, 'Notas'],
        ...posiciones.map((_, i) => [...csv.fila(i), textoNotasCsv(notasPorPunto.get(clavesPuntos[i]))]),
      ]
      await destino.guardar(new Blob([aCsv(filas)], { type: 'text/csv;charset=utf-8' }))
    } catch {
      setErrorCsv('No se pudo guardar el CSV.')
    } finally {
      setExportando(false)
    }
  }

  const indiceAbierto = abierto != null ? indicePorClave.get(abierto) ?? null : null
  const marcadorAbierto = marcadores.find((m) => m.punto === abierto)
  const posicionBurbuja = anotaciones && indiceAbierto != null ? enPantalla(indiceAbierto) : null
  const posicionTooltip = hover != null && abierto == null ? enPantalla(hover) : null
  const notasEnHover = marcadores.find((m) => m.indice === hover)?.notas.length ?? 0

  return (
    <div className="chart-wrap">
      <div className={`chart-header ${csv ? 'con-acciones' : ''}`}>
        <div className="chart-header-titulo">{encabezado}</div>
        {csv && (
          <button
            type="button"
            className="chart-csv-btn"
            onClick={exportarCsv}
            disabled={exportando}
            title="Exportar los puntos de este gráfico a CSV"
          >
            CSV
          </button>
        )}
      </div>
      {errorCsv && <p className="nota-error">{errorCsv}</p>}

      <svg
        ref={svgRef}
        data-grafico=""
        viewBox={`0 0 ${ancho} ${alto}`}
        width="100%"
        role={anotaciones ? 'group' : 'img'}
        aria-label={ariaLabel}
        style={{ cursor: anotaciones && hover != null ? 'pointer' : undefined }}
        onPointerMove={alMover}
        onPointerLeave={() => setHover(null)}
        onClick={alClickear}
      >
        {children}

        {hover != null && posiciones[hover] && (
          <g pointerEvents="none">
            {xCreciente && (
              <line
                x1={posiciones[hover].x}
                y1={area.y}
                x2={posiciones[hover].x}
                y2={area.y + area.alto}
                stroke="#8FB3BA"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            <circle cx={posiciones[hover].x} cy={posiciones[hover].y} r={4.5} fill="#fff" stroke={color} strokeWidth={2} />
          </g>
        )}

        {/* Punto elegido que todavía no tiene notas: se ve dónde va a quedar la nota. */}
        {indiceAbierto != null && !marcadorAbierto && (
          <circle
            cx={posiciones[indiceAbierto].x}
            cy={posiciones[indiceAbierto].y}
            r={RADIO_MARCADOR}
            fill="#FFCB3E"
            fillOpacity={0.5}
            stroke="#0C3A44"
            strokeWidth={1.5}
            strokeDasharray="2 2"
            pointerEvents="none"
          />
        )}

        {marcadores.map((m) => {
          const p = posiciones[m.indice]
          const activo = m.punto === abierto
          return (
            <g
              key={m.punto}
              transform={`translate(${p.x} ${p.y})`}
              role="button"
              tabIndex={0}
              aria-label={`Nota ${m.numero}: ${m.notas.map((n) => n.texto).join(' / ')}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setAbierto(m.punto)
                }
              }}
            >
              <circle
                r={activo ? RADIO_MARCADOR + 1.5 : RADIO_MARCADOR}
                fill="#FFCB3E"
                stroke={activo ? '#C22C78' : '#0C3A44'}
                strokeWidth={activo ? 2 : 1.5}
              />
              <text
                y={3}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="800"
                fill="#0C3A44"
                fontFamily="Nunito, sans-serif"
                pointerEvents="none"
              >
                {m.numero}
              </text>
            </g>
          )
        })}
      </svg>

      {posicionTooltip &&
        hover != null &&
        createPortal(
          <div
            className={`chart-tooltip ${posicionTooltip.top < 90 ? 'abajo' : ''}`}
            style={{ left: posicionTooltip.left, top: posicionTooltip.top }}
          >
            <strong>{describirPunto(hover).principal}</strong>
            <span>{describirPunto(hover).secundario}</span>
            {anotaciones && (
              <span className="chart-tooltip-ayuda">
                {notasEnHover === 0
                  ? 'Click para agregar una nota'
                  : `${notasEnHover} ${notasEnHover === 1 ? 'nota' : 'notas'} · click para ver`}
              </span>
            )}
          </div>,
          document.body,
        )}

      {posicionBurbuja &&
        anotaciones &&
        abierto != null &&
        indiceAbierto != null &&
        createPortal(
          <div
            ref={burbujaRef}
            className={`nota-burbuja ${posicionBurbuja.top < 320 ? 'abajo' : 'arriba'}`}
            style={{
              left: Math.min(
                Math.max(posicionBurbuja.left, ANCHO_BURBUJA / 2 + 8),
                window.innerWidth - ANCHO_BURBUJA / 2 - 8,
              ),
              top: posicionBurbuja.top,
            }}
            role="dialog"
            aria-label="Notas de este punto"
          >
            <div className="nota-burbuja-encabezado">
              <div>
                <strong>{describirPunto(indiceAbierto).principal}</strong>
                <span>{describirPunto(indiceAbierto).secundario}</span>
              </div>
              <button type="button" className="nota-burbuja-cerrar" onClick={() => setAbierto(null)} aria-label="Cerrar">
                ×
              </button>
            </div>

            {marcadorAbierto?.notas.map((nota) => (
              <NotaItem
                key={nota.id_anotacion}
                nota={nota}
                puedeModificar={nota.id_medico === anotaciones.idMedicoActual}
                onEditar={(texto) => anotaciones.onEditar(nota.id_anotacion, texto)}
                onBorrar={() => anotaciones.onBorrar(nota.id_anotacion)}
              />
            ))}

            <NotaComposer
              key={abierto}
              placeholder={marcadorAbierto ? 'Agregar otra nota…' : 'Escribí una nota sobre este punto…'}
              etiquetaGuardar="Guardar nota"
              autoFocus={!marcadorAbierto}
              onGuardar={(texto) => anotaciones.onCrear(abierto, texto)}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
