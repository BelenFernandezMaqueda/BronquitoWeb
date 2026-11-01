import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useSession } from '../../auth/session'
import { ApiError } from '../../api/client'
import { apiDispositivo } from '../../api/dispositivo'
import { textoUltimaConexion } from '../../api/dispositivo'
import type { EstadoDispositivo, SolicitudDispositivo } from '../../api/dispositivo'
import { CodigoConexion } from '../../components/ui/CodigoConexion'
import type { Paciente } from '../../types'

interface DispositivoPanelProps {
  /** Los pacientes del médico, para elegir a quién asignar o de reemplazo. */
  pacientes: Paciente[]
}

type Accion = 'asignar' | 'formatear' | 'cambiar'

const TIPO_LABEL: Record<SolicitudDispositivo['tipo'], string> = {
  CARGAR_PERFIL: 'Cargar perfil',
  RESET: 'Formatear',
  RUTINA: 'Enviar rutina',
}

/** Texto y tono del estado de un pedido, como lo ve el médico. */
function describirSolicitud(s: SolicitudDispositivo): { texto: string; tono: 'info' | 'ok' | 'error' } {
  const pedido = s.tipo === 'RESET' && s.reemplazo ? `Cambiar usuario a ${s.reemplazo}` : TIPO_LABEL[s.tipo]
  switch (s.estado) {
    case 'PENDIENTE':
      return { texto: `${pedido}: esperando que el dispositivo sincronice.`, tono: 'info' }
    case 'ENTREGADA':
      return { texto: `${pedido}: esperando confirmación en el dispositivo.`, tono: 'info' }
    case 'CONFIRMADA':
      return {
        texto:
          s.detalle === 'aplicada despues de cancelada'
            ? `${pedido}: se aplicó en el dispositivo aunque lo habías cancelado.`
            : `${pedido}: aplicado.`,
        tono: 'ok',
      }
    case 'RECHAZADA':
      return { texto: `${pedido}: el paciente lo rechazó en el dispositivo.`, tono: 'error' }
    case 'CANCELADA':
      return { texto: `${pedido}: cancelado.`, tono: 'info' }
    case 'ERROR':
      return {
        texto:
          s.detalle === 'archivos_pendientes'
            ? `${pedido}: el dispositivo tiene pruebas sin sincronizar y no borró nada. Sincronizalo y volvé a intentar.`
            : `${pedido}: error en el dispositivo (${s.detalle ?? 'sin detalle'}).`,
        tono: 'error',
      }
  }
}

/**
 * Botón "Conectar a dispositivo" (va abajo de la lista de pacientes) y su
 * modal: estado del dispositivo, su último pedido y las acciones (asignar,
 * formatear, cambiar usuario, cancelar).
 *
 * No hay botón "Sincronizar": la web no puede llamar a la ESP. Los pedidos
 * quedan esperando hasta que alguien toque Sincronizar en el dispositivo;
 * "Actualizar estado" sólo vuelve a leer la base para ver si ya se aplicaron.
 */
export function DispositivoPanel({ pacientes }: DispositivoPanelProps) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button className="add-patient" onClick={() => setAbierto(true)}>
        📟 Conectar a dispositivo
      </button>
      {abierto && <DispositivoModal pacientes={pacientes} onClose={() => setAbierto(false)} />}
    </>
  )
}

