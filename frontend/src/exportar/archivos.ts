/** Tipo de archivo, para el filtro del diálogo "Guardar como". */
export interface TipoArchivo {
  descripcion: string
  mime: string
  extension: string
}

export const TIPO_CSV: TipoArchivo = { descripcion: 'Planilla CSV', mime: 'text/csv', extension: '.csv' }
export const TIPO_PDF: TipoArchivo = { descripcion: 'Documento PDF', mime: 'application/pdf', extension: '.pdf' }

/** Adónde va a parar el archivo una vez generado. */
export interface Destino {
  guardar: (contenido: Blob) => Promise<void>
}

// `showSaveFilePicker` todavía no está en los tipos de TypeScript (y no existe en Safari ni Firefox).
interface ArchivoElegido {
  createWritable: () => Promise<{ write: (datos: Blob) => Promise<void>; close: () => Promise<void> }>
}
interface VentanaConGuardarComo extends Window {
  showSaveFilePicker?: (opciones: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<ArchivoElegido>
}

/**
 * Pregunta dónde guardar el archivo. En Chrome y Edge abre el diálogo
 * "Guardar como" del sistema; en los navegadores que no lo tienen (Safari,
 * Firefox) queda como una descarga común, que va a la carpeta de descargas
 * (o pregunta dónde, si el navegador está configurado así).
 *
 * Hay que llamarla apenas se hace click, ANTES de generar el archivo: el
 * navegador sólo deja abrir el diálogo como respuesta directa a un click, y
 * armar un PDF puede tardar unos segundos.
 *
 * Devuelve null si el usuario canceló.
 */
export async function elegirDestino(nombreSugerido: string, tipo: TipoArchivo): Promise<Destino | null> {
  // Se llama como método de `window` (desestructurarlo tira "Illegal invocation" en Chrome).
  const ventana = window as VentanaConGuardarComo
  if (typeof ventana.showSaveFilePicker === 'function') {
    try {
      const archivo = await ventana.showSaveFilePicker({
        suggestedName: nombreSugerido,
        types: [{ description: tipo.descripcion, accept: { [tipo.mime]: [tipo.extension] } }],
      })
      return {
        guardar: async (contenido) => {
          const escritura = await archivo.createWritable()
          await escritura.write(contenido)
          await escritura.close()
        },
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      // Cualquier otro error (ej. el navegador no dejó abrir el diálogo): seguimos con una descarga común.
    }
  }
  return { guardar: async (contenido) => descargar(contenido, nombreSugerido) }
}

function descargar(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Safari arranca la descarga un rato después del click: no revocar enseguida.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// Sin separador de miles ni notación científica (ej. 1e-7), que Excel y Sheets no leen como número.
const FORMATO_NUMERO = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 10 })

/**
 * Arma un CSV en el formato de Excel y Google Sheets en español (punto y
 * coma como separador, coma decimal), así se abre directo con cada valor en
 * su columna y los números como números (con punto decimal, Sheets en
 * español toma algunos como texto y otros como fecha). Lleva BOM para que
 * Excel respete las tildes. En Python: pd.read_csv(..., sep=';', decimal=',').
 */
export function aCsv(filas: (string | number | null | undefined)[][]): string {
  const celda = (valor: string | number | null | undefined) => {
    if (valor == null) return ''
    if (typeof valor === 'number') return FORMATO_NUMERO.format(valor).replace('.', ',')
    return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
  }
  return '﻿' + filas.map((fila) => fila.map(celda).join(';')).join('\r\n') + '\r\n'
}
