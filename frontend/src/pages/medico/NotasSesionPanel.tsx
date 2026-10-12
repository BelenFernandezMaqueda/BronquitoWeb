import type { CSSProperties } from 'react'
import type { Anotacion } from '../../api/types'
import { NotaComposer, NotaItem } from '../../components/ui/Notas'

/** Un punto anotado de un gráfico del visor, con sus notas. */
export interface PuntoAnotado {
  grafico: string
  punto: string
  numero: number
  tituloGrafico: string
  color: string
  descripcion: string
  notas: Anotacion[]
}

interface NotasSesionPanelProps {
  comentarios: Anotacion[]
  puntosAnotados: PuntoAnotado[]
  idMedicoActual: number | null
  error: string | null
  onComentar: (texto: string) => Promise<void>
  onEditar: (idAnotacion: number, texto: string) => Promise<void>
  onBorrar: (idAnotacion: number) => Promise<void>
  /** Abre la burbuja de ese punto en su gráfico. */
  onIrAPunto: (grafico: string, punto: string) => void
  style?: CSSProperties
}

/**
 * Columna al costado de los gráficos, como los comentarios de Google Docs:
 * arriba los comentarios generales de la sesión y abajo las notas que hay
 * en los puntos de los gráficos que se están viendo.
 */
export function NotasSesionPanel({
  comentarios,
  puntosAnotados,
  idMedicoActual,
  error,
  onComentar,
  onEditar,
  onBorrar,
  onIrAPunto,
  style,
}: NotasSesionPanelProps) {
  function itemDeNota(nota: Anotacion) {
    return (
      <NotaItem
        key={nota.id_anotacion}
        nota={nota}
        puedeModificar={nota.id_medico === idMedicoActual}
        onEditar={(texto) => onEditar(nota.id_anotacion, texto)}
        onBorrar={() => onBorrar(nota.id_anotacion)}
      />
    )
  }

  return (
    <aside className="notas-panel" style={style} aria-label="Notas de la sesión">
      {error && <p className="nota-error">{error}</p>}

      <section className="notas-panel-seccion">
        <h4>Comentarios de la sesión</h4>
        <p className="notas-panel-ayuda">Valen para toda la sesión (espirometría y PIM), no para un punto en particular.</p>
        {comentarios.map(itemDeNota)}
        <NotaComposer placeholder="Agregá un comentario sobre la sesión…" etiquetaGuardar="Comentar" onGuardar={onComentar} />
      </section>

      <section className="notas-panel-seccion">
        <h4>Notas en los gráficos</h4>
        {puntosAnotados.length === 0 ? (
          <p className="notas-panel-ayuda">Hacé click en un punto de cualquier gráfico para dejarle una nota.</p>
        ) : (
          puntosAnotados.map((p) => (
            <div key={`${p.grafico}#${p.punto}`} className="notas-panel-punto">
              <button
                type="button"
                className="nota-contexto"
                onClick={() => onIrAPunto(p.grafico, p.punto)}
                title="Ver en el gráfico"
              >
                <span className="nota-numero">{p.numero}</span>
                <span>
                  <strong style={{ color: p.color }}>{p.tituloGrafico}</strong>
                  <br />
                  {p.descripcion}
                </span>
              </button>
              {p.notas.map(itemDeNota)}
            </div>
          ))
        )}
      </section>
    </aside>
  )
}
