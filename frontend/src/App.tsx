import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { Header } from './components/layout/Header'
import { DuckLogo } from './components/ui/DuckLogo'
import { useSession } from './auth/session'
import { LoginPage } from './pages/auth/LoginPage'
import { RegistroMedicoPage } from './pages/auth/RegistroMedicoPage'
import { RegistroPacientePage } from './pages/auth/RegistroPacientePage'
import { RecuperarPage } from './pages/auth/RecuperarPage'
import { ResetearPage } from './pages/auth/ResetearPage'
import { PatientDashboard } from './pages/paciente/PatientDashboard'
import { DoctorView } from './pages/medico/DoctorView'
import { EvaluationSignalPage } from './pages/medico/EvaluationSignalPage'
import { ConfiguracionPage } from './pages/configuracion/ConfiguracionPage'

/** Rutas públicas: si ya hay sesión, redirige al dashboard. */
function SoloAnonimos({ children }: { children: ReactNode }) {
  const { estado } = useSession()
  if (estado === 'autenticado') return <Navigate to="/" replace />
  return <>{children}</>
}

/** Rutas privadas: exige sesión. */
function SoloAutenticados({ children }: { children: ReactNode }) {
  const { estado } = useSession()
  if (estado !== 'autenticado') return <Navigate to="/login" replace />
  return <>{children}</>
}

function Dashboard() {
  const { perfil } = useSession()
  return (
    <>
      <Header />
      <main>{perfil?.rol === 'medico' ? <DoctorView /> : <PatientDashboard />}</main>
    </>
  )
}

function Configuracion() {
  return (
    <>
      <Header />
      <main>
        <ConfiguracionPage />
      </main>
    </>
  )
}

export default function App() {
  const { estado, perfil } = useSession()

  if (estado === 'cargando') {
    return (
      <div className="auth-loading">
        <DuckLogo spinning />
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <SoloAnonimos>
            <LoginPage />
          </SoloAnonimos>
        }
      />
      <Route
        path="/registro/medico"
        element={
          <SoloAnonimos>
            <RegistroMedicoPage />
          </SoloAnonimos>
        }
      />
      <Route
        path="/registro/paciente"
        element={
          <SoloAnonimos>
            <RegistroPacientePage />
          </SoloAnonimos>
        }
      />
      <Route
        path="/recuperar"
        element={
          <SoloAnonimos>
            <RecuperarPage />
          </SoloAnonimos>
        }
      />
      {/* Los links de reseteo llegan por mail: accesibles siempre. */}
      <Route path="/resetear/contrasena" element={<ResetearPage modo="contrasena" />} />
      <Route path="/resetear/pin" element={<ResetearPage modo="pin" />} />

      <Route
        path="/"
        element={
          <SoloAutenticados>
            <Dashboard />
          </SoloAutenticados>
        }
      />

      <Route
        path="/configuracion"
        element={
          <SoloAutenticados>
            <Configuracion />
          </SoloAutenticados>
        }
      />

      {/* Visor de señales: página aparte, sin header, sin ficha del paciente ni listado al costado. */}
      <Route
        path="/medico/pacientes/:idPaciente/evaluaciones/:idEvaluacion"
        element={
          <SoloAutenticados>
            <div className="signal-page-bg">
              <main>
                <EvaluationSignalPage />
              </main>
            </div>
          </SoloAutenticados>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
