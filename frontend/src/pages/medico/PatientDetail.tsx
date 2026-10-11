import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Paciente } from '../../types'
import type { Entrenamiento, Evaluacion, Frecuencia, Rutina } from '../../api/types'
import { ApiError, api } from '../../api/client'
import { useSession } from '../../auth/session'
import type { SerieTendencia } from '../../components/ui/TrendChartCarousel'
import { TrendChartCarousel } from '../../components/ui/TrendChartCarousel'
import { MonthCalendar } from '../../components/ui/MonthCalendar'
import { Modal } from '../../components/ui/Modal'
import { TrashIcon } from '../../components/ui/TrashIcon'
import { FrequencyModal } from './FrequencyModal'
import { formatearFecha, isoArgentina } from '../../data/mockData'

type Tab = 'evaluaciones' | 'entrenamiento' | 'calendario'

interface PatientDetailProps {
  paciente: Paciente
  onDesvincular: () => Promise<void>
}

export function PatientDetail({ paciente, onDesvincular }: PatientDetailProps) {
  const { token } = useSession()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('evaluaciones')
  const [historialFrecuencia, setHistorialFrecuencia] = useState<Frecuencia[]>([])
  const [modalFrecuencia, setModalFrecuencia] = useState(false)
  const [confirmarDesvinculo, setConfirmarDesvinculo] = useState(false)
  const [desvinculando, setDesvinculando] = useState(false)
  const [errorDesvinculo, setErrorDesvinculo] = useState<string | null>(null)

  async function confirmarYDesvincular() {
    setDesvinculando(true)
    setErrorDesvinculo(null)
    try {
      await onDesvincular()
    } catch (err) {
      setErrorDesvinculo(err instanceof Error ? err.message : 'No se pudo desvincular al paciente.')
      setDesvinculando(false)
    }
  }

  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [cargandoEvaluaciones, setCargandoEvaluaciones] = useState(true)
  const [errorEvaluaciones, setErrorEvaluaciones] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelado = false
    setCargandoEvaluaciones(true)
    setErrorEvaluaciones(null)
    api.medico
      .evaluacionesDe(token, Number(paciente.id))
      .then((datos) => {
        if (!cancelado) setEvaluaciones(datos)
      })
      .catch((err) => {
        if (cancelado) return
        setErrorEvaluaciones(err instanceof ApiError ? err.message : 'No pudimos cargar las evaluaciones.')
      })
      .finally(() => {
        if (!cancelado) setCargandoEvaluaciones(false)
      })
    return () => {
      cancelado = true
    }
  }, [token, paciente.id])

  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([])
  const [cargandoEntrenamientos, setCargandoEntrenamientos] = useState(true)
  const [errorEntrenamientos, setErrorEntrenamientos] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelado = false
    setCargandoEntrenamientos(true)
    setErrorEntrenamientos(null)
    api.medico
      .entrenamientosDe(token, Number(paciente.id))
      .then((datos) => {
        if (!cancelado) setEntrenamientos(datos)
      })
      .catch((err) => {
        if (cancelado) return
        setErrorEntrenamientos(err instanceof ApiError ? err.message : 'No pudimos cargar los entrenamientos.')
      })
      .finally(() => {
        if (!cancelado) setCargandoEntrenamientos(false)
      })
    return () => {
      cancelado = true
    }
  }, [token, paciente.id])

  const [rutina, setRutina] = useState<Rutina | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelado = false
    api.medico
      .rutinaDe(token, Number(paciente.id))
      .then((datos) => {
        if (!cancelado) setRutina(datos)
      })
      .catch(() => {
        // Si falla, el tag de resistencia queda como "sin definir".
      })
    return () => {
      cancelado = true
    }
  }, [token, paciente.id])

  useEffect(() => {
    if (!token) return
    let cancelado = false
    api.medico
      .historialFrecuencia(token, Number(paciente.id))
      .then((datos) => {
        if (!cancelado) setHistorialFrecuencia(datos)
      })
      .catch(() => {
        // Si falla, el calendario simplemente no muestra días recomendados.
      })
    return () => {
      cancelado = true
    }
  }, [token, paciente.id])

  // Dos evaluaciones son la misma sesión de consultorio si comparten el
  // `fecha_hora` exacto (se captura una sola vez al arrancar la sesión) —
  // se agrupan en una sola fila de la tabla.
  const sesiones = useMemo(() => {
    const porFecha = new Map<string, { fecha_hora: string; espirometria?: Evaluacion; pim?: Evaluacion }>()
    for (const e of evaluaciones) {
      const sesion = porFecha.get(e.fecha_hora) ?? { fecha_hora: e.fecha_hora }
      if (e.tipo === 'ESPIROMETRIA') sesion.espirometria = e
      else sesion.pim = e
      porFecha.set(e.fecha_hora, sesion)
    }
    return [...porFecha.values()]
  }, [evaluaciones])

  const ultimaEvaluacion = evaluaciones[0]
  const ultimoEntrenamiento = entrenamientos[0]
  const hoy = new Date()
  const hoyIso = isoArgentina(hoy)

  // La API ya devuelve el historial más reciente primero; para desempatar
  // cambios del mismo día lo invertimos (más viejo primero, ver MonthCalendar).
  const historialParaCalendario = useMemo(
    () =>
      [...historialFrecuencia].reverse().map((f) => ({ vigenteDesde: f.vigente_desde, dias: f.dias_semana })),
    [historialFrecuencia],
  )

  // La entrada vigente hoy es siempre la primera del historial (la API lo
  // ordena por vigente_desde/creado_en descendente, y el servidor siempre
  // marca vigente_desde = hoy al crear una nueva).
  const frecuenciaVigente = historialFrecuencia[0]

  const diasConEntrenamiento = useMemo(
    () => new Set(entrenamientos.map((e) => e.fecha_hora.slice(0, 10))),
    [entrenamientos],
  )

  // Una evaluación por día (si hay espirometría y PIM del mismo día, se prioriza
  // la espirometría) — para saber a qué evaluación llevar al clickear el banderín.
  const evaluacionPorFecha = useMemo(() => {
    const mapa = new Map<string, Evaluacion>()
    for (const e of evaluaciones) {
      const iso = e.fecha_hora.slice(0, 10)
      const actual = mapa.get(iso)
      if (!actual || (actual.tipo !== 'ESPIROMETRIA' && e.tipo === 'ESPIROMETRIA')) {
        mapa.set(iso, e)
      }
    }
    return mapa
  }, [evaluaciones])

  const PALETA_SERIES = ['#F0459A', '#2FA7A0', '#7C5CF0', '#E0A030', '#3B82F6', '#D1234F', '#1F9D64', '#B9820C']

  /** Arma la lista de SerieTendencia para un carrusel a partir de la config de cada variable. */
  function construirSeries<T>(
    datos: T[],
    fechaDe: (item: T) => string,
    variables: [nombreCorto: string, etiqueta: string, etiquetaEje: string, unidad: string, valorDe: (item: T) => number | null | undefined][],
  ): SerieTendencia[] {
    return variables.map(([nombreCorto, etiqueta, etiquetaEje, unidad, valorDe], i) => {
      const puntos = datos
        .map((item) => ({ valor: valorDe(item), fecha: fechaDe(item) }))
        .filter((p): p is { valor: number; fecha: string } => p.valor != null)
      return {
        nombreCorto,
        titulo: `Evolución de ${etiqueta}`,
        etiquetaEje,
        unidad,
        color: PALETA_SERIES[i % PALETA_SERIES.length],
        valores: puntos.map((p) => p.valor),
        fechas: puntos.map((p) => p.fecha),
      }
    })
  }

  const evaluacionesCronologicas = [...evaluaciones].reverse()
  const seriesEvaluaciones = construirSeries(evaluacionesCronologicas, (e) => formatearFecha(e.fecha_hora), [
    ['PIM', 'PIM', 'PIM (cmH₂O)', 'cmH₂O', (e) => e.pim],
    ['FVC', 'FVC', 'FVC (L)', 'L', (e) => e.fvc],
    ['FEV1', 'FEV1', 'FEV1 (L)', 'L', (e) => e.fev1],
    ['PEF', 'PEF', 'PEF (L/min)', 'L/min', (e) => e.pef],
    ['FIVC', 'FIVC', 'FIVC (L)', 'L', (e) => e.fivc],
    ['FIV1', 'FIV1', 'FIV1 (L)', 'L', (e) => e.fiv1],
  ])

  const entrenamientosCronologicos = [...entrenamientos].reverse()
  const seriesEntrenamiento = construirSeries(entrenamientosCronologicos, (e) => formatearFecha(e.fecha_hora), [
    ['Resistencia', 'resistencia programada', 'Resistencia', '', (e) => e.resistencia_programada],
    ['Repeticiones', 'repeticiones programadas', 'Repeticiones', '', (e) => e.repeticiones_programadas],
    ['Presión máx.', 'presión máxima', 'Presión máx. (cmH₂O)', 'cmH₂O', (e) => e.presion_max],
    ['Presión prom.', 'presión promedio', 'Presión prom. (cmH₂O)', 'cmH₂O', (e) => e.presion_promedio],
    ['Índice de fatiga', 'índice de fatiga', 'Índice de fatiga (%)', '%', (e) => e.indice_fatiga],
    ['Potencia', 'potencia inspiratoria', 'Potencia insp. (W)', 'W', (e) => e.potencia_insp],
    ['Trabajo', 'trabajo', 'Trabajo (J)', 'J', (e) => e.trabajo],
    ['Duty cycle', 'duty cycle', 'Duty cycle (%)', '%', (e) => e.duty_cycle],
    ['Tiempo entre reps', 'tiempo entre repeticiones', 'Tiempo entre reps (s)', 's', (e) => e.tiempo_entre_reps],
    ['Volumen total', 'volumen total', 'Volumen total (L)', 'L', (e) => e.volumen_total],
  ])

  const valoresPim = evaluacionesCronologicas
    .map((e) => e.pim)
    .filter((v): v is number => v != null)
  const pimInicial = valoresPim[0]
  const pimActual = valoresPim[valoresPim.length - 1]

  return (
    <div className="card">
      <div className="detail-title-row">
        <h2>{paciente.nombre}</h2>
        <button
          className="btn-icon btn-icon-pink"
          onClick={() => setConfirmarDesvinculo(true)}
          aria-label="Desvincular paciente"
          title="Desvincular paciente"
        >
          <TrashIcon className="icon-16" />
        </button>
      </div>

      <div className="detail-header">
        <div className="detail-id">
          <div className="p-sub">
            {paciente.edad} años
          </div>
          <div className="tags">
            <span className="tag">Enfermedades: {paciente.enfermedades ?? 'sin informar'}</span>
            <span className="tag">PIM inicial: {pimInicial != null ? `${pimInicial} cmH₂O` : 'sin definir'}</span>
            <span className="tag">PIM actual: {pimActual != null ? `${pimActual} cmH₂O` : 'sin definir'}</span>
            <span className="tag">
              Resistencia actual: {rutina ? `Nivel ${rutina.resistencia_activa}` : 'sin definir'}
            </span>
            <button
              className="tag tag-clickable"
              onClick={() => setModalFrecuencia(true)}
              title="Modificar frecuencia"
            >
              Frecuencia: {frecuenciaVigente ? `${frecuenciaVigente.sesiones_por_semana}x/semana` : 'sin definir'}
            </button>
          </div>
        </div>
      </div>

      <div className="tabs-row">
        <div className="tabs" role="tablist" aria-label="Detalle clínico del paciente">
          <button className={`tab ${tab === 'evaluaciones' ? 'active' : ''}`} role="tab" aria-selected={tab === 'evaluaciones'} onClick={() => setTab('evaluaciones')}>
            Evaluaciones
          </button>
          <button className={`tab ${tab === 'entrenamiento' ? 'active' : ''}`} role="tab" aria-selected={tab === 'entrenamiento'} onClick={() => setTab('entrenamiento')}>
            Entrenamiento
          </button>
          <button className={`tab ${tab === 'calendario' ? 'active' : ''}`} role="tab" aria-selected={tab === 'calendario'} onClick={() => setTab('calendario')}>
            Calendario
          </button>
        </div>
        {tab === 'calendario' && (
          <button className="btn btn-outline btn-sm" onClick={() => setModalFrecuencia(true)}>
            Modificar frecuencia
          </button>
        )}
      </div>

      {tab === 'evaluaciones' && (
        <div role="tabpanel">
          {cargandoEvaluaciones ? (
            <p className="empty-state">Cargando evaluaciones…</p>
          ) : errorEvaluaciones ? (
            <p className="empty-state">{errorEvaluaciones}</p>
          ) : (
            <>
              {ultimaEvaluacion ? (
                <TrendChartCarousel series={seriesEvaluaciones} />
              ) : (
                <p className="empty-state">Todavía no hay evaluaciones registradas.</p>
              )}

              {evaluaciones.length > 0 && (
                <div className="table-wrap mt-16">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>FVC (L)</th>
                        <th>FEV1 (L)</th>
                        <th>PEF (L/min)</th>
                        <th>FIVC (L)</th>
                        <th>FIV1 (L)</th>
                        <th>PIM (cmH₂O)</th>
                        <th>Señales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sesiones.map((sesion) => (
                        <tr key={sesion.fecha_hora}>
                          <td>{formatearFecha(sesion.fecha_hora)}</td>
                          <td>{sesion.espirometria?.fvc ?? '—'}</td>
                          <td>{sesion.espirometria?.fev1 ?? '—'}</td>
                          <td>{sesion.espirometria?.pef ?? '—'}</td>
                          <td>{sesion.espirometria?.fivc ?? '—'}</td>
                          <td>{sesion.espirometria?.fiv1 ?? '—'}</td>
                          <td>{sesion.pim?.pim ?? '—'}</td>
                          <td>
                            <div className="table-actions">
                              {sesion.espirometria && (
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() =>
                                    navigate(`/medico/pacientes/${paciente.id}/evaluaciones/${sesion.espirometria!.id_evaluacion}`)
                                  }
                                >
                                  {sesion.pim ? 'Espirometría' : 'Inspeccionar'}
                                </button>
                              )}
                              {sesion.pim && (
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() =>
                                    navigate(`/medico/pacientes/${paciente.id}/evaluaciones/${sesion.pim!.id_evaluacion}`)
                                  }
                                >
                                  {sesion.espirometria ? 'PIM' : 'Inspeccionar'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'entrenamiento' && (
        <div role="tabpanel">
          {cargandoEntrenamientos ? (
            <p className="empty-state">Cargando entrenamientos…</p>
          ) : errorEntrenamientos ? (
            <p className="empty-state">{errorEntrenamientos}</p>
          ) : (
            <>
              {ultimoEntrenamiento ? (
                <TrendChartCarousel series={seriesEntrenamiento} />
              ) : (
                <p className="empty-state">Todavía no hay sesiones de entrenamiento registradas.</p>
              )}

              {entrenamientos.length > 0 && (
                <div className="table-wrap mt-16">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Resistencia prog.</th>
                        <th>Reps. prog.</th>
                        <th>Presión máx. (cmH₂O)</th>
                        <th>Presión prom. (cmH₂O)</th>
                        <th>Índice fatiga (%)</th>
                        <th>Potencia (W)</th>
                        <th>Trabajo (J)</th>
                        <th>Duty cycle (%)</th>
                        <th>Tiempo entre reps (s)</th>
                        <th>Volumen total (L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entrenamientos.map((e) => (
                        <tr key={e.id_entrenamiento}>
                          <td>{formatearFecha(e.fecha_hora)}</td>
                          <td>{e.resistencia_programada}</td>
                          <td>{e.repeticiones_programadas}</td>
                          <td>{e.presion_max}</td>
                          <td>{e.presion_promedio}</td>
                          <td>{e.indice_fatiga}</td>
                          <td>{e.potencia_insp}</td>
                          <td>{e.trabajo}</td>
                          <td>{e.duty_cycle}</td>
                          <td>{e.tiempo_entre_reps}</td>
                          <td>{e.volumen_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'calendario' && (
        <div role="tabpanel">
          <MonthCalendar
            anio={hoy.getFullYear()}
            mes={hoy.getMonth()}
            diasConEvaluacion={new Set(evaluacionPorFecha.keys())}
            diasConEntrenamiento={diasConEntrenamiento}
            historialRecomendaciones={historialParaCalendario}
            hoyIso={hoyIso}
            onClickEvaluacion={(iso) => {
              const e = evaluacionPorFecha.get(iso)
              if (e) navigate(`/medico/pacientes/${paciente.id}/evaluaciones/${e.id_evaluacion}`)
            }}
          />
          <p className="invite-note">
            Los días marcados en rosa son los recomendados para entrenar. La cinta azul indica que
            hubo una evaluación ese día (clickeala para verla); la cinta rosa, que hubo un
            entrenamiento.{' '}
            {frecuenciaVigente
              ? `La frecuencia recomendada actual es de ${frecuenciaVigente.sesiones_por_semana} sesiones por semana; `
              : 'Todavía no hay una frecuencia definida; '}
            podés ajustarla con "Modificar frecuencia".
          </p>
        </div>
      )}

      {modalFrecuencia && (
        <FrequencyModal
          frecuenciaActual={frecuenciaVigente?.sesiones_por_semana ?? 3}
          diasActuales={frecuenciaVigente?.dias_semana ?? []}
          nombrePaciente={paciente.nombre}
          onClose={() => setModalFrecuencia(false)}
          onGuardar={async (nuevaFrecuencia, nuevosDias) => {
            const creada = await api.medico.crearFrecuencia(token!, Number(paciente.id), {
              sesiones_por_semana: nuevaFrecuencia,
              dias_semana: nuevosDias,
            })
            setHistorialFrecuencia((actual) => [creada, ...actual])
          }}
        />
      )}

      {confirmarDesvinculo && (
        <Modal
          titulo="Desvincular paciente"
          onClose={() => setConfirmarDesvinculo(false)}
          acciones={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setConfirmarDesvinculo(false)}
                disabled={desvinculando}
              >
                Cancelar
              </button>
              <button className="btn btn-teal" onClick={confirmarYDesvincular} disabled={desvinculando}>
                {desvinculando ? 'Desvinculando…' : 'Sí, desvincular'}
              </button>
            </>
          }
        >
          <p>
            ¿Desea desvincular a <strong>{paciente.nombre}</strong>? Perderá el acceso a su información clínica.
            Podrá volver a vincularla en cualquier momento utilizando su nombre de usuario y PIN.
          </p>
          {errorDesvinculo && <div className="auth-alert error">{errorDesvinculo}</div>}
        </Modal>
      )}
    </div>
  )
}
