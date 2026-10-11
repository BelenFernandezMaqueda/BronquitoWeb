/**
 * Sesión autenticada de Bronquito. Guarda el token JWT (en localStorage, para
 * sobrevivir un refresh) y el perfil del usuario logueado, y expone las
 * acciones de login / logout al resto de la app.
 *
 * Reemplaza al viejo toggle de rol de `App.tsx`: ahora el rol sale del token.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { ApiError, api } from '../api/client'
import type { MedicoPerfil, PacientePerfil, Rol } from '../api/types'

const CLAVE_TOKEN = 'bronquito.token'
const CLAVE_ROL = 'bronquito.rol'

export type Perfil =
  | { rol: 'medico'; datos: MedicoPerfil }
  | { rol: 'paciente'; datos: PacientePerfil }

interface Sesion {
  /** 'cargando' mientras se valida el token guardado al abrir la app. */
  estado: 'cargando' | 'anonimo' | 'autenticado'
  token: string | null
  perfil: Perfil | null
  iniciarSesion: (token: string, rol: Rol) => Promise<void>
  cerrarSesion: () => void
  /** Re-consulta el perfil después de editarlo. */
  refrescarPerfil: () => Promise<void>
}

const SesionContext = createContext<Sesion | null>(null)

async function traerPerfil(token: string, rol: Rol): Promise<Perfil> {
  if (rol === 'medico') {
    return { rol: 'medico', datos: await api.medico.me(token) }
  }
  return { rol: 'paciente', datos: await api.paciente.me(token) }
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, valor)
  } catch {
    /* modo incógnito o storage bloqueado: la sesión dura sólo esta pestaña */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion['estado']>('cargando')
  const [token, setToken] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  const cerrarSesion = useCallback(() => {
    guardar(CLAVE_TOKEN, null)
    guardar(CLAVE_ROL, null)
    setToken(null)
    setPerfil(null)
    setEstado('anonimo')
  }, [])

  const aplicarSesion = useCallback(
    async (nuevoToken: string, rol: Rol) => {
      const p = await traerPerfil(nuevoToken, rol)
      guardar(CLAVE_TOKEN, nuevoToken)
      guardar(CLAVE_ROL, rol)
      setToken(nuevoToken)
      setPerfil(p)
      setEstado('autenticado')
    },
    [],
  )

  const iniciarSesion = useCallback(
    async (nuevoToken: string, rol: Rol) => {
      await aplicarSesion(nuevoToken, rol)
    },
    [aplicarSesion],
  )

  const refrescarPerfil = useCallback(async () => {
    if (!token || !perfil) return
    const p = await traerPerfil(token, perfil.rol)
    setPerfil(p)
  }, [token, perfil])

  // Al abrir la app: si hay token guardado, validarlo trayendo el perfil.
  useEffect(() => {
    const guardadoToken = leer(CLAVE_TOKEN)
    const guardadoRol = leer(CLAVE_ROL) as Rol | null
    if (!guardadoToken || (guardadoRol !== 'medico' && guardadoRol !== 'paciente')) {
      setEstado('anonimo')
      return
    }
    traerPerfil(guardadoToken, guardadoRol)
      .then((p) => {
        setToken(guardadoToken)
        setPerfil(p)
        setEstado('autenticado')
      })
      .catch((err) => {
        // Token vencido/inválido → arrancar anónimo. Un error de red también
        // cae acá; el usuario vuelve a loguearse, que es lo esperable.
        if (!(err instanceof ApiError)) console.error(err)
        guardar(CLAVE_TOKEN, null)
        guardar(CLAVE_ROL, null)
        setEstado('anonimo')
      })
  }, [])

  const valor = useMemo<Sesion>(
    () => ({ estado, token, perfil, iniciarSesion, cerrarSesion, refrescarPerfil }),
    [estado, token, perfil, iniciarSesion, cerrarSesion, refrescarPerfil],
  )

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}

export function useSession(): Sesion {
  const ctx = useContext(SesionContext)
  if (!ctx) throw new Error('useSession() tiene que usarse dentro de <SessionProvider>')
  return ctx
}
