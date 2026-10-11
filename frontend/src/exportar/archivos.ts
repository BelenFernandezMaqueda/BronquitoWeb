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

/**
 * Arma un CSV estándar (coma como separador, punto decimal), que abre bien
 * en Python, MATLAB y Google Sheets. Lleva BOM para que Excel respete las
 * tildes.
 */
export function aCsv(filas: (string | number | null | undefined)[][]): string {
  const celda = (valor: string | number | null | undefined) => {
    if (valor == null) return ''
    const texto = String(valor)
    return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  return '﻿' + filas.map((fila) => fila.map(celda).join(',')).join('\r\n') + '\r\n'
}
