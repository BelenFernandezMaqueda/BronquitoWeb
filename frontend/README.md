# Bronquito — Plataforma web (demo funcional)

Aplicación web de **Bronquito**, dispositivo portátil de entrenamiento y evaluación de
músculos inspiratorios (IMT), para el proyecto de Instrumentación Biomédica. Construida
con **React + TypeScript + Vite**, respetando la identidad visual del mockup original
(paleta cian/rosa/amarillo, tipografía Baloo 2 + Nunito, motivo de olas y patito).

**Estado:** el **login / registro / recuperación** ya usa la API real
(`backend/`, ver `../backend/README.md`). El **dashboard** (vista paciente y vista médico)
todavía usa datos mock (`src/data/mockData.ts`) — es lo próximo a conectar.

## Cómo correrla

Lo más simple es levantar todo el monorepo con Docker desde la raíz (`docker compose up`,
ver `../DOCKER.md`) — eso te da frontend + API + MySQL juntos, que es lo que necesitás para
que el login funcione.

Para correr sólo el frontend en tu máquina (necesitás la API corriendo aparte en
`http://localhost:8000`):

```bash
npm install
npm run dev      # entorno de desarrollo, con recarga en caliente
npm run build    # build de producción (chequea tipos con tsc y luego empaqueta)
npm run preview  # sirve el build de producción para revisarlo
```

La URL de la API se lee de `VITE_API_URL` (default `http://localhost:8000`); el
`docker-compose.yml` de la raíz ya la setea.

## Cómo correrla con Docker

Este proyecto ahora es parte de un monorepo (`bronquito/`) que también incluye el backend
en Python y MySQL. El `docker-compose.yml` que levanta las tres partes juntas (frontend,
API y base de datos) está en la **raíz** del repo, no acá — ver `../README.md` y
`../DOCKER.md`. Este `Dockerfile` local se sigue usando (el compose de la raíz lo referencia
con `build: ./frontend`), pero ya no hace falta correr `docker compose` desde esta carpeta.

Requiere Node 18+. Las dependencias son las típicas de un proyecto Vite + React (ver
`package.json`): `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript` y sus
`@types`. Al ser un proyecto chico armado a mano (sin poder correr el scaffolding oficial
de Vite ni el compilador acá), es buena idea que la primera vez que lo abras corras
`npm run build` para que TypeScript valide todo el código antes de seguir iterando.

## Estructura

```
src/
  api/
    types.ts               Tipos de request/response de la API (sync con backend/app/schemas).
    client.ts              Cliente HTTP mínimo (fetch) + todas las funciones de auth
                           (api.medico.login, api.paciente.registro, etc.).
  auth/
    session.tsx            <SessionProvider> + useSession(): guarda el token JWT en
                           localStorage, trae el perfil del logueado, expone
                           iniciarSesion / cerrarSesion / refrescarPerfil.
  types/index.ts          Modelo de datos del dashboard (todavía mock).
  data/mockData.ts         Datos mock + funciones derivadas (racha, adherencia, resumen
                           de progreso, filtrar pacientes de un médico, etc.). Es la única
                           "capa de datos" de la app: el día que haya backend, alcanza con
                           reemplazar estas funciones por llamadas a la API sin tocar los
                           componentes.
  styles/theme.css          Variables de color/tipografía y todas las clases visuales,
                           portadas del mockup HTML y ampliadas para los componentes nuevos.
  components/
    layout/Header.tsx       Header con olas, logo, usuario logueado y botón "Salir".
    ui/                     Piezas reutilizables: DuckLogo, WaveBottom, Modal, StatCard,
                           Badge (estado de sesión / adherencia), MonthCalendar,
                           FlowVolumeChart, PimTrendChart y DeviceSessionModal (simulador
                           del flujo "operar el dispositivo": conectando → sesión en curso
                           → resultado).
  pages/
    auth/
      AuthShell.tsx         Marco compartido (patito + tarjeta centrada) de las pantallas de auth.
      LoginPage.tsx         Login con pestañas paciente (usuario+PIN) / médico (mail+contraseña).
      RegistroMedicoPage.tsx    Alta de médico.
      RegistroPacientePage.tsx  Alta de paciente desde la web (nombre + nombre de usuario +
                           PIN + mail + datos clínicos).
      RecuperarPage.tsx     "Olvidé mi PIN / contraseña" — pide el link de reseteo.
      ResetearPage.tsx      Setea el nuevo PIN o contraseña con el token del link (?token=).
    paciente/
    paciente/PatientDashboard.tsx   Vista paciente: hero + botón "iniciar sesión de hoy",
                           3 stat cards, racha semanal, sesiones recientes, calendario
                           completo e historial (como sub-vistas dentro de la misma página).
    medico/
      DoctorView.tsx        Arma el layout de dos columnas (lista + detalle).
      PatientListPanel.tsx  Buscador + lista de pacientes con adherencia + invitar paciente.
      InvitePatientModal.tsx Flujo de alta de paciente (solicitud pendiente de aceptación).
      PatientDetail.tsx     Tabs Evaluaciones / Entrenamiento / Calendario + botones para
                           iniciar evaluación/entrenamiento "en consultorio".
      FrequencyModal.tsx    Modal para modificar manualmente la frecuencia recomendada.
  App.tsx                    Rutas (react-router-dom) + guards: SoloAnonimos / SoloAutenticados,
                           y el dashboard según rol.
  main.tsx                   Punto de entrada: <BrowserRouter> + <SessionProvider> + <App>.
```

