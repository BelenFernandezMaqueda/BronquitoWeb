import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useSession } from '../../auth/session'
import { ApiError } from '../../api/client'
import { apiDispositivo, textoUltimaConexion } from '../../api/dispositivo'
import type { DispositivoPaciente } from '../../api/dispositivo'
import { CodigoConexion } from '../../components/ui/CodigoConexion'

/**
 * Botón "Sincronizar dispositivo" de la vista del paciente y su modal: el
 * código para conectar la ESP y si ya tiene el PIN actual. Sólo lectura: el
 * paciente no puede formatear ni cambiar de usuario (eso lo hace el médico).
 *
 * Sirve sobre todo después de "Olvidé mi PIN": el PIN nuevo llega al
 * dispositivo recién cuando sincroniza.
 */
export function DispositivoPacientePanel() {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button className="add-patient" onClick={() => setAbierto(true)}>
        📟 Sincronizar dispositivo
      </button>
      {abierto && <DispositivoPacienteModal onClose={() => setAbierto(false)} />}
    </>
  )
}

function DispositivoPacienteModal({ onClose }: { onClose: () => void }) {
  const { token } = useSession()
  const [estado, setEstado] = useState<DispositivoPaciente | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const actualizar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setEstado(await apiDispositivo.delPaciente(token!))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos leer el estado del dispositivo.')
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => {
    void actualizar()
  }, [actualizar])

  return (
    <Modal
      titulo="Sincronizar dispositivo"
      wide
      onClose={onClose}
      acciones={
        <>
          <button type="button" className="btn btn-outline" onClick={() => void actualizar()} disabled={cargando}>
            {cargando ? 'Actualizando…' : 'Actualizar estado'}
          </button>
          <button type="button" className="btn btn-teal" onClick={onClose}>
            Cerrar
          </button>
        </>
      }
    >
      <div className="dispositivo-modal">
        {error && <div className="auth-alert error">{error}</div>}

        {cargando && !estado && <p>Cargando…</p>}

        {estado && (
          <>
            <CodigoConexion conexion={estado.conexion} />

            {estado.asignado ? (
              <>
                <div className="dispositivo-datos">
                  <div className="dispositivo-dato">
                    <span>Última conexión</span>
                    <strong>{textoUltimaConexion(estado.ultimo_contacto)}</strong>
                  </div>
                  <div className="dispositivo-dato">
                    <span>PIN en el dispositivo</span>
                    <strong>{estado.pin_actualizado ? 'Actualizado' : 'Pendiente'}</strong>
                  </div>
                </div>

                {estado.pin_actualizado ? (
                  <div className="auth-alert ok">Tu dispositivo ya tiene tu PIN actual.</div>
                ) : (
                  <div className="auth-alert info">
                    Tu dispositivo todavía no tiene tu PIN actual. Conectalo con el código de arriba y tocá
                    Sincronizar en el dispositivo: te va a pedir que ingreses tu PIN. Después tocá "Actualizar
                    estado" para confirmarlo acá.
                  </div>
                )}
              </>
            ) : (
              <div className="auth-alert info">
                El dispositivo todavía no está configurado con tu perfil. Pedíselo a tu médico.
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
