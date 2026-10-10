import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, api } from '../../api/client'
import type {
  EnfermedadPreexistente,
  MedicoPerfil,
  MedicoPerfilUpdateBody,
  PacientePerfil,
  PacientePerfilUpdateBody,
  Sexo,
} from '../../api/types'
import { useSession } from '../../auth/session'
import { Modal } from '../../components/ui/Modal'
import { PasswordField } from '../../components/ui/PasswordField'

const OPCIONES_ENFERMEDADES: Array<{ valor: EnfermedadPreexistente; etiqueta: string }> = [
  { valor: 'EPOC', etiqueta: 'EPOC' },
  { valor: 'Asma', etiqueta: 'Asma' },
  { valor: 'Lesión Medular', etiqueta: 'Lesión Medular' },
  { valor: 'Fibrosis quística', etiqueta: 'Fibrosis quística' },
  { valor: 'Otra', etiqueta: 'Otra' },
  { valor: 'NS/NC', etiqueta: 'No sabe / no contesta (NS/NC)' },
]

function enfermedadesIniciales(enfermedades: string | null): EnfermedadPreexistente[] {
  if (!enfermedades) return []
  const opciones = new Set(OPCIONES_ENFERMEDADES.map(({ valor }) => valor))
  return enfermedades.split(', ').filter((enfermedad): enfermedad is EnfermedadPreexistente => opciones.has(enfermedad as EnfermedadPreexistente))
}

function Mensaje({ error, exito }: { error: string | null; exito: string | null }) {
  if (error) return <div className="auth-alert error">{error}</div>
  if (exito) return <div className="auth-alert success">{exito}</div>
  return null
}

export function ConfiguracionPage() {
  const { perfil, token } = useSession()
  if (!token || !perfil) return null

  return (
    <section id="contenido-principal" className="card settings-card">
      <Link className="link" to="/">
        ← Volver al inicio
      </Link>
      <h2>Configuración</h2>
      <p className="settings-intro">Actualizá los datos de tu perfil y acceso.</p>
      {perfil.rol === 'medico' ? (
        <ConfiguracionMedico datos={perfil.datos} token={token} />
      ) : (
        <ConfiguracionPaciente datos={perfil.datos} token={token} />
      )}
    </section>
  )
}

