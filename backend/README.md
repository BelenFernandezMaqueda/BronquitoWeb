# Bronquito API (FastAPI + MySQL)

Backend de la plataforma Bronquito. Modela las 9 tablas del documento de arquitectura
(pacientes, médicos, vínculo médico-paciente, evaluaciones, entrenamientos, rutina activa,
notas médicas) y expone login real:

- **Médicos**: se registran con mail + contraseña (y nombre y apellido) o inician sesión.
- **Pacientes**: se registran con varios datos: usuario,  PIN de 4 dígitos, altura, peso, condiciones preexistentes, etc o puede iniciar sesión.  
- El vínculo con un médico se crea siempre después, desde la cuenta del
  médico — nunca al registrarse.

Recuperar la credencial ("olvidé mi contraseña" del médico / "olvidé mi PIN" del paciente)
usa el mismo mecanismo de token para los dos roles.

## Estructura

```
app/
  main.py             Arranca FastAPI, configura CORS, crea las tablas y carga datos
                       de ejemplo al iniciar.
  seed.py              Datos de ejemplo — un médico y tres pacientes de prueba, con
                       credenciales documentadas ahí mismo para poder probar el login.
  core/
    config.py          Lee la configuración (MySQL, CORS, JWT, SMTP) desde variables
                        de entorno / .env.
    database.py         Motor de SQLAlchemy + sesión por request.
    security.py          Hashing de contraseñas/PIN (bcrypt) + creación/lectura de
                        tokens de sesión (JWT). Acá vive toda la lógica de "probar
                        quién sos".
    email.py             Envío de mails (smtplib), por Gmail. Ver sección "Mails" abajo.
    email_templates.py   El HTML de los mails, con la estética de la web (patito,
                        colores teal, botón pill). Tablas + estilos inline.
    deps.py               Dependencias de FastAPI (`get_current_medico`,
                        `get_current_paciente`) para proteger endpoints con un token.
  models/                Modelos de SQLAlchemy (una clase = una tabla).
  schemas/               Modelos de Pydantic: qué forma tiene lo que la API recibe y
                        devuelve. Sirven además para que FastAPI valide automáticamente
                        los requests (por ejemplo, que el PIN tenga 4 dígitos).
  routers/
    auth.py               Médico: registro, login, olvidé contraseña / resetearla.
                        Paciente: registro web, login (nombre de usuario + PIN),
                        olvidé PIN / resetearlo.
    medicos.py             Perfil del médico logueado, sus pacientes vinculados,
                        vincular un paciente existente por nombre de usuario + PIN.
    pacientes.py            Perfil y edición de datos del paciente logueado
                        mediante `PATCH /pacientes/me`.
```

## Las 9 tablas (y qué clase de Python es cada una)

| Tabla MySQL | Clase Python | Archivo |
|---|---|---|
| `usuarios` | `Paciente` | `models/paciente.py` |
| `medicos` | `Medico` | `models/medico.py` |
| `medico_paciente` | `MedicoPaciente` | `models/medico_paciente.py` |
| `evaluaciones` | `Evaluacion` | `models/evaluacion.py` |
| `evaluaciones_muestras` | `EvaluacionMuestra` | `models/evaluacion.py` |
| `entrenamientos` | `Entrenamiento` | `models/entrenamiento.py` |
| `entrenamientos_graficar` | `EntrenamientoGraficar` | `models/entrenamiento.py` |
| `rutina` | `Rutina` | `models/rutina.py` |
| `notas_medicas` | `NotaMedica` | `models/nota_medica.py` |

La tabla de pacientes se llama `usuarios` en MySQL (así la nombraron en el documento de
arquitectura) pero la clase de Python se llama `Paciente`, más claro para el resto del
código — es lo que dice `__tablename__ = "usuarios"` arriba de la clase.

## Ver los datos de las tablas

Con el stack levantado (`docker compose up`), hay tres formas:

### 1. Desde la terminal, rápido

`docker compose exec` entra al contenedor de MySQL y corre una consulta:

