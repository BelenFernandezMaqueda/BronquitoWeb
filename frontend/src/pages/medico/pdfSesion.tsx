import type { Anotacion, Evaluacion, EvaluacionMuestras, PacientePerfil } from '../../api/types'
import { describirPuntoXY, formatearFechaHora } from '../../anotaciones/notas'
import { claveGraficoSenal, comentariosDeSesion } from '../../anotaciones/useAnotaciones'
import { SignalXYChart } from '../../components/ui/SignalXYChart'
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
import { GRAFICOS_POR_TIPO, NOMBRE_TIPO } from './graficosSenales'

export interface DatosPdfSesion {
  paciente: PacientePerfil
  /** Quién genera el PDF (va al pie). */
  medico: string
  /** `fecha_hora` de la sesión. */
  sesion: string
  /** Las evaluaciones de la sesión con su curva (null si no tiene curva cargada). */
  evaluaciones: { evaluacion: Evaluacion; muestras: EvaluacionMuestras | null }[]
  anotaciones: Anotacion[]
}

async function graficosDeEvaluacion(
  evaluacion: Evaluacion,
  muestras: EvaluacionMuestras,
  anotaciones: Anotacion[],
): Promise<GraficoPdf[]> {
  const graficos: GraficoPdf[] = []
  for (const def of GRAFICOS_POR_TIPO[evaluacion.tipo]) {
    const x = muestras[def.x]
    const y = muestras[def.y]
    if (x.length === 0) {
      graficos.push({ titulo: def.titulo, color: def.color, imagen: null, marcadores: [] })
      continue
    }
    const clave = claveGraficoSenal(evaluacion.id_evaluacion, def.id)
    const notas = anotaciones.filter((a) => a.grafico === clave)
    const imagen = await graficoAImagen(
      <SignalXYChart
        x={x}
        y={y}
        etiquetaX={def.etiquetaX}
        etiquetaY={def.etiquetaY}
        color={def.color}
        anotaciones={soloMarcadores(notas)}
      />,
    )
    const marcadores = marcadoresPdf(
      x.map((_, i) => String(i)),
      notas,
      (i) => describirPuntoXY(def.etiquetaX, def.etiquetaY, x[i], y[i]),
    )
    graficos.push({ titulo: def.titulo, color: def.color, imagen, marcadores })
  }
  return graficos
}

/** PDF de una sesión de consultorio: datos del paciente, resultados, comentarios y las señales con sus notas. */
export async function generarPdfSesion({ paciente, medico, sesion, evaluaciones, anotaciones }: DatosPdfSesion): Promise<Blob> {
  const pdf = new DocumentoPdf()
  pdf.encabezado('Informe de sesión', `${nombreCompleto(paciente)} · Sesión del ${formatearFechaHora(sesion)}`)

  pdf.seccion('Datos del paciente')
  pdf.pares(paresPaciente(paciente))

  const espirometria = evaluaciones.find((e) => e.evaluacion.tipo === 'ESPIROMETRIA')?.evaluacion
  const pim = evaluaciones.find((e) => e.evaluacion.tipo === 'PIM_PEM')?.evaluacion
  const ambiente = espirometria ?? pim
  pdf.seccion('Resultados de la sesión')
  pdf.pares([
    ['FVC (L)', valorOGuion(espirometria?.fvc)],
    ['FEV1 (L)', valorOGuion(espirometria?.fev1)],
    ['PEF (L/min)', valorOGuion(espirometria?.pef)],
    ['FIVC (L)', valorOGuion(espirometria?.fivc)],
    ['FIV1 (L)', valorOGuion(espirometria?.fiv1)],
    ['PIM (cmH₂O)', valorOGuion(pim?.pim)],
    ['Temperatura (°C)', valorOGuion(ambiente?.temperatura)],
    ['Humedad (%)', valorOGuion(ambiente?.humedad)],
  ])

  pdf.seccion('Comentarios de la sesión')
  const comentarios = comentariosDeSesion(anotaciones, sesion)
  if (comentarios.length === 0) pdf.vacio('No hay comentarios generales para esta sesión.')
  for (const comentario of comentarios) pdf.nota(comentario)

  for (const { evaluacion, muestras } of evaluaciones) {
    pdf.seccion(`Señales: ${NOMBRE_TIPO[evaluacion.tipo]}`, ALTO_FILA_GRAFICOS)
    if (!muestras) {
      pdf.vacio('Esta evaluación no tiene la curva cargada.')
      continue
    }
    pdf.graficos(await graficosDeEvaluacion(evaluacion, muestras, anotaciones))
  }

  pdf.pie(`Generado con Bronquito el ${hoyLegible()} por ${medico}`)
  return pdf.blob()
}
