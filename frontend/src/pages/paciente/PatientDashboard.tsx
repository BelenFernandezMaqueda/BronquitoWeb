
import { useEffect, useMemo, useState } from 'react'
import { diasVigentesEn, MonthCalendar } from '../../components/ui/MonthCalendar'
import { DeviceSessionModal } from '../../components/ui/DeviceSessionModal'
import { VideoLightbox } from '../../components/ui/VideoLightbox'
import { VideoCarousel } from '../../components/ui/VideoCarousel'
import type { VideoTutorial } from '../../components/ui/VideoCarousel'
import { MedicalTeamPanel } from './MedicalTeamPanel'
import { formatearFecha, isoArgentina } from '../../data/mockData'
import { useSession } from '../../auth/session'
import { ApiError, api } from '../../api/client'
import type { Entrenamiento, Evaluacion, Frecuencia } from '../../api/types'

type SubVista = 'resumen' | 'calendario'

const DIAS_SEMANA_CORTOS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const INTERVALO_ACTUALIZACION_FRECUENCIA_MS = 30_000

const TUTORIALES: VideoTutorial[] = [
  { id: 'nSOtWvB968U', titulo: 'Cómo usar el dispositivo' },
  { id: 'nDpKYFcJNK0', titulo: 'Tutorial 2' },
  { id: 'jNmR3BjkDug', titulo: 'Tutorial 3' },
  { id: '9sUgVwYjRTE', titulo: 'Tutorial 4' },
]

function diaDeSemana(fecha: Date): number {
  return (fecha.getDay() + 6) % 7 // 0 = lunes
}

