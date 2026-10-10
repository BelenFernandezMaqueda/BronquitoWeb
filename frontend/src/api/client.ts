/**
 * Cliente HTTP mínimo para la API de Bronquito. `fetch` alcanza — no hace
 * falta axios ni similar. Todas las funciones de auth viven acá.
 */

import type {
  Entrenamiento,
  Evaluacion,
  EvaluacionMuestras,
  Frecuencia,
  FrecuenciaCrearBody,
  MedicoLoginBody,
  MedicoACargo,
  MedicoPerfil,
  MedicoPerfilUpdateBody,
  MedicoRegistroBody,
  PacienteLoginBody,
  PacientePerfil,
  PacientePerfilUpdateBody,
  PacienteRegistroBody,
  RecuperacionOut,
  Rutina,
  TokenOut,
} from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Error de la API con el status HTTP y un mensaje ya legible para mostrar. */
export class ApiError extends Error {
  status: number

  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.name = 'ApiError'
    this.status = status
  }
}

interface Opciones {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Token JWT para endpoints protegidos. */
  token?: string
}

/** Extrae un mensaje mostrable del cuerpo de error de FastAPI. */
function mensajeDeError(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    // Errores de validación de Pydantic: [{ loc, msg, type }, ...]
    if (Array.isArray(detail) && detail.length > 0) {
      const primero = detail[0]
      if (primero && typeof primero === 'object' && 'msg' in primero) {
        return String((primero as { msg: unknown }).msg)
      }
    }
  }
  return `Error ${status}. Probá de nuevo en un momento.`
}

async function apiFetch<T>(path: string, opciones: Opciones = {}): Promise<T> {
  const { method = 'GET', body, token } = opciones

  let respuesta: Response
  try {
    respuesta = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. ¿Está corriendo la API?')
  }

  if (respuesta.status === 204) return undefined as T

  const data = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    throw new ApiError(respuesta.status, mensajeDeError(data, respuesta.status))
  }

  return data as T
}

// --- Médicos -------------------------------------------------------------

export const api = {
  medico: {
    login: (body: MedicoLoginBody) =>
      apiFetch<TokenOut>('/auth/medicos/login', { method: 'POST', body }),
    registro: (body: MedicoRegistroBody) =>
      apiFetch<TokenOut>('/auth/medicos/registro', { method: 'POST', body }),
    olvideContrasena: (usuario: string) =>
      apiFetch<RecuperacionOut>('/auth/medicos/olvide-contrasena', {
        method: 'POST',
        body: { usuario },
      }),
    resetearContrasena: (token: string, nueva_contrasena: string) =>
      apiFetch<void>('/auth/medicos/resetear-contrasena', {
        method: 'POST',
        body: { token, nueva_contrasena },
      }),
    me: (token: string) => apiFetch<MedicoPerfil>('/medicos/me', { token }),
    actualizarPerfil: (token: string, body: MedicoPerfilUpdateBody) =>
      apiFetch<MedicoPerfil>('/medicos/me', { method: 'PATCH', body, token }),
    misPacientes: (token: string) => apiFetch<PacientePerfil[]>('/medicos/me/pacientes', { token }),
    vincularPaciente: (token: string, dni: string, pin: string) =>
      apiFetch<PacientePerfil>('/medicos/me/vincular', { method: 'POST', body: { dni, pin }, token }),
    desvincularPaciente: (token: string, idPaciente: number) =>
      apiFetch<void>(`/medicos/me/pacientes/${idPaciente}`, { method: 'DELETE', token }),
    evaluacionesDe: (token: string, idPaciente: number) =>
      apiFetch<Evaluacion[]>(`/medicos/me/pacientes/${idPaciente}/evaluaciones`, { token }),
    entrenamientosDe: (token: string, idPaciente: number) =>
      apiFetch<Entrenamiento[]>(`/medicos/me/pacientes/${idPaciente}/entrenamientos`, { token }),
    rutinaDe: (token: string, idPaciente: number) =>
      apiFetch<Rutina | null>(`/medicos/me/pacientes/${idPaciente}/rutina`, { token }),
    muestrasDeEvaluacion: (token: string, idPaciente: number, idEvaluacion: number) =>
      apiFetch<EvaluacionMuestras>(
        `/medicos/me/pacientes/${idPaciente}/evaluaciones/${idEvaluacion}/muestras`,
        { token },
      ),
    historialFrecuencia: (token: string, idPaciente: number) =>
      apiFetch<Frecuencia[]>(`/medicos/me/pacientes/${idPaciente}/frecuencia`, { token }),
    crearFrecuencia: (token: string, idPaciente: number, body: FrecuenciaCrearBody) =>
      apiFetch<Frecuencia>(`/medicos/me/pacientes/${idPaciente}/frecuencia`, { method: 'POST', body, token }),
  },

  paciente: {
    login: (body: PacienteLoginBody) =>
      apiFetch<TokenOut>('/auth/pacientes/login', { method: 'POST', body }),
    registro: (body: PacienteRegistroBody) =>
      apiFetch<TokenOut>('/auth/pacientes/registro', { method: 'POST', body }),
    olvidePin: (identificador: string) =>
      apiFetch<RecuperacionOut>('/auth/pacientes/olvide-pin', {
        method: 'POST',
        body: { identificador },
      }),
    resetearPin: (token: string, nuevo_pin: string) =>
      apiFetch<void>('/auth/pacientes/resetear-pin', {
        method: 'POST',
        body: { token, nuevo_pin },
      }),
    me: (token: string) => apiFetch<PacientePerfil>('/pacientes/me', { token }),
    actualizarPerfil: (token: string, body: PacientePerfilUpdateBody) =>
      apiFetch<PacientePerfil>('/pacientes/me', { method: 'PATCH', body, token }),
    medicosACargo: (token: string) => apiFetch<MedicoACargo[]>('/pacientes/me/medicos', { token }),
    historialFrecuencia: (token: string) =>
      apiFetch<Frecuencia[]>('/pacientes/me/frecuencia', { token }),
    evaluaciones: (token: string) => apiFetch<Evaluacion[]>('/pacientes/me/evaluaciones', { token }),
    entrenamientos: (token: string) => apiFetch<Entrenamiento[]>('/pacientes/me/entrenamientos', { token }),
  },
}
