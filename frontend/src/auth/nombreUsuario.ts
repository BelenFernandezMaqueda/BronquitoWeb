/**
 * Nombre de usuario del paciente: mismas reglas que `normalizar_nombre_usuario`
 * en el backend (app/schemas/auth.py). Sólo letras a-z (sin ñ: la pantalla de
 * la ESP no la dibuja), de 4 a 25, y sin
 * distinguir mayúsculas: siempre se manda en minúscula.
 */

export const NOMBRE_USUARIO_MAX = 25

export const AYUDA_NOMBRE_USUARIO = 'Entre 4 y 25 letras, sin ñ, números, tildes, espacios ni caracteres especiales.'

/** Pasa a minúscula; el NFC junta una "ñ" escrita como "n" + tilde combinable. */
export function normalizarNombreUsuario(valor: string): string {
  return valor.normalize('NFC').toLowerCase()
}

/** Devuelve el mensaje de error, o `null` si el usuario (ya normalizado) es válido. */
export function errorNombreUsuario(usuario: string): string | null {
  if (!/^[a-z]{4,25}$/.test(usuario)) {
    return 'El nombre de usuario debe tener entre 4 y 25 letras, sin ñ, números, tildes, espacios ni caracteres especiales.'
  }
  return null
}
