import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError, api } from '../../api/client'
import { errorNombreUsuario, NOMBRE_USUARIO_MAX, normalizarNombreUsuario } from '../../auth/nombreUsuario'
import { useSession } from '../../auth/session'
import { PasswordField } from '../../components/ui/PasswordField'
import { AuthShell } from './AuthShell'

type Tab = 'paciente' | 'medico'

export function LoginPage() {
  const { iniciarSesion } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const tab: Tab = params.get('rol') === 'medico' ? 'medico' : 'paciente'
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // paciente
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [pin, setPin] = useState('')
  // medico
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')

  function cambiarTab(nuevo: Tab) {
    setParams({ rol: nuevo }, { replace: true })
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (tab === 'paciente') {
      const errorUsuario = errorNombreUsuario(nombreUsuario.trim())
      if (errorUsuario) {
        setError(errorUsuario)
        return
      }
    }
    setEnviando(true)
    try {
      const res =
        tab === 'paciente'
          ? await api.paciente.login({ nombre_usuario: nombreUsuario.trim(), pin })
          : await api.medico.login({ usuario: usuario.trim(), contrasena })
      await iniciarSesion(res.access_token, res.rol)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.')
      setEnviando(false)
    }
  }

  return (
    <AuthShell titulo="Iniciar sesión" subtitulo="Entrá para ver tu entrenamiento y tus evaluaciones.">
      <div className="auth-tabs" role="tablist" aria-label="Tipo de cuenta">
        <button
          role="tab"
          aria-selected={tab === 'paciente'}
          className={tab === 'paciente' ? 'active' : ''}
          onClick={() => {
            cambiarTab('paciente')
          }}
        >
          Soy paciente
        </button>
        <button
          role="tab"
          aria-selected={tab === 'medico'}
          className={tab === 'medico' ? 'active' : ''}
          onClick={() => {
            cambiarTab('medico')
          }}
        >
          Soy médico/a
        </button>
      </div>

      {error && <div className="auth-alert error">{error}</div>}

      <form onSubmit={onSubmit}>
        {tab === 'paciente' ? (
          <>
            <div className="field">
              <label htmlFor="nombre-usuario">Nombre de usuario</label>
              <input
                id="nombre-usuario"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={NOMBRE_USUARIO_MAX}
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(normalizarNombreUsuario(e.target.value))}
                required
              />
            </div>
            <PasswordField
              id="pin"
              label="PIN (4 dígitos)"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={4}
              pattern="\d{4}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="usuario">Mail</label>
              <input
                id="usuario"
                type="email"
                autoComplete="username"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
              />
            </div>
            <PasswordField
              id="contrasena"
              label="Contraseña"
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
            />
          </>
        )}

        <button type="submit" className="btn btn-teal btn-block" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="auth-links">
        <Link to={`/recuperar?rol=${tab}`}>
          {tab === 'paciente' ? '¿Olvidaste tu PIN?' : '¿Olvidaste tu contraseña?'}
        </Link>
        <span>
          ¿No tenés cuenta?{' '}
          <Link to={tab === 'paciente' ? '/registro/paciente' : '/registro/medico'}>
            Registrate
          </Link>
        </span>
      </div>
    </AuthShell>
  )
}
