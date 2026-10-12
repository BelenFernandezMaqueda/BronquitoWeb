import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Evaluacion, EvaluacionMuestras } from '../../api/types'
import { ApiError, api } from '../../api/client'
import { useSession } from '../../auth/session'
import { describirPuntoXY, marcadoresDe } from '../../anotaciones/notas'
import { claveGraficoSenal, comentariosDeSesion, useAnotaciones } from '../../anotaciones/useAnotaciones'
import { SignalXYChart } from '../../components/ui/SignalXYChart'
import { TIPO_CSV, TIPO_PDF, elegirDestino } from '../../exportar/archivos'
import { formatearFecha } from '../../data/mockData'
import { GRAFICOS_POR_TIPO, csvDeSenales, fechaParaArchivo } from './graficosSenales'
import type { PuntoAnotado } from './NotasSesionPanel'
import { NotasSesionPanel } from './NotasSesionPanel'

interface SignalViewerProps {
  idPaciente: number
  evaluacion: Evaluacion
  /** Todas las evaluaciones de la misma sesión (incluida `evaluacion`), para el PDF de la sesión. */
  evaluacionesDeLaSesion: Evaluacion[]
  onVolver: () => void
  /** Busca (o avisa que no existe) la señal del otro tipo en la misma fecha. */
  onCambiarTipo: () => void
  /** Mensaje a mostrar cuando `onCambiarTipo` no encontró una señal del otro tipo. */
  avisoTipo: string | null
  onAnterior?: () => void
  onSiguiente?: () => void
  onUltima?: () => void
}

