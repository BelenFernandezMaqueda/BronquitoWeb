# Bronquito

Plataforma web del dispositivo portátil de entrenamiento y evaluación de músculos
inspiratorios (IMT) "Bronquito" — proyecto de Instrumentación Biomédica.

Monorepo con tres partes:

```
bronquito/
  frontend/     React + TypeScript + Vite (la web que usan pacientes y médicos)
  backend/      Python + FastAPI (la API)
  docker-compose.yml   Levanta frontend + backend + MySQL juntos
```

Si es tu primera vez acá, andá directo a **`DOCKER.md`** — es la forma más rápida de ver
todo funcionando sin instalar Node, Python ni MySQL en tu máquina.

## Arrancar en 3 pasos

```bash
cp .env.example .env
docker compose up --build
```

Después abrí:
- http://localhost:5173 — la web
- http://localhost:8000/docs — la API (documentación interactiva)

Guía detallada, con capturas de qué esperar y solución de problemas comunes, en
`DOCKER.md`.

## Configurar VS Code

1. Abrí la carpeta `bronquito/` (esta, la raíz) como carpeta de proyecto en VS Code —
   `Archivo → Abrir carpeta…`. Al tener `frontend/` y `backend/` adentro, VS Code va a
   poder editar y darte autocompletado en ambos.
2. Al abrir el proyecto, VS Code te va a sugerir instalar un paquete de extensiones
   recomendadas (definidas en `.vscode/extensions.json`) — aceptá esa notificación. Si no
   aparece, andá a la pestaña de Extensiones (ícono de cuadraditos a la izquierda) y
   buscá "@recommended" en la barra de búsqueda. Las principales:
   - **Python** + **Pylance** (Microsoft) — autocompletado y chequeo de tipos en el
     backend.
   - **ESLint** + **Prettier** — lo mismo pero para el frontend en TypeScript/React.
   - **SQLTools** + **SQLTools MySQL/MariaDB Driver** — para ver las tablas de MySQL
     desde adentro de VS Code, sin instalar un programa aparte. La conexión a la base ya
     viene precargada en `.vscode/settings.json` apuntando a `localhost:3306`; sólo te va
     a pedir la contraseña (la que pusiste en tu `.env`) la primera vez que te conectes.
   - **Docker** (Microsoft) — te deja ver y controlar los contenedores desde una pestaña
     lateral, en vez de la terminal.
3. **Si vas a programar el backend en Python** (con o sin Docker corriendo), conviene que
   VS Code use el intérprete de Python correcto: `Ctrl+Shift+P` (o `Cmd+Shift+P` en Mac) →
   escribí "Python: Select Interpreter" → elegí el que esté dentro de
   `backend/.venv` (lo creás siguiendo `backend/README.md`, sección "Correr sin Docker").
   Sin esto, Pylance no va a encontrar `fastapi`, `sqlalchemy`, etc. y te va a marcar todo
   en rojo aunque el código esté bien.

Con esto ya podés editar frontend y backend desde la misma ventana de VS Code, con
autocompletado en los dos, mientras `docker compose up` corre en una terminal aparte (o
en la terminal integrada de VS Code, `` Ctrl+` ``).

## Cómo se relacionan las tres partes

- **`frontend/`** ya usa la API real para **login / registro / recuperación de contraseña
  y PIN** (`frontend/src/api/` + `frontend/src/auth/`). El **dashboard** (vistas paciente y
  médico) todavía usa datos mock (`frontend/src/data/mockData.ts`) — es lo próximo a
  conectar (ver "Próximo paso" abajo).
- **`backend/`** expone esos mismos datos (mismos pacientes, mismos IDs) a través de una
  API REST documentada en `/docs`. Mirá `backend/README.md` para la lista de endpoints.
- **MySQL** guarda todo. Sus datos persisten en un volumen de Docker (`mysql_data`) entre
  reinicios — no se pierden cada vez que apagás los contenedores, salvo que corras
  `docker compose down -v` a propósito. Para **mirar qué hay en las tablas** (por terminal,
  desde VS Code, o con un cliente tipo DBeaver) hay instrucciones en
  `backend/README.md`, sección "Ver los datos de las tablas".

## Próximo paso sugerido: conectar el dashboard a la API

El login ya está conectado (hay cliente HTTP en `frontend/src/api/` y sesión en
`frontend/src/auth/`). Falta el dashboard — a grandes rasgos:

1. Reconciliar `frontend/src/types/index.ts` con los schemas del backend
   (`backend/app/schemas/`): hoy **no coinciden** — el mock tiene `nombre`/`edad`/
   `diagnostico`, el backend tiene `nombre_usuario`/`altura_cm`/`peso_kg`/`fecha_nacimiento`/`sexo`/
   `fumador`.
2. Crear en el backend los endpoints de evaluaciones / entrenamientos / rutina / notas
   médicas (por ahora sólo están las tablas).
3. Reemplazar, una función a la vez, las de `mockData.ts` (`pacientesDeMedico`,
   `evaluacionesDe`, etc.) por llamadas a la API, manejando estados de "cargando"/"error".

## Qué falta para producción (repaso)

- Migraciones de base de datos con Alembic en vez de recrear tablas al arrancar.
- Mandar por mail (no en la respuesta HTTP) el link de "olvidé mi contraseña / PIN".
- Dockerfiles de producción (build optimizado + nginx para el frontend, uvicorn sin
  `--reload` para la API) en vez de los actuales, pensados sólo para desarrollo.
- Sincronización real del dispositivo → base de datos (fuera del alcance de este repo,
  que sólo consume datos ya sincronizados).
