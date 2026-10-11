import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError, api } from '../../api/client'
import type { EnfermedadPreexistente, Sexo } from '../../api/types'
import { useSession } from '../../auth/session'
import { PasswordField } from '../../components/ui/PasswordField'
import { AuthShell } from './AuthShell'

const OPCIONES_ENFERMEDADES: Array<{ valor: EnfermedadPreexistente; etiqueta: string }> = [
  { valor: 'EPOC', etiqueta: 'EPOC' },
  { valor: 'Asma', etiqueta: 'Asma' },
  { valor: 'Lesión Medular', etiqueta: 'Lesión Medular' },
  { valor: 'Fibrosis quística', etiqueta: 'Fibrosis quística' },
  { valor: 'Otra', etiqueta: 'Otra' },
  { valor: 'NS/NC', etiqueta: 'No sabe / no contesta (NS/NC)' },
]

export function RegistroPacientePage() {
  const { iniciarSesion } = useSession()
  const navigate = useNavigate()

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [dni, setDni] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [email, setEmail] = useState('')
  const [altura, setAltura] = useState('')
  const [peso, setPeso] = useState('')
  const [nacimiento, setNacimiento] = useState('')
  const [sexo, setSexo] = useState<Sexo | ''>('')
  const [fumador, setFumador] = useState(false)
  const [enfermedades, setEnfermedades] = useState<EnfermedadPreexistente[]>([])
  const [acepto, setAcepto] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (/\d/.test(nombre) || /\d/.test(apellido)) {
      setError('El nombre y el apellido no pueden contener números.')
      return
    }
    if (!/^\d+$/.test(dni)) {
      setError('El DNI solo puede contener números.')
      return
    }
    if (!/^\d{7,8}$/.test(dni)) {
      setError('El DNI debe tener entre 7 y 8 dígitos.')
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('El PIN tiene que ser de 4 dígitos.')
      return
    }
    if (pin !== pin2) {
      setError('Los PIN no coinciden.')
      return
    }
    if (!sexo) {
      setError('Elegí una opción en "Sexo".')
      return
    }
    if (enfermedades.length === 0) {
      setError('Elegí al menos una opción en "Enfermedades preexistentes".')
      return
    }
    setEnviando(true)
    try {
      const res = await api.paciente.registro({
        dni: dni.trim(),
        pin,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        altura_cm: Number(altura),
        peso_kg: Number(peso),
        fecha_nacimiento: nacimiento,
        sexo,
        fumador,
        enfermedades,
        acepto_terminos: acepto,
      })
      await iniciarSesion(res.access_token, res.rol)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.')
      setEnviando(false)
    }
  }

  function cambiarEnfermedades(enfermedad: EnfermedadPreexistente, seleccionada: boolean) {
    setEnfermedades((actuales) =>
      seleccionada ? [...actuales, enfermedad] : actuales.filter((actual) => actual !== enfermedad),
    )
  }

  return (
    <AuthShell
      titulo="Crear cuenta de paciente"
      subtitulo="Creá tu cuenta para acceder a tu información y compartirla con tu equipo médico."
      wide
    >
      {error && <div className="auth-alert error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="auth-row">
          <div className="field">
            <label htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              type="text"
              autoComplete="given-name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="apellido">Apellido</label>
            <input
              id="apellido"
              type="text"
              autoComplete="family-name"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="auth-row">
          <div className="field">
            <label htmlFor="dni">DNI</label>
            <input
              id="dni"
              type="text"
              inputMode="numeric"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="auth-row">
          <PasswordField
            id="pin"
            label="PIN (4 dígitos)"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
          <PasswordField
            id="pin2"
            label="Repetir PIN"
            inputMode="numeric"
            maxLength={4}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>

        <div className="auth-row">
          <div className="field">
            <label htmlFor="altura">Altura (cm)</label>
            <input
              id="altura"
              type="number"
              min="1"
              max="299"
              step="0.1"
              value={altura}
              onChange={(e) => setAltura(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="peso">Peso (kg)</label>
            <input
              id="peso"
              type="number"
              min="1"
              max="499"
              step="0.1"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="auth-row">
          <div className="field">
            <label htmlFor="nacimiento">Fecha de nacimiento</label>
            <input
              id="nacimiento"
              type="date"
              value={nacimiento}
              onChange={(e) => setNacimiento(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="sexo">Sexo</label>
            <select id="sexo" value={sexo} onChange={(e) => setSexo(e.target.value as Sexo)} required>
              <option value="" disabled>
                Elegí una opción
              </option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="X">Otro / prefiero no decir</option>
            </select>
          </div>
        </div>

        <div className="field enfermedades-field">
          <span>Enfermedades preexistentes</span>
          <div className="enfermedades-options">
            {OPCIONES_ENFERMEDADES.map(({ valor, etiqueta }) => (
              <label className="field-check" key={valor}>
                <input
                  type="checkbox"
                  checked={enfermedades.includes(valor)}
                  onChange={(e) => cambiarEnfermedades(valor, e.target.checked)}
                />
                <span>{etiqueta}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="field-check">
          <input type="checkbox" checked={fumador} onChange={(e) => setFumador(e.target.checked)} />
          <span>Soy fumador/a.</span>
        </label>

        <label className="field-check">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <span>Acepto los términos y la política de privacidad de Bronquito.</span>
        </label>

        <button type="submit" className="btn btn-teal btn-block" disabled={enviando || !acepto || enfermedades.length === 0}>
          {enviando ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <div className="auth-links">
        <span>
          ¿Ya tenés cuenta? <Link to="/login">Iniciá sesión</Link>
        </span>
      </div>
    </AuthShell>
  )
}
