import type {
  Adherencia,
  DiaRacha,
  Medico,
  Paciente,
  ResumenProgreso,
  SesionEvaluacion,
  SesionEntrenamiento,
} from '../types'

/**
 * "Hoy" ficticio para que los datos mock cuenten una historia coherente
 * (racha semanal, "última sesión: hace X días", etc). En un backend real
 * esto sería simplemente `new Date()`.
 */
export const HOY = new Date('2026-08-29T09:00:00')

export function formatearFecha(fecha: string | Date, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  return d.toLocaleDateString('es-AR', opts).replace('.', '')
}

const FORMATO_ISO_ARGENTINA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

/**
 * Fecha (YYYY-MM-DD) tal como es en Argentina en este instante. Nunca uses
 * `.toISOString()` para esto: convierte a UTC, y de noche (hora argentina)
 * eso ya cayó en el día siguiente.
 */
export function isoArgentina(fecha: Date): string {
  return FORMATO_ISO_ARGENTINA.format(fecha)
}

export function edadDesdeNacimiento(fechaIso: string): number {
  const nacimiento = new Date(fechaIso)
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const noCumplioAun =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  if (noCumplioAun) edad -= 1
  return edad
}

export function diasDesde(fecha: string): number {
  const ms = HOY.getTime() - new Date(fecha).getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

// ---------------------------------------------------------------------------
// Médicos
// ---------------------------------------------------------------------------

export const medicos: Medico[] = [
  {
    id: 'med-1',
    rol: 'medico',
    nombre: 'Dra. Belén Fernández',
    email: 'belen.fernandez@bronquito.app',
    avatarIniciales: 'DR',
    matricula: 'MP 45231',
    especialidad: 'Neumonología',
  },
]

// ---------------------------------------------------------------------------
// Pacientes
// ---------------------------------------------------------------------------

export const pacientes: Paciente[] = [
  {
    id: 'pac-1',
    rol: 'paciente',
    nombre: 'Malena Salerno',
    email: 'malena.salerno@mail.com',
    avatarIniciales: 'MS',
    edad: 34,
    diagnostico: 'EPOC leve',
    resistenciaActual: 4,
    frecuenciaSemanal: 5,
    pimInicial: 58,
    pimActual: 74,
  },
  {
    id: 'pac-2',
    rol: 'paciente',
    nombre: 'Tomás Herrera',
    email: 'tomas.herrera@mail.com',
    avatarIniciales: 'TH',
    edad: 28,
    diagnostico: 'Lesión medular T6',
    resistenciaActual: 3,
    frecuenciaSemanal: 4,
    pimInicial: 40,
    pimActual: 52,
  },
  {
    id: 'pac-3',
    rol: 'paciente',
    nombre: 'Rocío Fernández',
    email: 'rocio.fernandez@mail.com',
    avatarIniciales: 'RF',
    edad: 61,
    diagnostico: 'EPOC moderado',
    resistenciaActual: 2,
    frecuenciaSemanal: 5,
    pimInicial: 35,
    pimActual: 44,
  },
  {
    id: 'pac-4',
    rol: 'paciente',
    nombre: 'Julián Paz',
    email: 'julian.paz@mail.com',
    avatarIniciales: 'JP',
    edad: 22,
    diagnostico: 'Rendimiento deportivo',
    resistenciaActual: 6,
    frecuenciaSemanal: 3,
    pimInicial: 90,
    pimActual: 112,
  },
]

export const pacienteActualId = 'pac-1'

// ---------------------------------------------------------------------------
// Sesiones de evaluación
// ---------------------------------------------------------------------------

function curvaEjemplo(escala: number): Array<{ x: number; y: number }> {
  const base = [
    { x: 0, y: 0.1 },
    { x: 0.4, y: 0.55 },
    { x: 0.8, y: 0.92 },
    { x: 1.2, y: 0.8 },
    { x: 1.7, y: 0.58 },
    { x: 2.2, y: 0.36 },
    { x: 2.6, y: 0.2 },
    { x: 2.9, y: 0.08 },
  ]
  return base.map((p) => ({ x: p.x, y: +(p.y * escala).toFixed(2) }))
}

export const evaluaciones: SesionEvaluacion[] = [
  {
    id: 'cal-1-1',
    pacienteId: 'pac-1',
    fecha: '2026-07-18',
    pim: 58,
    volumen: 2.4,
    curvaFlujoVolumen: curvaEjemplo(0.75),
    observaciones: 'Evaluación inicial',
    enConsultorio: true,
  },
  {
    id: 'cal-1-2',
    pacienteId: 'pac-1',
    fecha: '2026-08-01',
    pim: 61,
    volumen: 2.6,
    curvaFlujoVolumen: curvaEjemplo(0.85),
    observaciones: 'Se ajustó boquilla',
    enConsultorio: true,
  },
  {
    id: 'cal-1-3',
    pacienteId: 'pac-1',
    fecha: '2026-08-15',
    pim: 68,
    volumen: 2.7,
    curvaFlujoVolumen: curvaEjemplo(0.92),
    enConsultorio: false,
  },
  {
    id: 'cal-1-4',
    pacienteId: 'pac-1',
    fecha: '2026-08-29',
    pim: 74,
    volumen: 2.9,
    curvaFlujoVolumen: curvaEjemplo(1),
    observaciones: 'Buena técnica',
    enConsultorio: false,
  },
  {
    id: 'cal-2-1',
    pacienteId: 'pac-2',
    fecha: '2026-07-01',
    pim: 40,
    volumen: 1.9,
    curvaFlujoVolumen: curvaEjemplo(0.6),
    observaciones: 'Evaluación inicial',
    enConsultorio: true,
  },
  {
    id: 'cal-2-2',
    pacienteId: 'pac-2',
    fecha: '2026-08-10',
    pim: 46,
    volumen: 2.0,
    curvaFlujoVolumen: curvaEjemplo(0.7),
    enConsultorio: false,
  },
  {
    id: 'cal-2-3',
    pacienteId: 'pac-2',
    fecha: '2026-08-27',
    pim: 52,
    volumen: 2.2,
    curvaFlujoVolumen: curvaEjemplo(0.78),
    enConsultorio: false,
  },
  {
    id: 'cal-3-1',
    pacienteId: 'pac-3',
    fecha: '2026-07-05',
    pim: 35,
    volumen: 1.6,
    curvaFlujoVolumen: curvaEjemplo(0.5),
    observaciones: 'Evaluación inicial',
    enConsultorio: true,
  },
  {
    id: 'cal-3-2',
    pacienteId: 'pac-3',
    fecha: '2026-08-25',
    pim: 44,
    volumen: 1.8,
    curvaFlujoVolumen: curvaEjemplo(0.62),
    enConsultorio: false,
  },
  {
    id: 'cal-4-1',
    pacienteId: 'pac-4',
    fecha: '2026-06-20',
    pim: 90,
    volumen: 3.2,
    curvaFlujoVolumen: curvaEjemplo(1.1),
    observaciones: 'Evaluación inicial',
    enConsultorio: true,
  },
  {
    id: 'cal-4-2',
    pacienteId: 'pac-4',
    fecha: '2026-08-19',
    pim: 112,
    volumen: 3.6,
    curvaFlujoVolumen: curvaEjemplo(1.3),
    enConsultorio: false,
  },
]

// ---------------------------------------------------------------------------
// Sesiones de entrenamiento
// ---------------------------------------------------------------------------

export const entrenamientos: SesionEntrenamiento[] = [
  { id: 'ent-1-1', pacienteId: 'pac-1', fecha: '2026-08-29', duracionSegundos: 480, duracionObjetivoSegundos: 480, resistencia: 4, wob: 4.1, potencia: 0.85, respiraciones: 22, eficiencia: 88, estado: 'completa', enConsultorio: false },
  { id: 'ent-1-2', pacienteId: 'pac-1', fecha: '2026-08-27', duracionSegundos: 370, duracionObjetivoSegundos: 480, resistencia: 4, wob: 3.6, potencia: 0.79, respiraciones: 18, eficiencia: 70, estado: 'parcial', enConsultorio: false },
  { id: 'ent-1-3', pacienteId: 'pac-1', fecha: '2026-08-25', duracionSegundos: 420, duracionObjetivoSegundos: 420, resistencia: 3, wob: 3.2, potencia: 0.71, respiraciones: 20, eficiencia: 82, estado: 'completa', enConsultorio: false },
  { id: 'ent-1-4', pacienteId: 'pac-1', fecha: '2026-08-24', duracionSegundos: 420, duracionObjetivoSegundos: 420, resistencia: 3, wob: 3.1, potencia: 0.7, respiraciones: 19, eficiencia: 80, estado: 'completa', enConsultorio: false },
  { id: 'ent-1-5', pacienteId: 'pac-1', fecha: '2026-08-23', duracionSegundos: 420, duracionObjetivoSegundos: 420, resistencia: 3, wob: 3.0, potencia: 0.68, respiraciones: 19, eficiencia: 79, estado: 'completa', enConsultorio: false },
  { id: 'ent-1-6', pacienteId: 'pac-1', fecha: '2026-08-22', duracionSegundos: 400, duracionObjetivoSegundos: 420, resistencia: 3, wob: 2.9, potencia: 0.66, respiraciones: 18, eficiencia: 76, estado: 'completa', enConsultorio: false },

  { id: 'ent-2-1', pacienteId: 'pac-2', fecha: '2026-08-28', duracionSegundos: 300, duracionObjetivoSegundos: 300, resistencia: 3, wob: 2.6, potencia: 0.6, respiraciones: 16, eficiencia: 81, estado: 'completa', enConsultorio: false },
  { id: 'ent-2-2', pacienteId: 'pac-2', fecha: '2026-08-26', duracionSegundos: 260, duracionObjetivoSegundos: 300, resistencia: 3, wob: 2.4, potencia: 0.57, respiraciones: 14, eficiencia: 74, estado: 'parcial', enConsultorio: false },

  { id: 'ent-3-1', pacienteId: 'pac-3', fecha: '2026-08-25', duracionSegundos: 240, duracionObjetivoSegundos: 300, resistencia: 2, wob: 1.9, potencia: 0.44, respiraciones: 14, eficiencia: 64, estado: 'parcial', enConsultorio: false },

  { id: 'ent-4-1', pacienteId: 'pac-4', fecha: '2026-08-20', duracionSegundos: 600, duracionObjetivoSegundos: 600, resistencia: 6, wob: 6.8, potencia: 1.3, respiraciones: 26, eficiencia: 93, estado: 'completa', enConsultorio: false },
]

// ---------------------------------------------------------------------------
// Derivados / helpers para la UI
// ---------------------------------------------------------------------------

export function evaluacionesDe(pacienteId: string): SesionEvaluacion[] {
  return evaluaciones
    .filter((c) => c.pacienteId === pacienteId)
    .sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha))
}

