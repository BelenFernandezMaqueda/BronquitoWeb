# Correr Bronquito completo con Docker (guía desde cero)

Esta guía levanta las **tres partes** del proyecto juntas: la web (React), la API
(Python/FastAPI) y la base de datos (MySQL). No hace falta instalar Node, Python ni MySQL
en tu máquina — Docker se encarga de todo eso adentro de contenedores.

## 1. Instalar Docker Desktop (una sola vez)

1. Andá a https://www.docker.com/products/docker-desktop/ y descargá la versión para tu
   sistema operativo.
2. Instalalo como cualquier programa.
3. Abrí **Docker Desktop** y dejalo corriendo en segundo plano (ballenita 🐳 en la barra de
   tareas/menú). Tiene que estar abierto siempre que quieras usar el proyecto.

Verificá la instalación en una terminal:

```bash
docker --version
docker compose version
```

## 2. Configurar las variables de entorno

Desde la carpeta raíz del proyecto (`bronquito/`), copiá el archivo de ejemplo:

```bash
cp .env.example .env
```

Abrí `.env` con VS Code y, si querés, cambiá las contraseñas de ejemplo
(`changeme_root`, `changeme_bronquito`) por otras. Para desarrollo local no es crítico,
pero es buena costumbre. Este archivo `.env` **no se sube a git** (ya está en
`.gitignore`) porque tiene contraseñas.

## 3. Levantar todo

Desde la carpeta raíz (`bronquito/`, la que tiene `docker-compose.yml`):

```bash
docker compose up --build
```

La primera vez tarda varios minutos: Docker descarga las imágenes base (MySQL, Python,
Node), instala las dependencias de Python y de npm, y arranca los tres servicios. Vas a
ver los logs de `db`, `api` y `web` mezclados en la misma terminal, cada uno con su
prefijo de color.

Cuando esté todo arriba vas a poder abrir:

- **http://localhost:5173** → la web (React)
- **http://localhost:8000/docs** → la documentación interactiva de la API (Swagger UI,
  generada sola por FastAPI) — ahí podés probar cada endpoint a mano, sin escribir código
- **localhost:3306** → MySQL, para conectarte con un cliente si querés (ver sección VS
  Code en el README principal)

## 4. Usarlo día a día

- Para levantarlo de nuevo: `docker compose up` (agregá `--build` sólo si cambiaste
  `requirements.txt`, `package.json`, o algún `Dockerfile`).
- Para pararlo: `Ctrl + C` en la terminal donde corre, o `docker compose down` desde otra
  terminal.
- `docker compose down -v` además borra el volumen de MySQL (o sea, borra todos los datos
  guardados en la base). Usalo sólo si querés arrancar de cero.
- Después de editar código, corré `docker compose up --build` para reconstruir las imágenes.
  La configuración evita montar las carpetas locales en los contenedores, así también
  funciona en equipos donde Docker Desktop no puede compartir el proyecto.

## 5. Ver qué hay en la base de datos

La API inserta datos de ejemplo automáticamente la primera vez que se conecta a una base
vacía (mismos pacientes que ves en la web). Para mirarlos directamente:

- **Opción fácil**: instalá la extensión "SQLTools" + "SQLTools MySQL/MariaDB Driver" en
  VS Code (ver README principal) y conectate a `localhost:3306` con el usuario/contraseña
  de tu `.env`.
- **Opción rápida sin instalar nada**: con los contenedores corriendo, en otra terminal:

  ```bash
  docker compose exec db mysql -u bronquito -p bronquito
  ```

  Te va a pedir la contraseña (`MYSQL_PASSWORD` de tu `.env`). Adentro podés correr SQL
  normal, por ejemplo `SHOW TABLES;` o `SELECT * FROM pacientes;`.

## 6. Problemas comunes

- **"Cannot connect to the Docker daemon"**: Docker Desktop no está abierto.
- **El puerto 5173, 8000 o 3306 ya está en uso**: algo más en tu máquina lo está usando.
  Cambiá el puerto izquierdo en el `docker-compose.yml` (por ejemplo `"8001:8000"`) o
  cerrá lo que lo esté ocupando.
- **El servicio `api` se reinicia en loop / no arranca**: mirá sus logs con
  `docker compose logs api` — casi siempre es un error de conexión a MySQL (revisá que
  las variables de `.env` coincidan) o un error de sintaxis en el código Python.
- **Cambié `requirements.txt` o `package.json` y no pasa nada**: hace falta reconstruir la
  imagen: `docker compose up --build`.
- **Windows: "docker compose" no se reconoce**: probá `docker-compose up --build` (con
  guión), es el nombre en versiones más viejas de Docker Desktop.

## ¿Y para producción?

Los `Dockerfile` de `frontend/` y `backend/` están pensados para desarrollo (recarga en
caliente). Para desplegar de verdad conviene: (a) un build de producción del frontend
servido por nginx en vez de Vite dev server, (b) uvicorn sin `--reload` (o gunicorn +
uvicorn workers) para la API, y (c) una base de datos MySQL gestionada en vez de un
contenedor con volumen local. Si llegás a esa etapa, avisame y lo armamos.
