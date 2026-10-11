# Imagen de desarrollo: corre el servidor de Vite con recarga en caliente.
# Pensada para "npm run dev" dentro de un contenedor, no para producción.
FROM node:20-alpine

WORKDIR /app

# Copiamos primero sólo los archivos de dependencias para aprovechar el
# cache de Docker: si no cambiaste package.json, no vuelve a instalar todo.
COPY package.json package-lock.json* ./
RUN npm install

# Ahora sí copiamos el resto del código.
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