export function PatientDashboard() {
  const [subVista, setSubVista] = useState<SubVista>('resumen')
  const [sesionAbierta, setSesionAbierta] = useState<'entrenamiento' | 'evaluacion' | null>(null)
  const [videoAbierto, setVideoAbierto] = useState<{ id: string; titulo: string } | null>(null)

  const { perfil, token } = useSession()

  const primerNombre = (perfil?.rol === 'paciente' && perfil.datos.nombre) || 'Paciente'

  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([])
  const [cargandoEntrenamientos, setCargandoEntrenamientos] = useState(true)
  const [errorEntrenamientos, setErrorEntrenamientos] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelado = false
    setCargandoEntrenamientos(true)
    setErrorEntrenamientos(null)
    api.paciente
      .entrenamientos(token)
      .then((datos) => {
        if (!cancelado) setEntrenamientos(datos)
      })
      .catch((err) => {
        if (cancelado) return
        setErrorEntrenamientos(err instanceof ApiError ? err.message : 'No pudimos cargar tus entrenamientos.')
      })
      .finally(() => {
        if (!cancelado) setCargandoEntrenamientos(false)
      })
    return () => {
      cancelado = true
    }
  }, [token])

  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [cargandoEvaluaciones, setCargandoEvaluaciones] = useState(true)
  const [errorEvaluaciones, setErrorEvaluaciones] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelado = false
    setCargandoEvaluaciones(true)
    setErrorEvaluaciones(null)
    api.paciente
      .evaluaciones(token)
      .then((datos) => {
        if (!cancelado) setEvaluaciones(datos)
      })
      .catch((err) => {
        if (cancelado) return
        setErrorEvaluaciones(err instanceof ApiError ? err.message : 'No pudimos cargar tus evaluaciones.')
      })
      .finally(() => {
        if (!cancelado) setCargandoEvaluaciones(false)
      })
    return () => {
      cancelado = true
    }
  }, [token])

  const diasConEntrenamiento = useMemo(
    () => new Set(entrenamientos.map((e) => e.fecha_hora.slice(0, 10))),
    [entrenamientos],
  )
  const diasConEvaluacion = useMemo(
    () => new Set(evaluaciones.map((e) => e.fecha_hora.slice(0, 10))),
    [evaluaciones],
  )

  const [historialFrecuencia, setHistorialFrecuencia] = useState<Frecuencia[]>([])
  const [frecuenciaCargada, setFrecuenciaCargada] = useState(false)
  const [errorFrecuencia, setErrorFrecuencia] = useState(false)

  useEffect(() => {
    let cancelado = false

    async function cargarFrecuencia() {
      if (!token) {
        if (!cancelado) {
          setHistorialFrecuencia([])
          setFrecuenciaCargada(true)
        }
        return
      }

      try {
        const datos = await api.paciente.historialFrecuencia(token)
        if (!cancelado) {
          setHistorialFrecuencia(datos)
          setErrorFrecuencia(false)
        }
      } catch {
        if (!cancelado) setErrorFrecuencia(true)
      } finally {
        if (!cancelado) setFrecuenciaCargada(true)
      }
    }

    void cargarFrecuencia()

    // Si el médico hizo el cambio en otra pestaña, se vuelve a consultar al
    // regresar al dashboard. El intervalo también mantiene el dato actualizado
    // mientras la pantalla del paciente queda abierta.
    const alVolverALaApp = () => {
      if (document.visibilityState === 'visible') void cargarFrecuencia()
    }
    window.addEventListener('focus', alVolverALaApp)
    document.addEventListener('visibilitychange', alVolverALaApp)
    const intervalo = window.setInterval(() => void cargarFrecuencia(), INTERVALO_ACTUALIZACION_FRECUENCIA_MS)

    return () => {
      cancelado = true
      window.removeEventListener('focus', alVolverALaApp)
      document.removeEventListener('visibilitychange', alVolverALaApp)
      window.clearInterval(intervalo)
    }
  }, [token])

  const historialParaCalendario = useMemo(
    () => [...historialFrecuencia].reverse().map((f) => ({ vigenteDesde: f.vigente_desde, dias: f.dias_semana })),
    [historialFrecuencia],
  )

  // La recomendación se guarda con la fecha real del servidor. Usamos la fecha
  // actual acá (y no HOY, que sólo sostiene los datos mock) para que un cambio
  // hecho hoy aparezca inmediatamente en el calendario del paciente.
  const hoy = new Date()
  const hoyIso = isoArgentina(hoy)
  const hayEntrenamientoHoy = diasVigentesEn(historialParaCalendario, hoyIso).includes(diaDeSemana(hoy))
  const esDiaDescanso = frecuenciaCargada && !errorFrecuencia && !hayEntrenamientoHoy
  const proximoEntrenamiento = useMemo(() => {
    for (let diasDesdeHoy = 1; diasDesdeHoy <= 7; diasDesdeHoy++) {
      const fecha = new Date(hoy)
      fecha.setDate(hoy.getDate() + diasDesdeHoy)
      if (diasVigentesEn(historialParaCalendario, isoArgentina(fecha)).includes(diaDeSemana(fecha))) {
        return DIAS_SEMANA[diaDeSemana(fecha)]
      }
    }
    return null
  }, [historialParaCalendario, hoyIso])

  // Racha de días consecutivos con entrenamiento, contando hacia atrás desde hoy.
  const rachaActualDias = useMemo(() => {
    let racha = 0
    const cursor = new Date(hoy)
    while (diasConEntrenamiento.has(isoArgentina(cursor))) {
      racha++
      cursor.setDate(cursor.getDate() - 1)
    }
    return racha
  }, [diasConEntrenamiento, hoyIso])

  const semana = useMemo(() => {
    const lunes = new Date(hoy)
    lunes.setHours(12, 0, 0, 0)
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))

    return Array.from({ length: 7 }, (_, indice) => {
      const fecha = new Date(lunes)
      fecha.setDate(lunes.getDate() + indice)
      const fechaIso = isoArgentina(fecha)
      const recomendado = diasVigentesEn(historialParaCalendario, fechaIso).includes(indice)
      return {
        etiqueta: DIAS_SEMANA_CORTOS[indice],
        fechaIso,
        recomendado,
        esHoy: fechaIso === hoyIso,
      }
    })
  }, [historialParaCalendario, hoyIso])

  return (
    <div className="patient-layout">
      <MedicalTeamPanel />
      <div id="contenido-principal">
      {subVista === 'resumen' && (
        <>
          <div className={['card', 'hero', esDiaDescanso ? 'hero-rest' : ''].filter(Boolean).join(' ')}>
            <div>
              {!frecuenciaCargada ? (
                <>
                  <h2>Hola {primerNombre} 🐣</h2>
                  <p>Estamos revisando tu plan de entrenamiento de hoy.</p>
                </>
              ) : errorFrecuencia ? (
                <>
                  <h2>Hola {primerNombre} 🐣</h2>
                  <p>No pudimos verificar si tenés un entrenamiento programado para hoy.</p>
                </>
              ) : hayEntrenamientoHoy ? (
                <>
                  <h2>Hola {primerNombre}, ¿lista para hoy? 🐣</h2>
                  <p>
                    Tu ejercicio de hoy es una sesión de entrenamiento inspiratorio. Llevás {rachaActualDias} día
                    {rachaActualDias === 1 ? '' : 's'} seguidos, ¡no cortes la racha!
                  </p>
                </>
              ) : (
                <>
                  <h2>¡Día de descanso! 🐣</h2>
                  <p>
                    Hoy no está programado ningún entrenamiento.
                    {proximoEntrenamiento
                      ? ` Volvé el próximo ${proximoEntrenamiento} para continuar con el entrenamiento.`
                      : ' Tu médico todavía no programó el próximo entrenamiento.'}
                  </p>
                </>
              )}
            </div>
            {frecuenciaCargada && !errorFrecuencia && hayEntrenamientoHoy && (
              <button className="btn btn-light" onClick={() => setSesionAbierta('entrenamiento')}>
                Iniciar sesión de hoy
              </button>
            )}
            {esDiaDescanso && (
              <img
                className="hero-chill"
                src="/bronquito-chill.png"
                alt="Bronquito descansando"
              />
            )}
          </div>

          <section className="block">
            <div className="block-title">
              <h3>Esta semana</h3>
              <button className="link" onClick={() => setSubVista('calendario')}>
                Ver calendario completo
              </button>
            </div>
            <div className="card">
              <div className="streak">
                {semana.map((dia) => (
                  <div
                    key={dia.fechaIso}
                    className={['day', dia.recomendado ? 'done' : '', dia.esHoy ? 'today' : ''].filter(Boolean).join(' ')}
                    title={dia.recomendado ? 'Día recomendado para entrenar' : 'Sin entrenamiento recomendado'}
                  >
                    <div className="day-name">{dia.etiqueta}</div>
                    <div className="day-mark">{dia.recomendado ? '✓' : '—'}</div>
                  </div>
                ))}
              </div>
              <p className="field-hint">Los checks indican los días que recomendó tu médico para entrenar.</p>
            </div>
          </section>

          <section className="block">
            <div className="block-title">
              <h3>Tutoriales</h3>
            </div>
            <VideoCarousel videos={TUTORIALES} onSeleccionar={(video) => setVideoAbierto(video)} />
          </section>

          <section className="block">
            <div className="block-title">
              <h3>Evaluaciones</h3>
            </div>
            <div className="card">
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
                {cargandoEvaluaciones
                  ? 'Cargando tu última evaluación…'
                  : errorEvaluaciones
                    ? errorEvaluaciones
                    : `Tu última evaluación fue el ${evaluaciones[0] ? formatearFecha(evaluaciones[0].fecha_hora) : '—'}.`}{' '}
                La evaluación mide qué tan fuerte y eficiente es tu respiración para ajustar la resistencia del
                dispositivo.
              </p>
              <button className="btn btn-outline btn-sm" onClick={() => setSesionAbierta('evaluacion')}>
                Iniciar evaluación
              </button>
            </div>
          </section>
        </>
      )}

      {subVista === 'calendario' && (
        <div className="card">
          <div className="block-title">
            <h3>Calendario completo</h3>
            <button className="link" onClick={() => setSubVista('resumen')}>
              ← Volver al resumen
            </button>
          </div>
          <MonthCalendar
            anio={hoy.getFullYear()}
            mes={hoy.getMonth()}
            diasConEntrenamiento={diasConEntrenamiento}
            diasConEvaluacion={diasConEvaluacion}
            historialRecomendaciones={historialParaCalendario}
            hoyIso={hoyIso}
          />
          <p className="invite-note">
            Los días con ✓ son los recomendados por tu médico. Usá las flechas para consultar cualquier mes.
          </p>
        </div>
      )}

      {sesionAbierta && (
        <DeviceSessionModal tipo={sesionAbierta} onClose={() => setSesionAbierta(null)} />
      )}
      {videoAbierto && (
        <VideoLightbox
          videoId={videoAbierto.id}
          titulo={videoAbierto.titulo}
          onClose={() => setVideoAbierto(null)}
        />
      )}
      </div>
    </div>
  )
}