export function entrenamientosDe(pacienteId: string): SesionEntrenamiento[] {
  return entrenamientos
    .filter((e) => e.pacienteId === pacienteId)
    .sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha))
}

export function ultimaSesionDe(pacienteId: string): string | undefined {
  const todas = [...entrenamientosDe(pacienteId), ...evaluacionesDe(pacienteId)].sort(
    (a, b) => +new Date(b.fecha) - +new Date(a.fecha),
  )
  return todas[0]?.fecha
}

export function adherenciaDe(pacienteId: string): Adherencia {
  const ultima = ultimaSesionDe(pacienteId)
  if (!ultima) return 'sin_actividad'
  const dias = diasDesde(ultima)
  if (dias <= 2) return 'buena'
  if (dias <= 6) return 'irregular'
  return 'sin_actividad'
}

export function textoUltimaSesion(pacienteId: string): string {
  const ultima = ultimaSesionDe(pacienteId)
  if (!ultima) return 'Sin sesiones aún'
  const dias = diasDesde(ultima)
  if (dias === 0) return 'Última sesión: hoy'
  if (dias === 1) return 'Última sesión: ayer'
  return `Última sesión: hace ${dias} días`
}

const DIAS_SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

export function rachaSemanalDe(pacienteId: string): DiaRacha[] {
  const fechasConSesion = new Set(
    [...entrenamientosDe(pacienteId), ...evaluacionesDe(pacienteId)].map((s) => s.fecha),
  )
  // lunes de la semana de HOY
  const diaSemanaHoy = (HOY.getDay() + 6) % 7 // 0 = lunes
  const lunes = new Date(HOY)
  lunes.setDate(HOY.getDate() - diaSemanaHoy)

  return DIAS_SEMANA.map((etiqueta, i) => {
    const fecha = new Date(lunes)
    fecha.setDate(lunes.getDate() + i)
    const iso = isoArgentina(fecha)
    return {
      fecha: iso,
      etiqueta,
      completado: fechasConSesion.has(iso),
      esHoy: iso === isoArgentina(HOY),
    }
  })
}