## Decisiones de diseño

- **Login real con la API.** El toggle de rol del mockup se reemplazó por sesión
  autenticada: el rol sale del token JWT (`src/auth/session.tsx`). El token se guarda en
  `localStorage` para sobrevivir un refresh; al abrir la app se revalida trayendo el perfil.
- **React Router (v6).** Se sumó `react-router-dom` para tener URLs reales — clave para el
  link de reseteo que llega por mail (`/resetear/pin?token=...`). El servidor de Vite ya
  hace el fallback a `index.html`; un deploy de producción con nginx necesita esa misma
  regla.
- **El link de reseteo llega por mail.** `RecuperarPage` sólo confirma "revisá tu casilla";
  el backend manda el mail con el link a `/resetear/{pin,contrasena}?token=...` por Gmail
  (ver `backend/README.md`, sección "Mails").
- **Datos mock centralizados en `mockData.ts`.** Todas las pantallas leen de ahí a través
  de funciones (`pacientesDeMedico`, `evaluacionesDe`, `resumenProgresoDe`, etc.) en vez
  de tener los datos hardcodeados en cada componente. Esas funciones son el punto exacto
  donde después se conecta el fetch a la API real.
- **"Iniciar sesión" / "Iniciar en consultorio" son simulaciones visuales.** El
  `DeviceSessionModal` simula el paso de "conectando → sesión en curso → resultado" con
  timers cortos, para poder mostrar el flujo sin hardware real. Los datos que se
  sincronizan de verdad desde el dispositivo (offline → wifi → base de datos) quedan fuera del alcance de esta web.
- **Vínculo médico-paciente explícito.** `pacientesDeMedico()` sólo devuelve pacientes con
  un vínculo en estado `aceptada`; hay además una invitación en estado `pendiente` mockeada
  para mostrar cómo se ve mientras el paciente todavía no aceptó.

## Qué falta

- **Conectar el dashboard a la API.** `mockData.ts` sigue siendo la capa de datos de las
  vistas paciente/médico (el Header y el saludo "Hola X" ya usan la sesión real; el resto
  no). Falta: reconciliar `src/types/index.ts` con los schemas del backend (el mock tiene
  `edad`/`diagnostico`/`resistenciaActual`; el backend tiene
  `nombre_usuario`/`nombre`/`apellido`/`email`/`altura_cm`/`peso_kg`/...), y crear los endpoints de
  evaluaciones / entrenamientos / rutina / notas que todavía no existen.
- Persistencia real de acciones que hoy sólo cambian estado en memoria: enviar invitación,
  modificar frecuencia, resultado de una sesión en consultorio.
- Vincular un paciente desde la vista médico usando `POST /medicos/me/vincular` (hoy el
  `InvitePatientModal` es sólo visual).
- Cambiar el PIN estando logueado (hoy sólo vía "olvidé mi PIN").
- Config de nginx con fallback a `index.html` para el deploy de producción.
- Tests.
