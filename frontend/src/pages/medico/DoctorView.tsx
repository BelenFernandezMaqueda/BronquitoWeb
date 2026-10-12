import { useEffect, useState } from 'react'
import { PatientListPanel } from './PatientListPanel'
import { PatientDetail } from './PatientDetail'
import { ConnectPatientModal } from './ConnectPatientModal'
import { DispositivoPanel } from './DispositivoPanel'
import { useSession } from '../../auth/session'
import { ApiError, api } from '../../api/client'
import type { PacientePerfil } from '../../api/types'
import type { Paciente } from '../../types'
import { edadDesdeNacimiento } from '../../data/mockData'

function inicialesDe(nombre: string | null, apellido: string | null, nombreUsuario: string): string {
  const letras = `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`
  return (letras || nombreUsuario.slice(0, 2)).toUpperCase()
}

/**
 * Adapta el perfil que devuelve la API al shape de `Paciente` que todavía
 * usan PatientListPanel/PatientDetail (heredado de los mocks). Los campos
 * clínicos que el backend todavía no expone (diagnóstico, PIM, resistencia,
 * frecuencia) quedan en placeholder hasta que haya un endpoint real para eso.
 */
function pacienteDesdeApi(p: PacientePerfil): Paciente {
  return {
    id: String(p.id_paciente),
    nombre: `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || p.nombre_usuario,
    nombreUsuario: p.nombre_usuario,
    email: p.email ?? '',
    avatarIniciales: inicialesDe(p.nombre, p.apellido, p.nombre_usuario),
    rol: 'paciente',
    edad: edadDesdeNacimiento(p.fecha_nacimiento),
    diagnostico: p.enfermedades ?? '',
    enfermedades: p.enfermedades,
    fechaNacimiento: p.fecha_nacimiento,
    resistenciaActual: 0,
    frecuenciaSemanal: 0,
    pimInicial: 0,
    pimActual: 0,
  }
}

export function DoctorView() {
  const { token } = useSession()
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null)
  const [mostrarConectar, setMostrarConectar] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelado = false

    api.medico
      .misPacientes(token)
      .then((datos) => {
        if (cancelado) return
        const adaptados = datos.map(pacienteDesdeApi)
        setPacientes(adaptados)
        setSeleccionadoId((actual) => actual ?? adaptados[0]?.id ?? null)
      })
      .catch((err) => {
        if (cancelado) return
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar tus pacientes.')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })

    return () => {
      cancelado = true
    }
  }, [token])

  const pacienteSeleccionado = pacientes.find((p) => p.id === seleccionadoId) ?? null

  return (
    <div id="contenido-principal" className="doctor-layout">
      <div>
        <PatientListPanel
          pacientes={pacientes}
          pacienteSeleccionadoId={seleccionadoId}
          onSeleccionar={setSeleccionadoId}
          onConectar={() => setMostrarConectar(true)}
        />
        <DispositivoPanel pacientes={pacientes} />
      </div>

      {cargando ? (
        <div className="card">
          <p className="empty-state">Cargando pacientes…</p>
        </div>
      ) : error ? (
        <div className="card">
          <p className="empty-state">{error}</p>
        </div>
      ) : pacienteSeleccionado ? (
        <PatientDetail
          paciente={pacienteSeleccionado}
          onDesvincular={async () => {
            await api.medico.desvincularPaciente(token!, Number(pacienteSeleccionado.id))
            setPacientes((actuales) => actuales.filter((p) => p.id !== pacienteSeleccionado.id))
            setSeleccionadoId(null)
          }}
        />
      ) : (
        <div className="card">
          <p className="empty-state">
            {pacientes.length === 0
              ? 'Todavía no tenés pacientes vinculados. Conectá al primero con el botón "＋ Conectar paciente".'
              : 'Seleccioná un paciente de la lista para ver su detalle.'}
          </p>
        </div>
      )}

      {mostrarConectar && (
        <ConnectPatientModal
          onClose={() => setMostrarConectar(false)}
          onConectado={(nuevo) => {
            setPacientes((actuales) => [...actuales, pacienteDesdeApi(nuevo)])
            setSeleccionadoId(String(nuevo.id_paciente))
          }}
        />
      )}
    </div>
  )
}
