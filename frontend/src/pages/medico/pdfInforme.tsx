import type { Anotacion, Entrenamiento, Evaluacion, PacientePerfil } from '../../api/types'
import { describirPuntoEvolucion, formatearFechaHora } from '../../anotaciones/notas'
import { comentariosDeSesion } from '../../anotaciones/useAnotaciones'
import { PimTrendChart } from '../../components/ui/PimTrendChart'
import type { SerieTendencia } from '../../components/ui/TrendChartCarousel'
import { graficoAImagen } from '../../exportar/graficoAImagen'
import type { GraficoPdf } from '../../exportar/pdf'
import {
  ALTO_FILA_GRAFICOS,
  DocumentoPdf,
  hoyLegible,
  marcadoresPdf,
  nombreCompleto,
  paresPaciente,
  soloMarcadores,
  valorOGuion,
} from '../../exportar/pdf'
import { VARIABLES_ENTRENAMIENTO, agruparEnSesiones, seriesDeEntrenamientos, seriesDeEvaluaciones } from './evolucion'

export interface DatosInforme {
  paciente: PacientePerfil
  /** Quién genera el informe (va al pie). */
  medico: string
  evaluaciones: Evaluacion[]
  entrenamientos: Entrenamiento[]
  anotaciones: Anotacion[]
}

function porFecha<T extends { fecha_hora: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
}

/** Los gráficos de evolución (los mismos de la ficha), con sus notas. */
async function graficosDeEvolucion(series: SerieTendencia[], anotaciones: Anotacion[]): Promise<GraficoPdf[]> {
  const graficos: GraficoPdf[] = []
  for (const serie of series) {
    if (serie.valores.length === 0) {
      graficos.push({
        titulo: serie.titulo,
        color: serie.color,
        imagen: null,
        mensajeVacio: `No hay ningún valor de ${serie.nombreCorto} para graficar.`,
        marcadores: [],
      })
      continue
    }
    const notas = anotaciones.filter((a) => a.grafico === serie.clave)
    const fechas = serie.fechasCompletas ?? serie.fechas
    const imagen = await graficoAImagen(
      <PimTrendChart
        valores={serie.valores}
        fechas={serie.fechas}
        fechasCompletas={serie.fechasCompletas}
        claves={serie.clavesPuntos}
        titulo={serie.titulo}
        unidad={serie.unidad}
        etiquetaEje={serie.etiquetaEje}
        color={serie.color}
        anotaciones={soloMarcadores(notas)}
      />,
    )
    const marcadores = marcadoresPdf(serie.clavesPuntos ?? serie.valores.map((_, i) => String(i)), notas, (i) =>
      describirPuntoEvolucion(serie.etiquetaEje, serie.valores[i], fechas[i]),
    )
    graficos.push({ titulo: serie.titulo, color: serie.color, imagen, marcadores })
  }
  return graficos
}

/**
 * Informe general del paciente: sus datos, los parámetros de cada sesión de
 * evaluación y de entrenamiento a lo largo del tiempo (tablas y gráficos de
 * evolución con sus notas) y los comentarios de cada sesión.
 */
export async function generarInformeGeneral({
  paciente,
  medico,
  evaluaciones,
  entrenamientos,
  anotaciones,
}: DatosInforme): Promise<Blob> {
  const nombre = nombreCompleto(paciente)
  const pdf = new DocumentoPdf()
  pdf.encabezado('Informe general del paciente', `${nombre} · Generado el ${hoyLegible()}`)

  pdf.seccion('Datos del paciente')
  pdf.pares(paresPaciente(paciente))

  pdf.seccion('Evaluaciones')
  const evaluacionesCronologicas = porFecha(evaluaciones)
  const sesiones = agruparEnSesiones(evaluacionesCronologicas)
  if (sesiones.length === 0) {
    pdf.vacio('Todavía no hay evaluaciones registradas.')
  } else {
    pdf.subseccion('Parámetros por sesión', 20)
    pdf.tabla(
      ['Fecha', 'FVC (L)', 'FEV1 (L)', 'PEF (L/min)', 'FIVC (L)', 'FIV1 (L)', 'PIM (cmH₂O)'],
      sesiones.map((s) => [
        formatearFechaHora(s.fecha_hora, { corta: true }),
        valorOGuion(s.espirometria?.fvc),
        valorOGuion(s.espirometria?.fev1),
        valorOGuion(s.espirometria?.pef),
        valorOGuion(s.espirometria?.fivc),
        valorOGuion(s.espirometria?.fiv1),
        valorOGuion(s.pim?.pim),
      ]),
    )

    pdf.subseccion('Evolución', ALTO_FILA_GRAFICOS)
    pdf.graficos(await graficosDeEvolucion(seriesDeEvaluaciones(evaluacionesCronologicas, nombre), anotaciones))

    pdf.subseccion('Comentarios de las sesiones')
    const sesionesComentadas = sesiones
      .map((s) => ({ sesion: s, comentarios: comentariosDeSesion(anotaciones, s.fecha_hora) }))
      .filter((s) => s.comentarios.length > 0)
    if (sesionesComentadas.length === 0) pdf.vacio('No hay comentarios generales en ninguna sesión.')
    for (const { sesion, comentarios } of sesionesComentadas) {
      pdf.texto(`Sesión del ${formatearFechaHora(sesion.fecha_hora)}`, { tamano: 9.5, negrita: true, espacioDespues: 1 })
      for (const comentario of comentarios) pdf.nota(comentario, 4)
    }
  }

  pdf.seccion('Entrenamientos')
  const entrenamientosCronologicos = porFecha(entrenamientos)
  if (entrenamientosCronologicos.length === 0) {
    pdf.vacio('Todavía no hay sesiones de entrenamiento registradas.')
  } else {
    pdf.subseccion('Sesiones de entrenamiento', 20)
    pdf.tabla(
      ['Fecha', ...VARIABLES_ENTRENAMIENTO.map((v) => v.etiquetaEje)],
      entrenamientosCronologicos.map((e) => [
        formatearFechaHora(e.fecha_hora, { corta: true }),
        ...VARIABLES_ENTRENAMIENTO.map((v) => valorOGuion(v.valor(e))),
      ]),
    )

    pdf.subseccion('Evolución', ALTO_FILA_GRAFICOS)
    pdf.graficos(await graficosDeEvolucion(seriesDeEntrenamientos(entrenamientosCronologicos, nombre), anotaciones))
  }

  pdf.pie(`Generado con Bronquito el ${hoyLegible()} por ${medico}`)
  return pdf.blob()
}
