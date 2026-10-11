import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { PasswordField } from '../../components/ui/PasswordField'
import { errorNombreUsuario, NOMBRE_USUARIO_MAX, normalizarNombreUsuario } from '../../auth/nombreUsuario'
import { useSession } from '../../auth/session'
import { ApiError, api } from '../../api/client'
import type { PacientePerfil } from '../../api/types'

interface ConnectPatientModalProps {
  onClose: () => void
  /** Se llama cuando el paciente quedó vinculado a este médico. */
  onConectado: (paciente: PacientePerfil) => void
}

/**
 * Vincula a un paciente por nombre de usuario + PIN: el médico tiene que
 * saber las credenciales del paciente (se las pasa en persona), no alcanza
 * con el usuario solo. El backend valida el PIN contra el hash guardado.
 */
export function ConnectPatientModal({ onClose, onConectado }: ConnectPatientModalProps) {
  const { token } = useSession()
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const errorUsuario = errorNombreUsuario(nombreUsuario.trim())
    if (errorUsuario) {
      setError(errorUsuario)
      return
    }
    setEnviando(true)
    try {
      const paciente = await api.medico.vincularPaciente(token!, nombreUsuario.trim(), pin)
      onConectado(paciente)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar al paciente.')
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo="Conectar paciente"
      onClose={onClose}
      acciones={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="conectar-paciente-form" className="btn btn-teal" disabled={enviando}>
            {enviando ? 'Conectando…' : 'Conectar'}
          </button>
        </>
      }
    >
      <p>Pedile el nombre de usuario y el PIN al paciente para vincularlo a tu lista.</p>

      {error && <div className="auth-alert error">{error}</div>}

      <form id="conectar-paciente-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="conectar-usuario">Nombre de usuario</label>
          <input
            id="conectar-usuario"
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={NOMBRE_USUARIO_MAX}
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(normalizarNombreUsuario(e.target.value))}
            autoFocus
            required
          />
        </div>
        <PasswordField
          id="conectar-pin"
          label="PIN (4 dígitos)"
          inputMode="numeric"
          maxLength={4}
          pattern="\d{4}"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          required
        />
      </form>
    </Modal>
  )
}
