/**
 * Modelo de datos de Bronquito.
 *
 * Estas interfaces están pensadas para mapear 1:1 (o casi) con las tablas
 * que eventualmente vivirán en un backend real. Por ahora se usan sólo
 * para tipar los datos mock en `src/data/mockData.ts`, pero cualquier
 * respuesta de API futura debería poder encajar acá con cambios mínimos
 * (por ejemplo, IDs que hoy son numéricos podrían pasar a ser UUID strings).
 */

export type Role = 'paciente' | 'medico'

export type Adherencia = 'buena' | 'irregular' | 'sin_actividad'

export type EstadoSesion = 'completa' | 'parcial' | 'no_realizada'

export type TipoSesion = 'entrenamiento' | 'evaluacion'

/** Usuario base: lo que comparten paciente y médico como cuenta. */
export interface UsuarioBase {
  id: string
  nombre: string
  email: string
  avatarIniciales: string
}

export interface Paciente extends UsuarioBase {
  rol: 'paciente'
  edad: number
  diagnostico: string
  enfermedades?: string | null
  fechaNacimiento?: string
  /** No todos los pacientes mock lo tienen cargado; los que vienen de la API sí. */
  nombreUsuario?: string
  /** Nivel de resistencia actual del dispositivo (escala del equipo, ej. 1-8). */
  resistenciaActual: number
  /** Frecuencia de entrenamiento recomendada, en sesiones por semana. */
  frecuenciaSemanal: number
  pimInicial: number
  pimActual: number
}

export interface Medico extends UsuarioBase {
  rol: 'medico'
  matricula: string
  especialidad: string
}

/** Una sesión de evaluación: mide PIM (presión inspiratoria máxima) y curva flujo-volumen. */
export interface SesionEvaluacion {
  id: string
  pacienteId: string
  fecha: string
  pim: number // cmH2O
  volumen: number // L
  /** Puntos de la curva flujo-volumen, normalizados para graficar (x: volumen, y: flujo). */
  curvaFlujoVolumen: Array<{ x: number; y: number }>
  observaciones?: string
  /** true si fue una evaluación en consultorio con el médico presente. */
  enConsultorio: boolean
}

/** Una sesión de entrenamiento inspiratorio. */
export interface SesionEntrenamiento {
  id: string
  pacienteId: string
  fecha: string
  duracionSegundos: number
  duracionObjetivoSegundos: number
  resistencia: number
  /** Work of Breathing, en Joules. */
  wob: number
  /** Potencia media, en Watts. */
  potencia: number
  respiraciones: number
  eficiencia: number // 0-100
  estado: EstadoSesion
  enConsultorio: boolean
}

/** Vista agregada de un día de la semana para la racha del dashboard del paciente. */
export interface DiaRacha {
  fecha: string
  etiqueta: string // 'LUN', 'MAR', ...
  completado: boolean
  esHoy: boolean
}

/** Resumen de progreso que consume el dashboard del paciente. */
export interface ResumenProgreso {
  duracionPromedioSegundos: number
  duracionPromedioVariacionPct: number
  eficienciaPromedio: number
  eficienciaVariacionPts: number
  resistenciaActual: number
  resistenciaDesde?: string
  rachaActualDias: number
}
