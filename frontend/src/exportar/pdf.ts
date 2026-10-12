import { jsPDF } from 'jspdf'
import type { Anotacion, PacientePerfil } from '../api/types'
import type { DescripcionPunto } from '../anotaciones/notas'
import { formatearFechaHora, formatearMomentoNota, marcadoresDe } from '../anotaciones/notas'
import type { AnotacionesGrafico } from '../components/ui/ChartInteractivo'
import { edadDesdeNacimiento, formatearFecha } from '../data/mockData'
import type { ImagenGrafico } from './graficoAImagen'

/*
 * Piezas comunes de los PDF (informe de sesión e informe general). Todo en
 * milímetros, hoja A4 vertical.
 */

const MARGEN = 16
const ANCHO_PAGINA = 210
const ALTO_PAGINA = 297
const ANCHO_UTIL = ANCHO_PAGINA - 2 * MARGEN
/** Hasta dónde se escribe: lo de abajo queda para el pie de página. */
const LIMITE_INFERIOR = ALTO_PAGINA - MARGEN - 6
const MM_POR_PUNTO = 0.3528
const RELLENO_TABLA = 1.5

/** Lo que ocupa una fila de gráficos: para que un título no quede solo al pie de una página. */
export const ALTO_FILA_GRAFICOS = 65

const COLOR = {
  tinta: '#0c3a44',
  suave: '#5c7c82',
  teal: '#0a7e96',
  tealPalido: '#e6f8fb',
  linea: '#dff0f2',
  rosa: '#f0459a',
  amarillo: '#ffcb3e',
}

const REEMPLAZOS: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '→': '->',
  '←': '<-',
  '≈': '~',
  '≤': '<=',
  '≥': '>=',
  '−': '-',
  '–': '-',
  '—': '-',
  '…': '...',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '•': '-',
}

/**
 * Las fuentes estándar del PDF (Helvetica) sólo tienen los caracteres
 * latinos básicos: tildes y ñ sí, pero "₂", flechas o emojis no. Esto los
 * reemplaza por algo equivalente (o "?") para que no salgan símbolos raros.
 */
export function textoPdf(texto: string): string {
  return [...texto.normalize('NFC')]
    .map((c) => {
      if (REEMPLAZOS[c]) return REEMPLAZOS[c]
      const codigo = c.codePointAt(0)!
      return c === '\n' || (codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff) ? c : '?'
    })
    .join('')
}

/** Un punto anotado, listo para listar debajo de su gráfico. */
export interface MarcadorPdf {
  numero: number
  descripcion: string
  notas: Anotacion[]
}

export interface GraficoPdf {
  titulo: string
  color: string
  imagen: ImagenGrafico | null
  /** Qué escribir en lugar del gráfico si no hay imagen. */
  mensajeVacio?: string
  marcadores: MarcadorPdf[]
}

/** Para dibujar un gráfico con sus marcadores de notas, sin poder editarlas. */
export function soloMarcadores(notas: Anotacion[]): AnotacionesGrafico {
  const nada = async () => {}
  return { notas, idMedicoActual: null, onCrear: nada, onEditar: nada, onBorrar: nada }
}

/** Los marcadores de un gráfico con el texto que describe cada punto (mismos números que en pantalla). */
export function marcadoresPdf(
  claves: string[],
  notas: Anotacion[],
  describir: (indice: number) => DescripcionPunto,
): MarcadorPdf[] {
  return marcadoresDe(claves, notas).map((m) => {
    const { principal, secundario } = describir(m.indice)
    return { numero: m.numero, descripcion: `${principal} · ${secundario}`, notas: m.notas }
  })
}

export function nombreCompleto(paciente: PacientePerfil): string {
  return `${paciente.nombre ?? ''} ${paciente.apellido ?? ''}`.trim() || paciente.nombre_usuario
}

const SEXO: Record<string, string> = { F: 'Femenino', M: 'Masculino', X: 'Otro / prefiere no decir' }

