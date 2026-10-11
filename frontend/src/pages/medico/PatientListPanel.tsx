import { useMemo, useState } from 'react'
import type { Paciente } from '../../types'
import { AdherenciaDot } from '../../components/ui/Badge'
import { adherenciaDe, textoUltimaSesion } from '../../data/mockData'

interface PatientListPanelProps {
  pacientes: Paciente[]
  pacienteSeleccionadoId: string | null
  onSeleccionar: (id: string) => void
  onConectar: () => void
}

/** minúsculas y sin tildes, para que "jose" encuentre a "José". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function PatientListPanel({ pacientes, pacienteSeleccionadoId, onSeleccionar, onConectar }: PatientListPanelProps) {
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (!q) return pacientes
    return pacientes.filter(
      (p) =>
        normalizar(p.nombre).includes(q) ||
        normalizar(p.diagnostico).includes(q) ||
        normalizar(p.nombreUsuario ?? '').includes(q),
    )
  }, [pacientes, busqueda])

  return (
    <div className="card patient-list">
      <div className="search">
        <span aria-hidden="true">🔍</span>
        <label htmlFor="buscar-paciente" className="sr-only">
          Buscar paciente
        </label>
        <input
          id="buscar-paciente"
          placeholder="Buscar paciente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div role="list" aria-label="Lista de pacientes">
        {filtrados.map((p) => (
          <button
            key={p.id}
            role="listitem"
            className={`patient-item ${p.id === pacienteSeleccionadoId ? 'active' : ''}`}
            onClick={() => onSeleccionar(p.id)}
            aria-current={p.id === pacienteSeleccionadoId}
          >
            <div className="p-avatar" aria-hidden="true">
              {p.avatarIniciales}
            </div>
            <div className="p-info">
              <div className="p-name">{p.nombre}</div>
              <div className="p-sub">{textoUltimaSesion(p.id)}</div>
            </div>
            <AdherenciaDot adherencia={adherenciaDe(p.id)} />
          </button>
        ))}
        {filtrados.length === 0 && <p className="empty-state">No encontramos pacientes con esa búsqueda.</p>}
      </div>

      <button className="add-patient" onClick={onConectar}>
        ＋ Conectar paciente
      </button>
    </div>
  )
}
