/**
 * Endpoints del médico para manejar el dispositivo (la ESP32). Ver
 * backend/app/routers/dispositivo_medico.py.
 *
 * La web nunca le habla a la ESP: estos pedidos quedan en una cola que la
 * ESP retira cuando sincroniza. Por eso todo vuelve "esperando" y hay que
 * actualizar el estado para ver si ya se aplicó.
 */

import { apiFetch } from './client'

export type TipoSolicitud = 'CARGAR_PERFIL' | 'RESET' | 'RUTINA'
export type EstadoSolicitud = 'PENDIENTE' | 'ENTREGADA' | 'CONFIRMADA' | 'RECHAZADA' | 'ERROR' | 'CANCELADA'

export interface SolicitudDispositivo {
  id_solicitud: number
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  detalle: string | null
  /** Usuario del paciente de reemplazo (sólo en "cambiar usuario"). */
  reemplazo: string | null
  creada_en: string
  entregada_en: string | null
  confirmada_en: string | null
  cancelable: boolean
}

export interface EstadoDispositivo {
  paciente: { id_paciente: number; nombre_usuario: string; nombre: string | null; apellido: string | null } | null
  /** Asignado a un paciente que no está en tu lista (no se dice cuál). */
  asignado_a_otro: boolean
  puede_operar: boolean
  ultimo_contacto: string | null
  archivos_pendientes: number
  vacia: boolean | null
  usuario_en_dispositivo: string | null
  solicitud: SolicitudDispositivo | null
  /**
   * Cómo encuentra la ESP a la compu en la red local: `codigo` es el último
   * número de la IP, lo único que se tipea en la ESP. Null si no se pudo
   * averiguar la IP (hay que levantar con ./levantar.sh).
   */
  conexion: ConexionDispositivo
}

export interface ConexionDispositivo {
  ip: string | null
  codigo: string | null
  puerto: number
}

/** Lo que ve el paciente: sólo conectar y sincronizar, sin formatear. */
export interface DispositivoPaciente {
  /** False si el dispositivo es de otro paciente (o de nadie). */
  asignado: boolean
  ultimo_contacto: string | null
  /** True si el dispositivo ya validó el PIN actual del paciente. */
  pin_actualizado: boolean | null
  conexion: ConexionDispositivo
}

const BASE = '/medicos/me/dispositivo'

export const apiDispositivo = {
  estado: (token: string) => apiFetch<EstadoDispositivo>(BASE, { token }),
  asignar: (token: string, nombreUsuario: string) =>
    apiFetch<EstadoDispositivo>(`${BASE}/asignar`, { method: 'POST', body: { nombre_usuario: nombreUsuario }, token }),
  /** Con `reemplazo` es "cambiar usuario"; sin él, sólo formatear. */
  formatear: (token: string, reemplazo?: string) =>
    apiFetch<EstadoDispositivo>(`${BASE}/formatear`, {
      method: 'POST',
      body: { nombre_usuario_reemplazo: reemplazo ?? null },
      token,
    }),
  cancelar: (token: string, idSolicitud: number) =>
    apiFetch<EstadoDispositivo>(`${BASE}/solicitudes/${idSolicitud}/cancelar`, { method: 'POST', token }),
  /** Vista del paciente (ver backend/app/routers/dispositivo_paciente.py). */
  delPaciente: (token: string) => apiFetch<DispositivoPaciente>('/pacientes/me/dispositivo', { token }),
}

/** "12/10/26, 15:10", o "Nunca se conectó". */
export function textoUltimaConexion(iso: string | null): string {
  if (!iso) return 'Nunca se conectó'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}