function DispositivoModal({ pacientes, onClose }: DispositivoPanelProps & { onClose: () => void }) {
  const { token } = useSession()
  const [estado, setEstado] = useState<EstadoDispositivo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [elegido, setElegido] = useState('')
  const [enviando, setEnviando] = useState(false)

  const actualizar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setEstado(await apiDispositivo.estado(token!))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos leer el estado del dispositivo.')
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => {
    void actualizar()
  }, [actualizar])

  async function ejecutar(pedido: () => Promise<EstadoDispositivo>) {
    setEnviando(true)
    setError(null)
    try {
      setEstado(await pedido())
      setAccion(null)
      setElegido('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el pedido.')
    } finally {
      setEnviando(false)
    }
  }

  function confirmarAccion() {
    if (accion === 'asignar') void ejecutar(() => apiDispositivo.asignar(token!, elegido))
    if (accion === 'formatear') void ejecutar(() => apiDispositivo.formatear(token!))
    if (accion === 'cambiar') void ejecutar(() => apiDispositivo.formatear(token!, elegido))
  }

  const solicitud = estado?.solicitud ?? null
  const hayActiva = solicitud?.cancelable ?? false
  const descripcion = solicitud ? describirSolicitud(solicitud) : null
  const otroCargado =
    estado?.paciente && estado.vacia === false && estado.usuario_en_dispositivo
      ? estado.usuario_en_dispositivo !== estado.paciente.nombre_usuario
      : false
  const candidatos = pacientes.filter((p) => p.nombreUsuario && p.nombreUsuario !== estado?.paciente?.nombre_usuario)

  return (
    <Modal
      titulo="Dispositivo"
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

            <div className="dispositivo-datos">
              <div className="dispositivo-dato">
                <span>Paciente</span>
                <strong>
                  {estado.paciente
                    ? `${estado.paciente.nombre ?? ''} ${estado.paciente.apellido ?? ''}`.trim() ||
                      estado.paciente.nombre_usuario
                    : estado.asignado_a_otro
                      ? 'Otro paciente'
                      : 'Sin paciente'}
                </strong>
                {estado.paciente && <small>{estado.paciente.nombre_usuario}</small>}
                {estado.asignado_a_otro && <small>No está en tu lista</small>}
              </div>
              <div className="dispositivo-dato">
                <span>Última conexión</span>
                <strong>{textoUltimaConexion(estado.ultimo_contacto)}</strong>
              </div>
              <div className="dispositivo-dato">
                <span>Pruebas sin sincronizar</span>
                <strong>{estado.ultimo_contacto ? estado.archivos_pendientes : '—'}</strong>
              </div>
            </div>

            {otroCargado && (
              <div className="auth-alert error">
                El dispositivo tiene cargado a otro usuario ({estado.usuario_en_dispositivo}). Formatealo para cargar el
                perfil correcto.
              </div>
            )}

            {descripcion && (
              <div className={`auth-alert ${descripcion.tono} dispositivo-pedido`}>
                <span>
                  {descripcion.texto}
                  {hayActiva && ' Para aplicarlo, tocá Sincronizar en el dispositivo.'}
                </span>
                {solicitud?.cancelable && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={enviando}
                    onClick={() => void ejecutar(() => apiDispositivo.cancelar(token!, solicitud.id_solicitud))}
                  >
                    Cancelar pedido
                  </button>
                )}
              </div>
            )}

            {estado.puede_operar && !hayActiva && accion === null && (
              <div className="dispositivo-acciones">
                {!estado.paciente && (
                  <button type="button" className="btn btn-teal" onClick={() => setAccion('asignar')}>
                    Asignar paciente
                  </button>
                )}
                {estado.paciente && (
                  <button type="button" className="btn btn-outline" onClick={() => setAccion('cambiar')}>
                    Cambiar usuario
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={() => setAccion('formatear')}>
                  Formatear dispositivo
                </button>
              </div>
            )}

            {accion !== null && (
              <section className="dispositivo-confirmar">
                <h4>
                  {accion === 'asignar' ? 'Asignar paciente' : accion === 'cambiar' ? 'Cambiar usuario' : 'Formatear dispositivo'}
                </h4>

                {accion !== 'formatear' && (
                  <div className="field">
                    <label htmlFor="dispositivo-paciente">
                      {accion === 'asignar' ? 'Paciente a asignar' : 'Paciente de reemplazo'}
                    </label>
                    <select id="dispositivo-paciente" value={elegido} onChange={(e) => setElegido(e.target.value)}>
                      <option value="">Elegí un paciente…</option>
                      {candidatos.map((p) => (
                        <option key={p.id} value={p.nombreUsuario}>
                          {p.nombre} ({p.nombreUsuario})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {accion !== 'asignar' && (
                  <div className="auth-alert error">
                    Se van a borrar del dispositivo el perfil, la configuración, las evaluaciones y los entrenamientos.
                    {estado.archivos_pendientes > 0 &&
                      ` En la última conexión tenía ${estado.archivos_pendientes} prueba(s) sin sincronizar: si siguen así, el dispositivo se va a negar.`}
                  </div>
                )}

                <div className="dispositivo-acciones">
                  <button type="button" className="btn btn-outline" onClick={() => setAccion(null)}>
                    Volver
                  </button>
                  <button
                    type="button"
                    className="btn btn-teal"
                    disabled={enviando || (accion !== 'formatear' && !elegido)}
                    onClick={confirmarAccion}
                  >
                    {enviando
                      ? 'Enviando…'
                      : accion === 'asignar'
                        ? 'Asignar'
                        : accion === 'cambiar'
                          ? 'Cambiar usuario'
                          : 'Formatear'}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