function ConfiguracionMedico({ datos, token }: { datos: MedicoPerfil; token: string }) {
  const { refrescarPerfil } = useSession()
  const [nombre, setNombre] = useState(datos.nombre)
  const [apellido, setApellido] = useState(datos.apellido)
  const [usuario, setUsuario] = useState(datos.usuario)
  const [cambiarContrasena, setCambiarContrasena] = useState(false)
  const [confirmarCambio, setConfirmarCambio] = useState(false)
  const [contrasena, setContrasena] = useState('')
  const [contrasena2, setContrasena2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setExito(null)
    if (/\d/.test(nombre) || /\d/.test(apellido)) {
      setError('El nombre y el apellido no pueden contener números.')
      return
    }
    if (cambiarContrasena) {
      if (contrasena.length < 8) {
        setError('La contraseña tiene que tener al menos 8 caracteres.')
        return
      }
      if (contrasena !== contrasena2) {
        setError('Las contraseñas no coinciden.')
        return
      }
    }

    const body: MedicoPerfilUpdateBody = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      usuario: usuario.trim(),
    }
    if (cambiarContrasena) body.nueva_contrasena = contrasena

    setEnviando(true)
    try {
      await api.medico.actualizarPerfil(token, body)
      await refrescarPerfil()
      setContrasena('')
      setContrasena2('')
      setCambiarContrasena(false)
      setExito('Tus datos se guardaron correctamente.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Mensaje error={error} exito={exito} />
      <form onSubmit={onSubmit}>
        <div className="auth-row">
          <div className="field">
            <label htmlFor="config-nombre">Nombre</label>
            <input id="config-nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="config-apellido">Apellido</label>
            <input id="config-apellido" value={apellido} onChange={(event) => setApellido(event.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="config-mail">Mail</label>
          <input id="config-mail" type="email" value={usuario} onChange={(event) => setUsuario(event.target.value)} required />
        </div>

        {cambiarContrasena ? (
          <div className="auth-row">
            <PasswordField
              id="config-contrasena"
              label="Nueva contraseña (mín. 8 caracteres)"
              autoComplete="new-password"
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              required
            />
            <PasswordField
              id="config-contrasena2"
              label="Repetir contraseña"
              autoComplete="new-password"
              value={contrasena2}
              onChange={(event) => setContrasena2(event.target.value)}
              required
            />
          </div>
        ) : (
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setConfirmarCambio(true)}>
            Cambiar contraseña
          </button>
        )}

        <button className="btn btn-teal btn-block" disabled={enviando} type="submit">
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {confirmarCambio && (
        <Modal
          titulo="Cambiar contraseña"
          onClose={() => setConfirmarCambio(false)}
          acciones={
            <>
              <button className="btn btn-outline" onClick={() => setConfirmarCambio(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-teal"
                onClick={() => {
                  setCambiarContrasena(true)
                  setConfirmarCambio(false)
                }}
              >
                Sí, continuar
              </button>
            </>
          }
        >
          <p>¿Seguro/a que quiere cambiar su contraseña?</p>
        </Modal>
      )}
    </>
  )
}

function ConfiguracionPaciente({ datos, token }: { datos: PacientePerfil; token: string }) {
  const { refrescarPerfil } = useSession()
  const [dni, setDni] = useState(datos.dni)
  const [nombre, setNombre] = useState(datos.nombre ?? '')
  const [apellido, setApellido] = useState(datos.apellido ?? '')
  const [email, setEmail] = useState(datos.email ?? '')
  const [altura, setAltura] = useState(String(datos.altura_cm))
  const [peso, setPeso] = useState(String(datos.peso_kg))
  const [nacimiento, setNacimiento] = useState(datos.fecha_nacimiento)
  const [sexo, setSexo] = useState<Sexo>(datos.sexo as Sexo)
  const [fumador, setFumador] = useState(datos.fumador)
  const [enfermedades, setEnfermedades] = useState(enfermedadesIniciales(datos.enfermedades))
  const [cambiarPin, setCambiarPin] = useState(false)
  const [confirmarCambio, setConfirmarCambio] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function cambiarEnfermedad(enfermedad: EnfermedadPreexistente, seleccionada: boolean) {
    setEnfermedades((actuales) =>
      seleccionada ? [...actuales, enfermedad] : actuales.filter((actual) => actual !== enfermedad),
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setExito(null)
    if (/\d/.test(nombre) || /\d/.test(apellido)) {
      setError('El nombre y el apellido no pueden contener números.')
      return
    }
    if (enfermedades.length === 0) {
      setError('Elegí al menos una enfermedad preexistente.')
      return
    }
    if (cambiarPin) {
      if (!/^\d{4}$/.test(pin)) {
        setError('El PIN tiene que ser de 4 dígitos.')
        return
      }
      if (pin !== pin2) {
        setError('Los PIN no coinciden.')
        return
      }
    }

    const body: PacientePerfilUpdateBody = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: email.trim(),
      altura_cm: Number(altura),
      peso_kg: Number(peso),
      fecha_nacimiento: nacimiento,
      sexo,
      fumador,
      enfermedades,
    }
    if (cambiarPin) body.pin = pin

    setEnviando(true)
    try {
      await api.paciente.actualizarPerfil(token, body)
      await refrescarPerfil()
      setPin('')
      setPin2('')
      setCambiarPin(false)
      setExito('Tus datos se guardaron correctamente.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Mensaje error={error} exito={exito} />
      <form onSubmit={onSubmit}>
        <div className="auth-row">
          <div className="field">
            <label htmlFor="config-nombre">Nombre</label>
            <input id="config-nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="config-apellido">Apellido</label>
            <input id="config-apellido" value={apellido} onChange={(event) => setApellido(event.target.value)} required />
          </div>
        </div>
        <div className="auth-row">
          <div className="field">
            <label htmlFor="config-dni">DNI</label>
            <input id="config-dni" inputMode="numeric" value={dni} onChange={(event) => setDni(event.target.value)} disabled required />
            <p className="field-hint">El DNI no se puede modificar.</p>
          </div>
          <div className="field">
            <label htmlFor="config-email">Mail</label>
            <input id="config-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
        </div>
        <div className="auth-row">
          <div className="field">
            <label htmlFor="config-altura">Altura (cm)</label>
            <input id="config-altura" type="number" min="1" max="299" step="0.1" value={altura} onChange={(event) => setAltura(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="config-peso">Peso (kg)</label>
            <input id="config-peso" type="number" min="1" max="499" step="0.1" value={peso} onChange={(event) => setPeso(event.target.value)} required />
          </div>
        </div>
        <div className="auth-row">
          <div className="field">
            <label htmlFor="config-nacimiento">Fecha de nacimiento</label>
            <input id="config-nacimiento" type="date" value={nacimiento} onChange={(event) => setNacimiento(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="config-sexo">Sexo</label>
            <select id="config-sexo" value={sexo} onChange={(event) => setSexo(event.target.value as Sexo)} required>
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
                  onChange={(event) => cambiarEnfermedad(valor, event.target.checked)}
                />
                <span>{etiqueta}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="field-check">
          <input type="checkbox" checked={fumador} onChange={(event) => setFumador(event.target.checked)} />
          <span>Soy fumador/a.</span>
        </label>

        {cambiarPin ? (
          <div className="auth-row">
            <PasswordField
              id="config-pin"
              label="Nuevo PIN (4 dígitos)"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              required
            />
            <PasswordField
              id="config-pin2"
              label="Repetir PIN"
              inputMode="numeric"
              maxLength={4}
              value={pin2}
              onChange={(event) => setPin2(event.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
        ) : (
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setConfirmarCambio(true)}>
            Cambiar PIN
          </button>
        )}

        <button className="btn btn-teal btn-block" disabled={enviando} type="submit">
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {confirmarCambio && (
        <Modal
          titulo="Cambiar PIN"
          onClose={() => setConfirmarCambio(false)}
          acciones={
            <>
              <button className="btn btn-outline" onClick={() => setConfirmarCambio(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-teal"
                onClick={() => {
                  setCambiarPin(true)
                  setConfirmarCambio(false)
                }}
              >
                Sí, continuar
              </button>
            </>
          }
        >
          <p>¿Seguro/a que quiere cambiar su PIN?</p>
        </Modal>
      )}
    </>
  )
}