export function paresPaciente(paciente: PacientePerfil): [string, string][] {
  const nacimiento = formatearFecha(`${paciente.fecha_nacimiento}T00:00:00`, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return [
    ['Paciente', nombreCompleto(paciente)],
    ['Usuario', paciente.nombre_usuario],
    ['Fecha de nacimiento', `${nacimiento} (${edadDesdeNacimiento(paciente.fecha_nacimiento)} años)`],
    ['Sexo', SEXO[paciente.sexo] ?? paciente.sexo],
    ['Altura', `${paciente.altura_cm} cm`],
    ['Peso', `${paciente.peso_kg} kg`],
    ['Fumador', paciente.fumador ? 'Sí' : 'No'],
    ['Enfermedades', paciente.enfermedades ?? 'Sin informar'],
  ]
}

/** Un valor para una tabla, con un guion si falta. */
export function valorOGuion(valor: number | null | undefined): string {
  return valor == null ? '-' : String(valor)
}

export function hoyLegible(): string {
  return formatearFechaHora(new Date(), { corta: true })
}

interface OpcionesTexto {
  tamano?: number
  color?: string
  negrita?: boolean
  sangria?: number
  espacioDespues?: number
}

/** Hoja A4 que se va escribiendo de arriba hacia abajo, pasando de página sola. */
export class DocumentoPdf {
  readonly doc = new jsPDF({ unit: 'mm', format: 'a4' })
  private y = MARGEN

  private altoLinea(tamano: number): number {
    return tamano * MM_POR_PUNTO * 1.3
  }

  private fuente(tamano: number, negrita: boolean, color: string): void {
    this.doc.setFont('helvetica', negrita ? 'bold' : 'normal')
    this.doc.setFontSize(tamano)
    this.doc.setTextColor(color)
  }

  private lineas(texto: string, ancho: number): string[] {
    return this.doc.splitTextToSize(textoPdf(texto), ancho) as string[]
  }

  /** Si lo que sigue (de `alto` mm) no entra, pasa a una página nueva. Devuelve si pasó. */
  private reservar(alto: number): boolean {
    if (this.y + alto <= LIMITE_INFERIOR) return false
    this.doc.addPage()
    this.y = MARGEN
    return true
  }

  texto(
    texto: string,
    { tamano = 9.5, color = COLOR.tinta, negrita = false, sangria = 0, espacioDespues = 1.5 }: OpcionesTexto = {},
  ): void {
    this.fuente(tamano, negrita, color)
    const alto = this.altoLinea(tamano)
    for (const linea of this.lineas(texto, ANCHO_UTIL - sangria)) {
      this.reservar(alto)
      this.doc.text(linea, MARGEN + sangria, this.y, { baseline: 'top' })
      this.y += alto
    }
    this.y += espacioDespues
  }

  encabezado(titulo: string, detalle: string): void {
    this.texto('Bronquito', { tamano: 10, negrita: true, color: COLOR.rosa, espacioDespues: 0.5 })
    this.texto(titulo, { tamano: 18, negrita: true, espacioDespues: 0.5 })
    this.texto(detalle, { tamano: 10, color: COLOR.suave, espacioDespues: 3 })
    this.doc.setDrawColor(COLOR.linea)
    this.doc.setLineWidth(0.5)
    this.doc.line(MARGEN, this.y, MARGEN + ANCHO_UTIL, this.y)
    this.y += 5
  }

  /** `reservaSiguiente`: cuánto de lo que sigue tiene que entrar en la misma página que el título. */
  seccion(titulo: string, reservaSiguiente = 30): void {
    this.reservar(this.altoLinea(13) + 4.5 + reservaSiguiente)
    this.y += 2
    this.texto(titulo, { tamano: 13, negrita: true, color: COLOR.teal, espacioDespues: 2.5 })
  }

  subseccion(titulo: string, reservaSiguiente = 16): void {
    this.reservar(this.altoLinea(10.5) + 2 + reservaSiguiente)
    this.texto(titulo, { tamano: 10.5, negrita: true, espacioDespues: 2 })
  }

  vacio(mensaje: string): void {
    this.texto(mensaje, { color: COLOR.suave, espacioDespues: 3 })
  }

  /** Pares etiqueta/valor en columnas (ej. los datos del paciente). */
  pares(pares: [string, string][], columnas = 3): void {
    const anchoColumna = ANCHO_UTIL / columnas
    const altoEtiqueta = this.altoLinea(7.5)
    const altoValor = this.altoLinea(9.5)
    for (let i = 0; i < pares.length; i += columnas) {
      const fila = pares.slice(i, i + columnas)
      this.fuente(9.5, false, COLOR.tinta)
      const valores = fila.map(([, valor]) => this.lineas(valor, anchoColumna - 4))
      const altoFila = altoEtiqueta + Math.max(...valores.map((l) => l.length)) * altoValor + 2.5
      this.reservar(altoFila)
      fila.forEach(([etiqueta], j) => {
        const x = MARGEN + j * anchoColumna
        this.fuente(7.5, true, COLOR.suave)
        this.doc.text(textoPdf(etiqueta), x, this.y, { baseline: 'top' })
        this.fuente(9.5, false, COLOR.tinta)
        valores[j].forEach((linea, k) => this.doc.text(linea, x, this.y + altoEtiqueta + k * altoValor, { baseline: 'top' }))
      })
      this.y += altoFila
    }
    this.y += 2
  }

  /**
   * Anchos de columna según el contenido: ninguna palabra se corta (si no
   * entra, se achica la letra) y el espacio que sobra va a las columnas con
   * textos más largos.
   */
  private anchosDeTabla(encabezados: string[], filas: string[][]): { anchos: number[]; tamano: number } {
    const relleno = 2 * RELLENO_TABLA
    const suma = (valores: number[]) => valores.reduce((a, b) => a + b, 0)
    const ancho = (texto: string) => this.doc.getTextWidth(textoPdf(texto))
    const palabraMasLarga = (texto: string) => Math.max(0, ...textoPdf(texto).split(/\s+/).map((p) => this.doc.getTextWidth(p)))

    const medir = (tamano: number) => {
      const minimos: number[] = []
      const ideales: number[] = []
      encabezados.forEach((encabezado, j) => {
        this.fuente(tamano, true, COLOR.teal)
        let minimo = palabraMasLarga(encabezado)
        let ideal = ancho(encabezado)
        this.fuente(tamano, false, COLOR.tinta)
        for (const fila of filas) {
          minimo = Math.max(minimo, palabraMasLarga(fila[j]))
          ideal = Math.max(ideal, ancho(fila[j]))
        }
        minimos.push(minimo + relleno)
        ideales.push(ideal + relleno)
      })
      return { minimos, ideales }
    }

    let tamano = 8
    let { minimos, ideales } = medir(tamano)
    while (suma(minimos) > ANCHO_UTIL && tamano > 6) {
      tamano -= 0.5
      ;({ minimos, ideales } = medir(tamano))
    }

    const sobra = Math.max(0, ANCHO_UTIL - suma(minimos))
    const faltantes = ideales.map((ideal, j) => Math.max(0, ideal - minimos[j]))
    const totalFaltante = suma(faltantes)
    const anchos = minimos.map((minimo, j) =>
      totalFaltante > 0 ? minimo + Math.min(faltantes[j], (sobra * faltantes[j]) / totalFaltante) : minimo,
    )
    const resto = Math.max(0, ANCHO_UTIL - suma(anchos)) / anchos.length
    return { anchos: anchos.map((a) => a + resto), tamano }
  }

  /** Tabla con encabezado (que se repite si la tabla sigue en otra página). */
  tabla(encabezados: string[], filas: string[][]): void {
    const { anchos, tamano } = this.anchosDeTabla(encabezados, filas)
    const anchoTotal = anchos.reduce((a, b) => a + b, 0)
    const alto = this.altoLinea(tamano)

    const celdas = (fila: string[]) => fila.map((celda, j) => this.lineas(celda, anchos[j] - 2 * RELLENO_TABLA))
    const dibujarFila = (lineas: string[][]) => {
      let x = MARGEN
      lineas.forEach((celda, j) => {
        celda.forEach((linea, k) =>
          this.doc.text(linea, x + RELLENO_TABLA, this.y + RELLENO_TABLA + k * alto, { baseline: 'top' }),
        )
        x += anchos[j]
      })
    }

    const dibujarEncabezado = () => {
      this.fuente(tamano, true, COLOR.teal)
      const lineas = celdas(encabezados)
      const altoEncabezado = Math.max(...lineas.map((l) => l.length)) * alto + 2 * RELLENO_TABLA
      this.reservar(altoEncabezado + alto + 2 * RELLENO_TABLA)
      this.doc.setFillColor(COLOR.tealPalido)
      this.doc.rect(MARGEN, this.y, anchoTotal, altoEncabezado, 'F')
      this.fuente(tamano, true, COLOR.teal)
      dibujarFila(lineas)
      this.y += altoEncabezado
    }

    dibujarEncabezado()
    for (const fila of filas) {
      this.fuente(tamano, false, COLOR.tinta)
      const lineas = celdas(fila)
      const altoFila = Math.max(...lineas.map((l) => l.length)) * alto + 2 * RELLENO_TABLA
      if (this.reservar(altoFila)) dibujarEncabezado()
      this.fuente(tamano, false, COLOR.tinta)
      dibujarFila(lineas)
      this.y += altoFila
      this.doc.setDrawColor(COLOR.linea)
      this.doc.setLineWidth(0.3)
      this.doc.line(MARGEN, this.y, MARGEN + anchoTotal, this.y)
    }
    this.y += 5
  }

  /** Una nota con su autor y fecha. */
  nota(nota: Anotacion, sangria = 0): void {
    this.texto(nota.texto, { tamano: 9, sangria, espacioDespues: 0.3 })
    this.texto(`${nota.autor} · ${formatearMomentoNota(nota)}`, {
      tamano: 7.5,
      color: COLOR.suave,
      sangria,
      espacioDespues: 2,
    })
  }

  /** Gráficos de a dos por fila; debajo de cada fila, las notas de sus puntos. */
  graficos(graficos: GraficoPdf[]): void {
    const separacion = 6
    const anchoColumna = (ANCHO_UTIL - separacion) / 2
    const altoTitulo = this.altoLinea(10) + 1

    for (let i = 0; i < graficos.length; i += 2) {
      const fila = graficos.slice(i, i + 2)
      const altoImagen = Math.max(
        ...fila.map((g) => (g.imagen ? (anchoColumna * g.imagen.alto) / g.imagen.ancho : 12)),
      )
      this.reservar(altoTitulo + altoImagen + 3)

      fila.forEach((g, j) => {
        const x = MARGEN + j * (anchoColumna + separacion)
        this.fuente(10, true, g.color)
        this.doc.text(textoPdf(g.titulo), x, this.y, { baseline: 'top', maxWidth: anchoColumna })
        if (g.imagen) {
          const altoEste = (anchoColumna * g.imagen.alto) / g.imagen.ancho
          this.doc.addImage(g.imagen.dataUrl, 'PNG', x, this.y + altoTitulo, anchoColumna, altoEste, undefined, 'FAST')
        } else {
          this.fuente(9, false, COLOR.suave)
          this.doc.text(textoPdf(g.mensajeVacio ?? 'No hay datos para graficar.'), x, this.y + altoTitulo + 3, {
            baseline: 'top',
            maxWidth: anchoColumna,
          })
        }
      })
      this.y += altoTitulo + altoImagen + 3

      for (const g of fila) {
        if (g.marcadores.length > 0) this.notasDeGrafico(g)
      }
    }
  }

  private notasDeGrafico(grafico: GraficoPdf): void {
    this.reservar(16)
    this.texto(`Notas en "${grafico.titulo}"`, { tamano: 8.5, negrita: true, color: COLOR.suave, espacioDespues: 1.2 })
    for (const marcador of grafico.marcadores) {
      this.reservar(this.altoLinea(8.5) * 3)
      this.numeroDeMarcador(marcador.numero, MARGEN + 2.4, this.y + 1.5)
      this.texto(marcador.descripcion, { tamano: 8.5, negrita: true, sangria: 7, espacioDespues: 0.8 })
      for (const nota of marcador.notas) this.nota(nota, 7)
    }
    this.y += 2
  }

  /** El mismo circulito amarillo numerado que marca el punto en el gráfico. */
  private numeroDeMarcador(numero: number, cx: number, cy: number): void {
    this.doc.setFillColor(COLOR.amarillo)
    this.doc.setDrawColor(COLOR.tinta)
    this.doc.setLineWidth(0.3)
    this.doc.circle(cx, cy, 2.2, 'FD')
    this.fuente(6.5, true, COLOR.tinta)
    this.doc.text(String(numero), cx, cy, { align: 'center', baseline: 'middle' })
  }

  /** Texto al pie de cada página, más "Página X de N". Va al final, cuando ya se sabe cuántas páginas hay. */
  pie(texto: string): void {
    const total = this.doc.getNumberOfPages()
    for (let pagina = 1; pagina <= total; pagina++) {
      this.doc.setPage(pagina)
      this.fuente(7.5, false, COLOR.suave)
      this.doc.text(textoPdf(texto), MARGEN, ALTO_PAGINA - 9)
      this.doc.text(`Página ${pagina} de ${total}`, ANCHO_PAGINA - MARGEN, ALTO_PAGINA - 9, { align: 'right' })
    }
  }

  blob(): Blob {
    return this.doc.output('blob')
  }
}
