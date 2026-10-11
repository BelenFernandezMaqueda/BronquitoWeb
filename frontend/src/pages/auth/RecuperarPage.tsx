import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ApiError, api } from '../../api/client'
import { AuthShell } from './AuthShell'

type Tab = 'paciente' | 'medico'

export function RecuperarPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('rol') === 'medico' ? 'medico' : 'paciente'
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  function cambiarTab(nuevo: Tab) {
    setParams({ rol: nuevo }, { replace: true })
    setError(null)
    setMensaje(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setEnviando(true)
    try {
      const res =
        tab === 'medico'
          ? await api.medico.olvideContrasena(valor.trim())
          : await api.paciente.olvidePin(valor.trim())
      setMensaje(res.mensaje)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar el pedido.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthShell
      titulo={tab === 'medico' ? 'Recuperar contraseña' : 'Recuperar PIN'}
      subtitulo="Te mandamos un link por mail para volver a entrar."
    >
      <div className="auth-tabs" role="tablist" aria-label="Tipo de cuenta">
        <button
          role="tab"
          aria-selected={tab === 'paciente'}
          className={tab === 'paciente' ? 'active' : ''}
          onClick={() => cambiarTab('paciente')}
        >
          Soy paciente
        </button>
        <button
          role="tab"
          aria-selected={tab === 'medico'}
          className={tab === 'medico' ? 'active' : ''}
          onClick={() => cambiarTab('medico')}
        >
          Soy médico/a
        </button>
      </div>

      {error && <div className="auth-alert error">{error}</div>}

      {mensaje ? (
        <>
          <div className="auth-alert ok">{mensaje}</div>
          <p className="auth-sub" style={{ marginBottom: 0 }}>
            Revisá tu casilla (y la carpeta de spam). El link vence en un rato.
          </p>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="valor">
              {tab === 'medico' ? 'Mail de tu cuenta' : 'Mail o nombre de usuario de tu cuenta'}
            </label>
            <input
              id="valor"
              type={tab === 'medico' ? 'email' : 'text'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-teal btn-block" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar instrucciones'}
          </button>
        </form>
      )}

      <div className="auth-links">
        <Link to={`/login?rol=${tab}`}>← Volver al login</Link>
      </div>
    </AuthShell>
  )
}