/** Visor de las señales crudas de una evaluación puntual, con las notas de la sesión al costado. */
export function SignalViewer({
  idPaciente,
  evaluacion,
  evaluacionesDeLaSesion,
  onVolver,
  onCambiarTipo,
  avisoTipo,
  onAnterior,
  onSiguiente,
  onUltima,
}: SignalViewerProps) {
  const { token, perfil } = useSession()
  const [muestras, setMuestras] = useState<EvaluacionMuestras | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [altoGrilla, setAltoGrilla] = useState(420)
  const notasPaciente = useAnotaciones(idPaciente)
  const [enfoque, setEnfoque] = useState<{ grafico: string; punto: string } | null>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [errorExportacion, setErrorExportacion] = useState<string | null>(null)

  const sesion = evaluacion.fecha_hora
  const graficos = GRAFICOS_POR_TIPO[evaluacion.tipo]

  useEffect(() => {
    if (!token) return
    let cancelado = false
    setCargando(true)
    setError(null)
    api.medico
      .muestrasDeEvaluacion(token, idPaciente, evaluacion.id_evaluacion)
      .then((datos) => {
        if (!cancelado) setMuestras(datos)
      })
      .catch((err) => {
        if (cancelado) return
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar la curva de esta evaluación.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [token, idPaciente, evaluacion.id_evaluacion])

  useEffect(() => {
    setEnfoque(null)
    setErrorExportacion(null)
  }, [evaluacion.id_evaluacion])

  // Calcula cuánto espacio vertical queda libre debajo de la grilla para que los
  // cuatro gráficos entren sin scrollear, sin importar el alto de la ventana.
  useLayoutEffect(() => {
    function recalcular() {
      const el = gridRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      // deja lugar al padding inferior de main (60px), más un margen de seguridad.
      const disponible = window.innerHeight - top - 70
      setAltoGrilla(Math.max(disponible, 320))
    }
    recalcular()
    window.addEventListener('resize', recalcular)
    return () => window.removeEventListener('resize', recalcular)
  }, [muestras, errorExportacion])

  /** Las notas de uno de los gráficos de esta evaluación. */
  const notasDeGrafico = (idGrafico: string) => {
    const clave = claveGraficoSenal(evaluacion.id_evaluacion, idGrafico)
    return notasPaciente.anotaciones.filter((a) => a.grafico === clave)
  }

  // Los puntos anotados de los gráficos que se están viendo, para listarlos en el panel.
  const puntosAnotados: PuntoAnotado[] = muestras
    ? graficos.flatMap((def) => {
        const clave = claveGraficoSenal(evaluacion.id_evaluacion, def.id)
        const x = muestras[def.x]
        const y = muestras[def.y]
        return marcadoresDe(
          x.map((_, i) => String(i)),
          notasDeGrafico(def.id),
        ).map((m) => {
          const { principal, secundario } = describirPuntoXY(def.etiquetaX, def.etiquetaY, x[m.indice], y[m.indice])
          return {
            grafico: clave,
            punto: m.punto,
            numero: m.numero,
            tituloGrafico: def.titulo,
            color: def.color,
            descripcion: `${principal} · ${secundario}`,
            notas: m.notas,
          }
        })
      })
    : []

  /** Un solo CSV con los puntos de todos los gráficos que se están viendo. */
  async function descargarCsv() {
    if (!muestras) return
    setErrorExportacion(null)
    const tipo = evaluacion.tipo === 'ESPIROMETRIA' ? 'espirometria' : 'pim'
    const destino = await elegirDestino(`${fechaParaArchivo(sesion)}_${tipo}.csv`, TIPO_CSV)
    if (!destino) return
    try {
      const contenido = csvDeSenales(graficos, muestras, (def) => notasDeGrafico(def.id))
      await destino.guardar(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
    } catch {
      setErrorExportacion('No se pudo guardar el CSV.')
    }
  }

  async function descargarPdf() {
    if (!token) return
    setErrorExportacion(null)
    // Primero el diálogo de "Guardar como": el navegador sólo lo deja abrir justo después del click.
    const destino = await elegirDestino(`${fechaParaArchivo(sesion)}.pdf`, TIPO_PDF)
    if (!destino) return
    setGenerandoPdf(true)
    try {
      const [pacientes, evaluaciones] = await Promise.all([
        api.medico.misPacientes(token),
        Promise.all(
          evaluacionesDeLaSesion.map(async (e) => ({
            evaluacion: e,
            muestras:
              e.id_evaluacion === evaluacion.id_evaluacion && muestras
                ? muestras
                : await api.medico.muestrasDeEvaluacion(token, idPaciente, e.id_evaluacion).catch(() => null),
          })),
        ),
      ])
      const paciente = pacientes.find((p) => p.id_paciente === idPaciente)
      if (!paciente) throw new Error('No encontramos los datos del paciente.')
      const { generarPdfSesion } = await import('./pdfSesion')
      const pdf = await generarPdfSesion({
        paciente,
        medico: perfil?.rol === 'medico' ? `${perfil.datos.nombre} ${perfil.datos.apellido}` : '',
        sesion,
        evaluaciones,
        anotaciones: notasPaciente.anotaciones,
      })
      await destino.guardar(pdf)
    } catch (err) {
      setErrorExportacion(err instanceof Error ? err.message : 'No se pudo generar el PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div>
      <div className="signal-viewer-header">
        <button className="btn btn-red btn-sm" onClick={onVolver}>
          ← Volver
        </button>
        <button className="btn btn-outline btn-sm" onClick={onAnterior} disabled={!onAnterior} title="Evaluación anterior">
          ◀ Anterior
        </button>
        <button className="btn btn-outline btn-sm" onClick={onSiguiente} disabled={!onSiguiente} title="Evaluación siguiente">
          Siguiente ▶
        </button>
        <button className="btn btn-outline btn-sm" onClick={onUltima} disabled={!onUltima} title="Ir a la última evaluación">
          Ir a última evaluación
        </button>

        <h3>
          <button className="signal-tipo-toggle" onClick={onCambiarTipo} title="Ver la otra señal de esta fecha">
            {evaluacion.tipo === 'ESPIROMETRIA' ? 'Espirometría' : 'PIM'}
          </button>{' '}
          · {formatearFecha(evaluacion.fecha_hora)}
        </h3>

        <div className="signal-header-acciones">
          <button
            className="btn btn-outline btn-sm"
            onClick={descargarCsv}
            disabled={!muestras || notasPaciente.cargando}
            title="Un CSV con los puntos de todos los gráficos de esta evaluación y sus notas"
          >
            Descargar CSV
          </button>
          <button
            className="btn btn-teal btn-sm"
            onClick={descargarPdf}
            disabled={generandoPdf || notasPaciente.cargando}
            title="PDF con los datos del paciente, las señales de la sesión y todas sus notas"
          >
            {generandoPdf ? 'Generando PDF…' : 'Descargar PDF de la sesión'}
          </button>
        </div>
      </div>

      {avisoTipo && <p className="empty-state mt-16">{avisoTipo}</p>}
      {errorExportacion && <div className="auth-alert error">{errorExportacion}</div>}

      {cargando ? (
        <p className="empty-state">Cargando curva…</p>
      ) : error ? (
        <p className="empty-state">{error}</p>
      ) : !muestras ? null : (
        <div className="signal-layout">
          <div
            ref={gridRef}
            className={`grid cols-2 signal-grid ${graficos.length <= 2 ? 'signal-grid-rows-1' : ''}`}
            style={{ height: altoGrilla }}
          >
            {graficos.map((def) => {
              const clave = claveGraficoSenal(evaluacion.id_evaluacion, def.id)
              return (
                <SignalXYChart
                  key={def.id}
                  x={muestras[def.x]}
                  y={muestras[def.y]}
                  etiquetaX={def.etiquetaX}
                  etiquetaY={def.etiquetaY}
                  caption={def.titulo}
                  color={def.color}
                  anotaciones={notasPaciente.paraGrafico(clave, {
                    sesion,
                    enfocar: enfoque?.grafico === clave ? enfoque : null,
                  })}
                />
              )
            })}
          </div>

          <NotasSesionPanel
            style={{ maxHeight: altoGrilla }}
            comentarios={comentariosDeSesion(notasPaciente.anotaciones, sesion)}
            puntosAnotados={puntosAnotados}
            idMedicoActual={notasPaciente.idMedicoActual}
            error={notasPaciente.error}
            onComentar={(texto) => notasPaciente.crear({ texto, sesion })}
            onEditar={notasPaciente.editar}
            onBorrar={notasPaciente.borrar}
            onIrAPunto={(grafico, punto) => setEnfoque({ grafico, punto })}
          />
        </div>
      )}
    </div>
  )
}