```bash
# Todos los pacientes y todos los médicos
docker compose exec db mysql --default-character-set=utf8mb4 \
  -ubronquito -pchangeme_bronquito bronquito -e \
  "SELECT id_paciente,nombre,apellido,nombre_usuario,email FROM usuarios;
   SELECT id_medico,nombre,apellido,usuario FROM medicos;"
```

Cambiá `changeme_bronquito` por tu `MYSQL_PASSWORD` real del `.env`. El
`--default-character-set=utf8mb4` es para que los acentos no salgan como `Bel�n`.

Para una sesión interactiva (escribir varias consultas):

```bash
docker compose exec db mysql --default-character-set=utf8mb4 -ubronquito -pchangeme_bronquito bronquito
# ahí adentro:  SHOW TABLES;   DESCRIBE usuarios;   SELECT * FROM rutina;   exit
```

### 2. Desde VS Code (SQLTools)

La conexión ya viene precargada en `.vscode/settings.json` apuntando a `localhost:3306`.
Instalá las extensiones **SQLTools** + **SQLTools MySQL/MariaDB Driver** (están en las
recomendadas), abrí el ícono de SQLTools en la barra lateral, conectá, y te pide la
contraseña (la de `MYSQL_PASSWORD`) sólo la primera vez. Después navegás las tablas con el
mouse y podés correr consultas en un panel.

### 3. Desde un cliente externo (DBeaver, TablePlus, etc.)

MySQL está expuesto en `localhost:3306` mientras Docker corre. Datos de conexión:

| | |
|---|---|
| Host | `localhost` |
| Puerto | `3306` |
| Base | `bronquito` (= `MYSQL_DATABASE`) |
| Usuario | `bronquito` (= `MYSQL_USER`) |
| Contraseña | la de `MYSQL_PASSWORD` en tu `.env` |

> Recordá: la tabla de pacientes se llama **`usuarios`**, no `pacientes`.

## ⚠️ Si ya habías levantado el proyecto antes de este cambio

Las tablas `usuarios` y `medicos` sumaron columnas (`usuarios`: `nombre`, `apellido`,
`email`, `enfermedades`, `acepto_terminos`, `fecha_aceptacion_terminos`, `reset_token`,
`reset_token_expira`; `medicos`: `nombre`, `apellido`, y los mismos de reset/términos).
Además, en `usuarios` la columna `dni` se reemplazó por `nombre_usuario`: si la base es
de antes de ese cambio, la API no arranca y lo avisa en el log.
Como `create_all()` sólo crea tablas que no existen — no actualiza las que ya existen —
necesitás borrar la base vieja una vez antes de levantar de nuevo:

```bash
docker compose down -v
docker compose up --build
```

El `-v` borra también el volumen de MySQL (los datos guardados). Como hasta ahora sólo
había datos de prueba, no se pierde nada real.

## Credenciales de prueba (cargadas por seed.py)

**Médico:** `belen.fernandez@bronquito.app` / `medico1234` (Belén Fernández)

**Pacientes (nombre de usuario / PIN):**

- `malena` / `1234` — Malena Salerno, perfil completo (con nombre y mail)
- `tomas` / `5678` — Tomás Herrera, perfil completo (con nombre y mail)
- `rocio` / `4321` — Rocío Fernández, perfil completo (con nombre y mail)

## Probar el login desde /docs

1. Entrá a http://localhost:8000/docs
2. Abrí `POST /auth/medicos/login`, "Try it out", pegá el usuario/contraseña de arriba,
   "Execute". La respuesta trae un `access_token`.
3. Para probar un endpoint protegido (por ejemplo `GET /medicos/me`), hacé clic en el
   botón verde "Authorize" arriba a la derecha de toda la página, pegá ahí el
   `access_token` que te devolvió el login, y confirmá. A partir de ahí, todos los
   endpoints protegidos que pruebes desde /docs van a mandar ese token solos.

## Correr en Docker (recomendado)

Ver `../DOCKER.md` en la raíz del repo.

