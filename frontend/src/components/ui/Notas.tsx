import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Anotacion } from '../../api/types'
import { formatearMomentoNota } from '../../anotaciones/notas'

function mensajeDeError(err: unknown, porDefecto: string): string {
  return err instanceof Error ? err.message : porDefecto
}

interface NotaComposerProps {
  placeholder: string
  textoInicial?: string
  etiquetaGuardar?: string
  autoFocus?: boolean
  onGuardar: (texto: string) => Promise<void>
  onCancelar?: () => void
}

/** Caja para escribir una nota nueva (o editar una). Ctrl/⌘ + Enter guarda. */
export function NotaComposer({
  placeholder,
  textoInicial = '',
  etiquetaGuardar = 'Guardar',
  autoFocus,
  onGuardar,
  onCancelar,
}: NotaComposerProps) {
  const [texto, setTexto] = useState(textoInicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    const limpio = texto.trim()
    if (!limpio || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(limpio)
      setTexto('')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la nota.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="nota-composer">
      <textarea
        value={texto}
        placeholder={placeholder}
        rows={2}
        maxLength={2000}
        autoFocus={autoFocus}
        aria-label={placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            guardar()
          }
        }}
      />
      {error && <p className="nota-error">{error}</p>}
      <div className="nota-composer-acciones">
        {onCancelar && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
        )}
        <button type="button" className="btn btn-teal btn-sm" onClick={guardar} disabled={!texto.trim() || guardando}>
          {guardando ? 'Guardando…' : etiquetaGuardar}
        </button>
      </div>
    </div>
  )
}

interface NotaItemProps {
  nota: Anotacion
  /** Sólo el médico que la escribió la puede editar o borrar. */
  puedeModificar: boolean
  onEditar: (texto: string) => Promise<void>
  onBorrar: () => Promise<void>
  /** Algo para mostrar arriba de la nota, ej. en qué gráfico y punto está. */
  contexto?: ReactNode
}

/** Una nota con su autor y fecha, al estilo de los comentarios de Google Docs. */
export function NotaItem({ nota, puedeModificar, onEditar, onBorrar, contexto }: NotaItemProps) {
  const [editando, setEditando] = useState(false)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    setBorrando(true)
    setError(null)
    try {
      await onBorrar()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo borrar la nota.'))
      setBorrando(false)
    }
  }

  return (
    <div className="nota">
      {contexto}
      <div className="nota-meta">
        <strong>{nota.autor}</strong> · {formatearMomentoNota(nota)}
      </div>

      {editando ? (
        <NotaComposer
          placeholder="Editá la nota…"
          textoInicial={nota.texto}
          autoFocus
          onGuardar={async (texto) => {
            await onEditar(texto)
            setEditando(false)
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <p className="nota-texto">{nota.texto}</p>
      )}

      {puedeModificar && !editando && (
        <div className="nota-acciones">
          {confirmandoBorrado ? (
            <>
              <span>¿Borrar esta nota?</span>
              <button type="button" className="nota-accion nota-accion-peligro" onClick={borrar} disabled={borrando}>
                {borrando ? 'Borrando…' : 'Sí, borrar'}
              </button>
              <button type="button" className="nota-accion" onClick={() => setConfirmandoBorrado(false)} disabled={borrando}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="nota-accion" onClick={() => setEditando(true)}>
                Editar
              </button>
              <button type="button" className="nota-accion" onClick={() => setConfirmandoBorrado(true)}>
                Borrar
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="nota-error">{error}</p>}
    </div>
  )
}