export function rachaActualDias(pacienteId: string): number {
  const fechasConSesion = new Set(
    [...entrenamientosDe(pacienteId), ...evaluacionesDe(pacienteId)].map((s) => s.fecha),
  )
  let racha = 0
  const cursor = new Date(HOY)
  while (fechasConSesion.has(isoArgentina(cursor))) {
    racha++
    cursor.setDate(cursor.getDate() - 1)
  }
  return racha
}

export function resumenProgresoDe(pacienteId: string): ResumenProgreso {
  const sesiones = entrenamientosDe(pacienteId)
  const recientes = sesiones.slice(0, 5)
  const anteriores = sesiones.slice(5, 10)

  const promedio = (arr: SesionEntrenamiento[], sel: (s: SesionEntrenamiento) => number) =>
    arr.length ? arr.reduce((acc, s) => acc + sel(s), 0) / arr.length : 0

  const duracionProm = promedio(recientes, (s) => s.duracionSegundos)
  const duracionPrev = promedio(anteriores, (s) => s.duracionSegundos)
  const eficienciaProm = promedio(recientes, (s) => s.eficiencia)
  const eficienciaPrev = promedio(anteriores, (s) => s.eficiencia)

  const paciente = pacientes.find((p) => p.id === pacienteId)

  return {
    duracionPromedioSegundos: Math.round(duracionProm),
    duracionPromedioVariacionPct: duracionPrev ? Math.round(((duracionProm - duracionPrev) / duracionPrev) * 100) : 0,
    eficienciaPromedio: Math.round(eficienciaProm),
    eficienciaVariacionPts: Math.round(eficienciaProm - eficienciaPrev),
    resistenciaActual: paciente?.resistenciaActual ?? 1,
    rachaActualDias: rachaActualDias(pacienteId),
  }
}

export function formatearDuracion(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
