/**
 * Tipos que reflejan lo que la API de Bronquito recibe y devuelve.
 * Mantener en sync con `backend/app/schemas/`.
 */

export type Rol = 'medico' | 'paciente'

export type Sexo = 'F' | 'M' | 'X'

export type EnfermedadPreexistente = 'EPOC' | 'Asma' | 'Lesión Medular' | 'Fibrosis quística' | 'Otra' | 'NS/NC'

export interface TokenOut {
  access_token: string
  token_type: 'bearer'
  rol: Rol
}

export interface RecuperacionOut {
  mensaje: string
}

export interface MedicoPerfil {
  id_medico: number
  usuario: string
  nombre: string
  apellido: string
  fecha_registro: string
}

/** Médico que tiene acceso vigente a la información clínica del paciente. */
export interface MedicoACargo {
  id_medico: number
  nombre: string
  apellido: string
}

export interface PacientePerfil {
  id_paciente: number
  nombre_usuario: string
  nombre: string | null
  apellido: string | null
  email: string | null
  altura_cm: number
  peso_kg: number
  fecha_nacimiento: string
  sexo: string
  fumador: boolean
  enfermedades: string | null
  fecha_registro: string
  acepto_terminos: boolean
}

export type TipoEvaluacion = 'ESPIROMETRIA' | 'PIM_PEM'

export interface Evaluacion {
  id_evaluacion: number
  tipo: TipoEvaluacion
  fecha_hora: string
  fvc: number | null
  fev1: number | null
  pef: number | null
  fivc: number | null
  fiv1: number | null
  pim: number | null
  temperatura: number | null
  humedad: number | null
}

export interface EvaluacionMuestras {
  tiempo: number[]
  flujo: number[]
  presion: number[]
  volumen: number[]
}

export interface Entrenamiento {
  id_entrenamiento: number
  fecha_hora: string
  resistencia_programada: number
  repeticiones_programadas: number
  presion_max: number
  presion_promedio: number
  indice_fatiga: number
  potencia_insp: number
  trabajo: number
  duty_cycle: number
  tiempo_entre_reps: number
  volumen_total: number
  temperatura: number | null
  humedad: number | null
}

/** La rutina activa de un paciente ahora mismo. */
export interface Rutina {
  resistencia_activa: number
  tiempo_descanso: number
  repeticiones: number
  modificado_por: 'ALGORITMO' | 'MEDICO'
  fecha_actualizacion: string
}

/** Una entrada del historial de frecuencia/días recomendados de un paciente. */
export interface Frecuencia {
  id_frecuencia: number
  sesiones_por_semana: number
  /** Días de la semana recomendados (0 = lunes ... 6 = domingo). */
  dias_semana: number[]
  vigente_desde: string
  creado_en: string
}

/**
 * Nota de un médico sobre un paciente: en un punto de un gráfico (`grafico` +
 * `punto`), o comentario general de una sesión (`grafico` y `punto` en null).
 * Las claves de `grafico`/`punto` las arma el front (ver anotaciones/useAnotaciones.ts).
 */
export interface Anotacion {
  id_anotacion: number
  id_medico: number
  /** Nombre y apellido del médico que la escribió. */
  autor: string
  /** `fecha_hora` de la sesión de consultorio a la que pertenece, si es de una. */
  sesion: string | null
  grafico: string | null
  punto: string | null
  texto: string
  creado_en: string
  editado_en: string | null
}

// --- Request bodies -------------------------------------------------------

export interface MedicoLoginBody {
  usuario: string
  contrasena: string
}

export interface MedicoRegistroBody {
  usuario: string
  contrasena: string
  nombre: string
  apellido: string
  acepto_terminos: boolean
}

export interface PacienteLoginBody {
  nombre_usuario: string
  pin: string
}

export interface PacienteRegistroBody {
  nombre_usuario: string
  pin: string
  nombre: string
  apellido: string
  email: string
  altura_cm: number
  peso_kg: number
  fecha_nacimiento: string
  sexo: Sexo
  fumador: boolean
  enfermedades: EnfermedadPreexistente[]
  acepto_terminos: boolean
}

export interface PacientePerfilUpdateBody {
  nombre_usuario?: string
  pin?: string
  nombre?: string
  apellido?: string
  email?: string
  altura_cm?: number
  peso_kg?: number
  fecha_nacimiento?: string
  sexo?: Sexo
  fumador?: boolean
  enfermedades?: EnfermedadPreexistente[]
  acepto_terminos?: boolean
}

export interface MedicoPerfilUpdateBody {
  usuario?: string
  nombre?: string
  apellido?: string
  nueva_contrasena?: string
}

export interface FrecuenciaCrearBody {
  sesiones_por_semana: number
  /** Días de la semana recomendados (0 = lunes ... 6 = domingo). */
  dias_semana: number[]
}

export interface AnotacionCrearBody {
  texto: string
  sesion?: string | null
  grafico?: string | null
  punto?: string | null
}
