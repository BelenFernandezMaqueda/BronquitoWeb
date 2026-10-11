import { useCallback, useEffect, useState } from 'react'
import type { Anotacion, AnotacionCrearBody } from '../api/types'
import { ApiError, api } from '../api/client'
import { useSession } from '../auth/session'
import type { AnotacionesGrafico } from '../components/ui/ChartInteractivo'

/*
 * Claves con las que se guardan las notas de cada gráfico. La API no las
 * interpreta: un gráfico nuevo sólo necesita una clave nueva acá.
 *   - Señal cruda de una evaluación:  "evaluacion/<id_evaluacion>/<grafico>"
 *     (el punto es el índice de la muestra).
 *   - Evolución en el tiempo:         "evolucion/<evaluaciones|entrenamientos>/<variable>"
 *     (el punto es el id de la evaluación o del entrenamiento).
 *   - Comentario general de una sesión: sin gráfico ni punto, con `sesion`.
 */

export function claveGraficoSenal(idEvaluacion: number, idGrafico: string): string {
  return `evaluacion/${idEvaluacion}/${idGrafico}`
}

export function claveGraficoEvolucion(grupo: 'evaluaciones' | 'entrenamientos', variable: string): string {
  return `evolucion/${grupo}/${variable}`
}

/** Comentarios generales (no atados a un gráfico) de una sesión. */
export function comentariosDeSesion(anotaciones: Anotacion[], sesion: string): Anotacion[] {
  return anotaciones.filter((a) => a.grafico == null && a.sesion === sesion)
}

/** Notas de un paciente: las carga de la API y las mantiene al día al crear, editar o borrar. */
export function useAnotaciones(idPaciente: number) {
  const { token, perfil } = useSession()
  const [anotaciones, setAnotaciones] = useState<Anotacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelado = false
    setAnotaciones([])
    setCargando(true)
    setError(null)
    api.medico
      .anotacionesDe(token, idPaciente)
      .then((datos) => {
        if (!cancelado) setAnotaciones(datos)
      })
      .catch((err) => {
        if (cancelado) return
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar las notas.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [token, idPaciente])

  const idMedicoActual = perfil?.rol === 'medico' ? perfil.datos.id_medico : null

  const crear = useCallback(
    async (body: AnotacionCrearBody) => {
      const nueva = await api.medico.crearAnotacion(token!, idPaciente, body)
      setAnotaciones((actuales) => [...actuales, nueva])
    },
    [token, idPaciente],
  )

  const editar = useCallback(
    async (idAnotacion: number, texto: string) => {
      const editada = await api.medico.editarAnotacion(token!, idPaciente, idAnotacion, texto)
      setAnotaciones((actuales) => actuales.map((a) => (a.id_anotacion === idAnotacion ? editada : a)))
    },
    [token, idPaciente],
  )

  const borrar = useCallback(
    async (idAnotacion: number) => {
      await api.medico.borrarAnotacion(token!, idPaciente, idAnotacion)
      setAnotaciones((actuales) => actuales.filter((a) => a.id_anotacion !== idAnotacion))
    },
    [token, idPaciente],
  )

  /** Lo que necesita un gráfico para mostrar y agregar notas en sus puntos. */
  function paraGrafico(
    grafico: string,
    opciones: { sesion?: string | null; enfocar?: { punto: string } | null } = {},
  ): AnotacionesGrafico {
    return {
      notas: anotaciones.filter((a) => a.grafico === grafico),
      idMedicoActual,
      onCrear: (punto, texto) => crear({ grafico, punto, texto, sesion: opciones.sesion ?? null }),
      onEditar: editar,
      onBorrar: borrar,
      enfocar: opciones.enfocar,
    }
  }

  return { anotaciones, cargando, error, idMedicoActual, crear, editar, borrar, paraGrafico }
}