## Correr sin Docker (si querés depurar el backend solo)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # completá según tu MySQL local
uvicorn app.main:app --reload
```

## Mails

`app/core/email.py` manda los mails (verificación de dirección, recuperar contraseña/PIN)
con `smtplib` — sin dependencias extra. Se manda por Gmail con una cuenta dedicada al
proyecto, configurada con las variables `SMTP_*` del `.env` (ver `../.env.example`):

- Completás `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_STARTTLS` /
  `EMAIL_FROM` en el `.env` con los datos de la cuenta de Gmail (usuario + "App Password").
  El `.env.example` trae la guía paso a paso.
- `EMAIL_ENABLED=false` apaga el envío: `enviar_email` sólo loguea lo que hubiera mandado
  (útil para no gastar la cuenta real mientras probás cosas que no dependen del mail).

`enviar_email` está pensada para llamarse desde un `BackgroundTasks` de FastAPI, así la
respuesta HTTP no espera al SMTP. Si el envío falla, queda en los logs y no rompe el
request. El HTML lo arma `app/core/email_templates.py` con la estética de la web (el
patito viaja embebido en el mail como imagen inline, no depende de un servidor externo).

**Ya enchufado:** "olvidé mi contraseña / PIN" manda un mail real con el link
`FRONTEND_URL/resetear/{contrasena,pin}?token=...`. La respuesta HTTP ya no devuelve el
token (antes había un `reset_token_dev` de dev — se eliminó).

Probar el envío a mano (con el stack levantado):

```bash
docker compose exec api python -c "from app.core.email import enviar_email; \
enviar_email(destinatario='test@x.com', asunto='Prueba', html='<p>Hola</p>')"
```

## Decisiones a propósito (para que no parezcan olvidos)

- **El paciente se identifica con un nombre de usuario, no con su DNI.** Sólo letras
  a-z y ñ (sin números, tildes, espacios ni caracteres especiales), de 4 a 25, y único.
  No distingue mayúsculas: se guarda siempre en minúscula (`Malena` → `malena`), así que
  al loguearse da igual cómo lo escriba. Lo puede cambiar después desde Configuración.
  La columna `usuarios.nombre_usuario` usa collation `utf8mb4_bin` para que MySQL no
  trate `nino` y `niño` como el mismo usuario.
- **No hay bloqueo de cuenta por intentos fallidos** (ni de PIN ni de contraseña) — lo
  charlamos y se decidió no incluirlo en esta primera versión.
- **Los pacientes se registran directamente desde la página web, nunca vía un médico.**
  El propio paciente se registra desde la web. El médico sólo puede vincularse a un paciente que ya existe ingresando el usuario y el PIN del paciente. 
- **"Olvidé mi contraseña / PIN" manda el link por mail** (branded, ver sección "Mails")
  en un `BackgroundTask`. La respuesta HTTP es siempre el mismo mensaje genérico ("si la
  cuenta existe...") y nunca incluye el token — no se puede usar este endpoint para
  averiguar qué mails/usuarios están registrados.
- **El paciente puede identificarse por mail o por nombre de usuario** al pedir el reset de PIN; el médico
  siempre por mail. El mecanismo interno (token, vencimiento) es el mismo.
- **La vinculación médico-paciente es directa** (usuario + PIN del paciente + botón "Vincular"), sin
  paso de aceptación por parte del paciente — así lo definieron para esta versión.

## Qué falta (para las próximas etapas, no de esta)

- Endpoints de evaluaciones, entrenamientos, rutina y notas médicas (hoy sólo están las
  tablas y el login; leer/crear esos registros es el siguiente paso).
- Migraciones con Alembic en vez de `create_all()` (relevante recién cuando haya datos
  reales que no se puedan simplemente borrar y recrear).
- Cambiar el PIN desde la vista de paciente estando logueado (hoy sólo se puede vía el
  flujo de "olvidé mi PIN"). Editar el perfil ya está (`PATCH /pacientes/me`).
- **Verificación de la dirección de mail** (columna `email_verificado` + token + endpoints
  `verificar-email` / `reenviar-verificacion` + página en el front). La infra de envío
  (`app/core/email.py` + `email_templates.py`) ya está lista y probada con el flujo de reset.
- Que el paciente y el médico también puedan resetear con el mismo endpoint unificado (hoy
  son dos rutas paralelas que comparten la lógica interna).
