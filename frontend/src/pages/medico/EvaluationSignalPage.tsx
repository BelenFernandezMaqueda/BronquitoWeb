import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Evaluacion } from '../../api/types'
import { ApiError, api } from '../../api/client'
import { useSession } from '../../auth/session'
import { SignalViewer } from './SignalViewer'

/**
 * Dos evaluaciones son de la "misma sesión" si comparten el `fecha_hora`
 * exacto — se captura una sola vez al arrancar la sesión y se reutiliza para
 * la espirometría y el PIM, así se pueden distinguir sesiones distintas del
 * mismo día.
 */
function mismaSesion(a: string, b: string): boolean {
  return a === b
}

/**
 * Página dedicada al visor de señales, sin la ficha del paciente ni el
 * listado para elegirlo al costado — pensada para crecer con más
 * herramientas de inspección más adelante.
 */
export function EvaluationSignalPage() {
  const { idPaciente, idEvaluacion } = useParams()
  const navigate = useNavigate()
  const { token } = useSession()
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avisoTipo, setAvisoTipo] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !idPaciente) return
    let cancelado = false
    setCargando(true)
    setError(null)
    api.medico
      .evaluacionesDe(token, Number(idPaciente))
      .then((datos) => {
        if (!cancelado) setEvaluaciones(datos)
      })
      .catch((err) => {
        if (cancelado) return
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar las evaluaciones.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [token, idPaciente])

  const evaluacion = evaluaciones.find((e) => e.id_evaluacion === Number(idEvaluacion)) ?? null

  // Cada vez que cambiamos de evaluación (por navegación), descartamos el aviso anterior.
  useEffect(() => {
    setAvisoTipo(null)
  }, [idEvaluacion])

  const { anterior, siguiente, ultima } = useMemo(() => {
    if (!evaluacion) return { anterior: null, siguiente: null, ultima: null }
    const delMismoTipo = evaluaciones
      .filter((e) => e.tipo === evaluacion.tipo)
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
    const indice = delMismoTipo.findIndex((e) => e.id_evaluacion === evaluacion.id_evaluacion)
    return {
      anterior: indice > 0 ? delMismoTipo[indice - 1] : null,
      siguiente: indice >= 0 && indice < delMismoTipo.length - 1 ? delMismoTipo[indice + 1] : null,
      ultima:
        delMismoTipo.length > 0 && delMismoTipo[delMismoTipo.length - 1].id_evaluacion !== evaluacion.id_evaluacion
          ? delMismoTipo[delMismoTipo.length - 1]
          : null,
    }
  }, [evaluaciones, evaluacion])

  // Espirometría primero y PIM después, el mismo orden en que salen en el PDF de la sesión.
  const evaluacionesDeLaSesion = useMemo(
    () =>
      evaluacion
        ? evaluaciones
            .filter((e) => mismaSesion(e.fecha_hora, evaluacion.fecha_hora))
            .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'ESPIROMETRIA' ? -1 : 1))
        : [],
    [evaluaciones, evaluacion],
  )

  function irA(destino: Evaluacion) {
    navigate(`/medico/pacientes/${idPaciente}/evaluaciones/${destino.id_evaluacion}`)
  }

  function cambiarTipo() {
    if (!evaluacion) return
    const otroTipo = evaluacion.tipo === 'ESPIROMETRIA' ? 'PIM_PEM' : 'ESPIROMETRIA'
    const par = evaluaciones.find((e) => e.tipo === otroTipo && mismaSesion(e.fecha_hora, evaluacion.fecha_hora))
    if (par) {
      irA(par)
    } else {
      setAvisoTipo(`No hay señal de ${otroTipo === 'ESPIROMETRIA' ? 'espirometría' : 'PIM'} en esta fecha.`)
    }
  }

  if (cargando) return <p className="empty-state">Cargando evaluación…</p>
  if (error || !evaluacion) return <p className="empty-state">{error ?? 'No encontramos esa evaluación.'}</p>

  return (
    <SignalViewer
      idPaciente={Number(idPaciente)}
      evaluacion={evaluacion}
      evaluacionesDeLaSesion={evaluacionesDeLaSesion}
      onVolver={() => navigate('/')}
      onCambiarTipo={cambiarTipo}
      avisoTipo={avisoTipo}
      onAnterior={anterior ? () => irA(anterior) : undefined}
      onSiguiente={siguiente ? () => irA(siguiente) : undefined}
      onUltima={ultima ? () => irA(ultima) : undefined}
    />
  )
}
