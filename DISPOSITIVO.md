# Conexión ESP32 ↔ web

Contrato entre el firmware de la ESP32 y el backend de Bronquito: qué mensajes existen,
cómo se mandan, qué se recibe en cada caso y cómo se configura un paciente nuevo.

Código del servidor:

| Archivo | Qué tiene |
|---|---|
| `backend/app/routers/dispositivo.py` | Endpoints que llama la ESP (`/dispositivo/...`) |
| `backend/app/routers/dispositivo_medico.py` | Lo que usa la web del médico (`/medicos/me/dispositivo/...`) |
| `backend/app/routers/dispositivo_paciente.py` | Lo que ve el paciente (`/pacientes/me/dispositivo`) |
| `backend/app/models/dispositivo.py` | Tablas `dispositivo`, `solicitudes_dispositivo`, `registro_sync` |
| `backend/app/core/dispositivo.py` | Clave del dispositivo, armado del perfil, IP de la red local |

---

## 1. Ideas generales

- **La ESP siempre inicia.** Es un cliente HTTP: la web nunca la llama. Lo que la web
  quiere pedirle queda guardado en una **cola de solicitudes** y la ESP la retira
  cuando sincroniza.
- **Sincroniza en momentos puntuales:** al arrancar, al tocar "Sincronizar", al terminar
  un ejercicio. No hay latido periódico.
- **Cada solicitud se acepta o rechaza en la pantalla** (ACEPTAR / RECHAZAR) y la ESP
  avisa al servidor qué pasó.
- **El PIN nunca viaja del servidor a la ESP.** La ESP se lo pide al paciente y el
  servidor sólo dice si coincide.
- **Sin acentos ni ñ** en ningún texto que viaja a la ESP (la pantalla no los dibuja).
  El servidor ya los saca: "Tomás" llega como "Tomas".
- **Sin `/api`** en las rutas: `/dispositivo/...`.

---

## 2. Conectarse al servidor

### URL base

Una sola variable en el firmware.

| Etapa | URL base |
|---|---|
| Hoy (servidor en una compu, red local) | `http://<prefijo-de-la-red><codigo>:8000` (ej. `http://192.168.0.186:8000`) |
| Producto final (nube) | `https://<dominio>` (fija, sin código) |

**El código** es el último número de la IP de la compu. La ESP completa sola el
principio con el de su propia red (si la ESP es `192.168.0.42`, propone `192.168.0.`)
y el usuario sólo tipea el código.

- Dónde se ve el código: en la web, **Conectar a dispositivo** (médico) o
  **Sincronizar dispositivo** (paciente).
- La compu tiene que levantar Bronquito con `./levantar.sh` (no con
  `docker compose up`): desde adentro de Docker no se puede averiguar la IP de la compu,
  así que el script la detecta y la mantiene actualizada si se cambia de red.
- La compu y la ESP tienen que estar en la **misma red WiFi**. Las redes de la facultad
  suelen bloquear la comunicación entre equipos: usar el hotspot del celu.
- El código **no** es un código de seguridad (eso es la clave del dispositivo).
- El puerto es **8000** (el 8001 y `GET /ping` eran del servidor de prueba y ya no se usan).

### Clave del dispositivo

Todos los pedidos llevan el header:

```
X-Device-Key: <clave>
```

La clave es la variable `DEVICE_API_KEY` del `.env` del servidor. Si se guarda en la
SD, un formateo (RESET) no la tiene que borrar. Se pasa por privado, nunca en el repo
ni en un grupo.

### Probar la conexión

`POST /dispositivo/identificar`:

| Resultado | Significa |
|---|---|
| 200 | Conexión y clave OK |
| 401 `clave_invalida` | Llega a la compu pero la clave está mal |
| 503 `dispositivo_no_configurado` | El servidor no tiene `DEVICE_API_KEY` |
| Sin respuesta / timeout | Código mal, otra red, o el servidor no está levantado |

---

## 3. Cómo mandar y recibir mensajes

### Mandar

Todos los mensajes son HTTP con JSON en UTF-8.

| | GET | POST |
|---|---|---|
| Headers | `X-Device-Key` | `X-Device-Key`, `Content-Type: application/json` |
| Body | ninguno | un objeto JSON |

Pedido crudo, tal como sale de la ESP:

```http
POST /dispositivo/identificar HTTP/1.1
Host: 192.168.0.186:8000
X-Device-Key: <clave>
Content-Type: application/json
Content-Length: 60

{"vacia":true,"usuario_actual":null,"archivos_pendientes":0}
```

### Recibir

Siempre llega un objeto JSON. Primero mirar el **código HTTP**, después el cuerpo:

- **2xx** → `{"ok": true, ...}` con los datos del endpoint.
- **4xx / 5xx** → `{"ok": false, "error": "<codigo>"}`. El `error` es un texto corto
  en minúscula, sin acentos, pensado para que el firmware decida qué hacer (no para
  mostrarlo tal cual).

### Catálogo de errores

| HTTP | `error` | Endpoint | Qué hacer en la ESP |
|---|---|---|---|
| 400 | `datos_invalidos` | todos los POST | Bug del firmware: JSON mal armado o campo con tipo incorrecto |
| 401 | `clave_invalida` | todos | Revisar la clave del dispositivo |
| 401 | `pin_incorrecto` | `verificar-pin` | Mostrar "PIN incorrecto" y volver a pedirlo (sin límite) |
| 404 | `solicitud_inexistente` | `confirmar` | Descartar esa solicitud y seguir |
| 404 | `sin_paciente_asignado` | `verificar-pin` | El médico le sacó el paciente: volver a sincronizar |
| 404 | `usuario_no_asignado` | `verificar-pin` | El usuario no es el asignado: volver a sincronizar |
| 503 | `dispositivo_no_configurado` | todos | Avisar: falta configurar el servidor |

### Ejemplo en C++ (HTTPClient + ArduinoJson v7)

```cpp
#include <HTTPClient.h>
#include <ArduinoJson.h>

String urlBase;                    // ej. "http://192.168.0.186:8000"
const char *CLAVE = "...";         // X-Device-Key

// Manda un pedido y deja la respuesta en `resp`. Devuelve el código HTTP
// (o un número negativo si no hubo conexión).
int pedir(const char *metodo, const String &ruta, JsonDocument *body, JsonDocument &resp) {
  HTTPClient http;
  http.begin(urlBase + ruta);
  http.setTimeout(8000);
  http.addHeader("X-Device-Key", CLAVE);

  int codigo;
  if (strcmp(metodo, "POST") == 0) {
    http.addHeader("Content-Type", "application/json");
    String texto;
    if (body) serializeJson(*body, texto); else texto = "{}";
    codigo = http.POST(texto);
  } else {
    codigo = http.GET();
  }

  if (codigo > 0) {
    DeserializationError err = deserializeJson(resp, http.getStream());
    if (err) codigo = -100;        // respuesta que no es JSON
  }
  http.end();
  return codigo;
}

// Uso: identificar
bool identificar(bool vacia, const char *usuarioActual, int pendientes) {
  JsonDocument body;
  body["vacia"] = vacia;
  if (usuarioActual) body["usuario_actual"] = usuarioActual;
  else body["usuario_actual"] = nullptr;
  body["archivos_pendientes"] = pendientes;

  JsonDocument resp;
  int codigo = pedir("POST", "/dispositivo/identificar", &body, resp);
  if (codigo != 200) {
    Serial.printf("identificar: HTTP %d error=%s\n", codigo, resp["error"] | "sin_respuesta");
    return false;
  }
  long epoch = resp["epoch"];
  int offset = resp["offset_minutos"];
  int pendientesServidor = resp["solicitudes_pendientes"];
  const char *usuario = resp["usuario"];          // puede ser null
  const char *pinVersion = resp["pin_version"];   // puede ser null
  // ... poner en hora el reloj con epoch + offset * 60, etc.
  return true;
}
```

---

## 4. Flujo de una sincronización

```
ESP                                              Servidor
 |  POST /dispositivo/identificar  ------------>  |  guarda estado, devuelve hora
 |  <------------  epoch, solicitudes_pendientes  |
 |                                                |
 |  (si pin_version cambió) POST verificar-pin -> |
 |                                                |
 |  GET /dispositivo/solicitudes  ------------->  |  PENDIENTE -> ENTREGADA
 |  <------------------------  [solicitudes...]   |
 |                                                |
 |  pantalla: ACEPTAR / RECHAZAR                  |
 |  POST /dispositivo/solicitudes/{id}/confirmar  |  -> CONFIRMADA / RECHAZADA / ERROR
 |                                                |
 |  (repetir GET solicitudes hasta lista vacía)   |
```

1. `POST /dispositivo/identificar` → poner en hora el reloj; ver si hay solicitudes.
2. Si el `usuario` devuelto es el mismo que tiene la SD pero el `pin_version` es
   distinto, cambiaron el PIN desde la web: pedir el PIN nuevo y validarlo con
   `POST /dispositivo/verificar-pin`.
3. `GET /dispositivo/solicitudes` → la cola, en orden.
4. Por cada solicitud, en orden: mostrar ACEPTAR / RECHAZAR, aplicarla si se acepta y
   avisar con `POST /dispositivo/solicitudes/{id}/confirmar`.
5. Volver al paso 3 hasta que la lista venga vacía. (Confirmar un RESET de "cambiar
   usuario" genera en ese momento el CARGAR_PERFIL siguiente.)

**Cortes de luz:** si se apaga con una solicitud en pantalla sin responder, el servidor
la vuelve a mandar en la próxima sincronización. **Confirmar dos veces** la misma
solicitud no tiene efecto (devuelve 200 con el estado que ya tenía).

---

## 5. Endpoints de la ESP

### 5.1 `POST /dispositivo/identificar`

La ESP cuenta cómo está. El servidor lo guarda (lo ve el médico en la web) y devuelve
la hora y lo que hay pendiente.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `vacia` | bool | sí | `true` si no hay `perfil.json` en la SD |
| `usuario_actual` | string o null | no (default null) | El `usuario` del `perfil.json`; null si está vacía |
| `archivos_pendientes` | int ≥ 0 | no (default 0) | Cantidad de pruebas con `sincronizado=false` |

```json
{"vacia": false, "usuario_actual": "msalerno", "archivos_pendientes": 2}
```

**200**

| Campo | Tipo | Descripción |
|---|---|---|
| `ok` | bool | Siempre `true` |
| `epoch` | int | Segundos UTC de ahora |
| `offset_minutos` | int | Diferencia con UTC (Argentina: `-180`). Hora local = `epoch + offset_minutos * 60` |
| `solicitudes_pendientes` | int | Cuántas solicitudes hay para retirar (PENDIENTE + ENTREGADA sin responder) |
| `usuario` | string o null | Usuario del paciente asignado al dispositivo; null si no hay |
| `pin_version` | string o null | Huella del PIN actual de ese paciente (12 caracteres hex); null si no hay paciente |

```json
{
  "ok": true,
  "epoch": 1791817820,
  "offset_minutos": -180,
  "solicitudes_pendientes": 1,
  "usuario": "msalerno",
  "pin_version": "3f913f671e7c"
}
```

Dispositivo sin paciente asignado:

```json
{"ok": true, "epoch": 1791817820, "offset_minutos": -180, "solicitudes_pendientes": 0, "usuario": null, "pin_version": null}
```

**Errores:** 400 `datos_invalidos`, 401 `clave_invalida`, 503 `dispositivo_no_configurado`.

`identificar` **no** trae el perfil: el perfil llega siempre como solicitud
CARGAR_PERFIL.

### 5.2 `GET /dispositivo/solicitudes`

Devuelve, en orden, lo que la ESP tiene que responder: las nuevas (PENDIENTE, que pasan
a ENTREGADA) y las que ya retiró pero nunca contestó (ENTREGADA).

**Sin body.**

**200**

| Campo | Tipo | Descripción |
|---|---|---|
| `ok` | bool | Siempre `true` |
| `solicitudes` | lista | Puede venir vacía |
| `solicitudes[].id` | int | Lo que va en la URL de `confirmar` |
| `solicitudes[].tipo` | string | `RESET` o `CARGAR_PERFIL` (más adelante `RUTINA`) |
| `solicitudes[].payload` | objeto | Depende del tipo (ver abajo) |

Nada pendiente:

```json
{"ok": true, "solicitudes": []}
```

#### Tipo `RESET` (formatear)

```json
{"ok": true, "solicitudes": [{"id": 3, "tipo": "RESET", "payload": {}}]}
```

`payload` vacío. Al aceptar, la ESP:

1. Si hay pruebas con `sincronizado=false` → **no borra nada** y confirma
   `{"ok": false, "detalle": "archivos_pendientes"}`.
2. Si no → borra `perfil.json`, `CONFIGURACION.JSON` y los archivos de `EVALUACIONES/`
   y `ENTRENAMIENTOS/`. **No** borra la clave del dispositivo.
3. Confirma `{"ok": true}`.
4. Desde ahí, `identificar` manda `"vacia": true`.

Es seguro repetirlo: si se corta la luz a mitad, el servidor lo reenvía y la ESP lo
vuelve a aplicar.

#### Tipo `CARGAR_PERFIL`

```json
{
  "ok": true,
  "solicitudes": [
    {
      "id": 4,
      "tipo": "CARGAR_PERFIL",
      "payload": {
        "perfil": {
          "usuario": "therrera",
          "nombre": "Tomas",
          "apellido": "Herrera",
          "pin_version": "06384859c242",
          "sexo": "M",
          "altura": "178",
          "peso": "82.5",
          "fumador": "n",
          "nacimiento": "14/03/1998",
          "registro": "01/06/2026",
          "enfermedad": "EPOC,Asma"
        }
      }
    }
  ]
}
```

Campos de `payload.perfil` (**todos texto**):

| Campo | Formato | Ejemplo | Notas |
|---|---|---|---|
| `usuario` | a-z, 4 a 25 letras | `therrera` | Identifica al paciente. Sin ñ ni números |
| `nombre` | texto sin acentos | `Tomas` | Puede venir `""` |
| `apellido` | texto sin acentos | `Herrera` | Puede venir `""` |
| `pin_version` | 12 caracteres hex | `06384859c242` | Guardarlo junto al PIN; si cambia, pedir el PIN de nuevo |
| `sexo` | `F`, `M` o `X` | `M` | Hoy la ESP sólo lo guarda |
| `altura` | número en cm | `178`, `171.5` | Punto decimal sólo si lo tiene |
| `peso` | número en kg | `82.5` | Punto decimal sólo si lo tiene |
| `fumador` | `s` o `n` | `n` | |
| `nacimiento` | `dd/mm/aaaa` | `14/03/1998` | |
| `registro` | `dd/mm/aaaa` | `01/06/2026` | Fecha de alta en la web |
| `enfermedad` | separadas por coma, sin espacios | `EPOC,Asma` | Puede venir `""`. Valores: `EPOC`, `Asma`, `Lesion Medular`, `Fibrosis quistica`, `Otra`, `NS/NC` |

**No trae PIN.** Al aceptar, la ESP guarda el perfil, le pide el PIN al paciente y lo
valida con `verificar-pin` (ver 5.4) antes de confirmar.

#### RESET seguido de CARGAR_PERFIL ("cambiar usuario")

No llegan juntos: el CARGAR_PERFIL se crea **recién cuando la ESP confirma el RESET con
`ok=true`**. Así nunca puede llegar antes. Secuencia:

```
GET  /dispositivo/solicitudes               -> [{"id": 3, "tipo": "RESET", "payload": {}}]
     (pantalla: ACEPTAR, se borra la SD)
POST /dispositivo/solicitudes/3/confirmar      {"ok": true}
GET  /dispositivo/solicitudes               -> [{"id": 4, "tipo": "CARGAR_PERFIL", "payload": {"perfil": {...}}}]
     (pantalla: ACEPTAR, se guarda el perfil, se pide el PIN)
POST /dispositivo/verificar-pin                {"usuario": "therrera", "pin": "5678"}
POST /dispositivo/solicitudes/4/confirmar      {"ok": true}
GET  /dispositivo/solicitudes               -> []
```

Si el RESET se rechaza o falla, el CARGAR_PERFIL no se crea.

**Errores:** 401 `clave_invalida`, 503 `dispositivo_no_configurado`.

### 5.3 `POST /dispositivo/solicitudes/{id}/confirmar`

La ESP avisa qué pasó con una solicitud. `{id}` es el `id` que vino en la lista.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `ok` | bool | sí | `true` = se aceptó y se aplicó |
| `detalle` | string o null | no | Por qué no se aplicó (máx. 255 caracteres) |

| Caso | Body | Estado final |
|---|---|---|
| Aceptado y aplicado | `{"ok": true}` | `CONFIRMADA` |
| El paciente tocó RECHAZAR | `{"ok": false, "detalle": "rechazado_por_usuario"}` | `RECHAZADA` |
| RESET con pruebas sin sincronizar | `{"ok": false, "detalle": "archivos_pendientes"}` | `ERROR` |
| Otra falla (ej. no pudo escribir la SD) | `{"ok": false, "detalle": "error_sd"}` | `ERROR` |

**200**

```json
{"ok": true, "estado": "CONFIRMADA"}
```

`estado` puede ser `CONFIRMADA`, `RECHAZADA`, `ERROR` o `CANCELADA`.

Reglas:

- **Idempotente:** si la solicitud ya estaba resuelta, devuelve 200 con el estado que
  tenía, sin cambiar nada.
- **Cancelada por el médico:** si la ESP contesta `ok=false`, queda `CANCELADA`. Si
  contesta `ok=true` (el paciente aceptó antes de que llegara la cancelación), el
  servidor registra lo que pasó de verdad: `CONFIRMADA`.
- **Un ERROR no se reintenta solo:** el médico lo vuelve a pedir desde la web.
- Si se rechaza o falla un CARGAR_PERFIL, el dispositivo vuelve a quedar sin paciente.

**Errores:** 400 `datos_invalidos`, 401 `clave_invalida`, 404 `solicitud_inexistente`,
503 `dispositivo_no_configurado`.

### 5.4 `POST /dispositivo/verificar-pin`

La ESP manda el PIN que tipeó el paciente y el servidor dice si coincide.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `usuario` | string | sí | El `usuario` del perfil cargado |
| `pin` | string | sí | Exactamente 4 dígitos (`"0042"`, como texto) |

```json
{"usuario": "therrera", "pin": "5678"}
```

**Respuestas**

| HTTP | Cuerpo | Qué hacer |
|---|---|---|
| 200 | `{"ok": true, "pin_version": "06384859c242"}` | Guardar el PIN y el `pin_version` en la SD |
| 401 | `{"ok": false, "error": "pin_incorrecto"}` | "PIN incorrecto", volver a pedirlo. Sin límite de intentos |
| 404 | `{"ok": false, "error": "sin_paciente_asignado"}` | El dispositivo ya no tiene paciente: sincronizar |
| 404 | `{"ok": false, "error": "usuario_no_asignado"}` | Ese usuario no es el asignado: sincronizar |
| 400 | `{"ok": false, "error": "datos_invalidos"}` | El PIN no tiene 4 dígitos o falta un campo |

Sólo se puede verificar el PIN del paciente asignado al dispositivo.

---

## 6. Estados de una solicitud

```
            (médico crea)
                 |
             PENDIENTE  --(médico cancela)-->  CANCELADA
                 |
       (ESP hace GET solicitudes)
                 |
             ENTREGADA  --(médico cancela)-->  CANCELADA
                 |
       (ESP confirma)
        /        |         \
 CONFIRMADA  RECHAZADA    ERROR
```

| Estado | Significa | Lo ve el médico como |
|---|---|---|
| `PENDIENTE` | Creada, la ESP todavía no la retiró | "esperando que el dispositivo sincronice" |
| `ENTREGADA` | La ESP la retiró, espera ACEPTAR / RECHAZAR | "esperando confirmación en el dispositivo" |
| `CONFIRMADA` | Aceptada y aplicada | "aplicado" |
| `RECHAZADA` | El paciente tocó RECHAZAR | "el paciente lo rechazó" |
| `ERROR` | No se pudo aplicar (`detalle` dice por qué) | "pruebas sin sincronizar" u otro error |
| `CANCELADA` | El médico la canceló | "cancelado" |

Hay **un pedido por vez**: mientras uno esté PENDIENTE o ENTREGADA, la web no deja
crear otro.

---

## 7. Configurar un paciente nuevo

### Lo que hace la gente

1. **Médico, en la web:** "Conectar a dispositivo" → **Asignar paciente** (dispositivo
   vacío) o **Cambiar usuario** (ya tiene uno). Ahí mismo ve el código.
2. **ESP:** si todavía no está conectada a la compu, ingresar el código.
3. **ESP:** tocar **Sincronizar**.
4. **ESP:** aparece el pedido; el paciente toca **ACEPTAR** e ingresa su PIN (el mismo
   que usa en la web).
5. **Médico, en la web:** "Actualizar estado" → tiene que decir **aplicado**.

### Lo que hace el firmware

1. `POST /dispositivo/identificar` con el estado actual. Poner en hora el reloj.
2. `GET /dispositivo/solicitudes`.
3. Si viene **RESET**: mostrar "Formatear dispositivo?".
   - RECHAZAR → confirmar `{"ok": false, "detalle": "rechazado_por_usuario"}`.
   - ACEPTAR con pruebas pendientes → no borrar; confirmar
     `{"ok": false, "detalle": "archivos_pendientes"}`.
   - ACEPTAR sin pendientes → borrar `perfil.json`, `CONFIGURACION.JSON`,
     `EVALUACIONES/`, `ENTRENAMIENTOS/`; confirmar `{"ok": true}`; **volver al paso 2**.
4. Si viene **CARGAR_PERFIL**: mostrar "Cargar perfil de <nombre> <apellido>?".
   - RECHAZAR → confirmar `{"ok": false, "detalle": "rechazado_por_usuario"}`.
   - ACEPTAR → guardar `payload.perfil` como `perfil.json` → pedir el PIN →
     `verificar-pin` hasta que dé 200 → guardar PIN y `pin_version` → confirmar
     `{"ok": true}`.
5. Repetir el paso 2 hasta que la lista venga vacía.

**Orden importante:** primero aplicar (guardar perfil, validar PIN), después confirmar.
Si se corta la luz antes de confirmar, la solicitud vuelve a llegar y se repite sin
problema.

### Cambio de PIN

Cuando el paciente cambia su PIN desde la web (Configuración u "Olvidé mi PIN"), **no se
crea ninguna solicitud**: cambia el `pin_version`. En la próxima sincronización,
`identificar` devuelve el mismo `usuario` con otro `pin_version`; la ESP pide el PIN
nuevo y lo valida con `verificar-pin`. Hasta que sincronice, la ESP sigue aceptando el
PIN viejo (offline no tiene forma de enterarse).

El paciente puede ver en la web, en **Sincronizar dispositivo**, si el dispositivo ya
tiene su PIN actual.

---

## 8. Probar sin la ESP (curl)

Pacientes de prueba (usuario / PIN): `msalerno` / 1234, `therrera` / 5678,
`rfernandez` / 4321. Médico: `belen.fernandez@bronquito.app` / `medico1234`.

```bash
K=<DEVICE_API_KEY del .env>
B=http://localhost:8000
J='Content-Type: application/json'

# Token de médico
T=$(curl -s -X POST $B/auth/medicos/login -H "$J" \
  -d '{"usuario":"belen.fernandez@bronquito.app","contrasena":"medico1234"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# --- Lado ESP ---
curl -X POST $B/dispositivo/identificar -H "X-Device-Key: $K" -H "$J" \
  -d '{"vacia":true,"usuario_actual":null,"archivos_pendientes":0}'
curl $B/dispositivo/solicitudes -H "X-Device-Key: $K"
curl -X POST $B/dispositivo/solicitudes/1/confirmar -H "X-Device-Key: $K" -H "$J" -d '{"ok":true}'
curl -X POST $B/dispositivo/solicitudes/1/confirmar -H "X-Device-Key: $K" -H "$J" \
  -d '{"ok":false,"detalle":"rechazado_por_usuario"}'
curl -X POST $B/dispositivo/solicitudes/1/confirmar -H "X-Device-Key: $K" -H "$J" \
  -d '{"ok":false,"detalle":"archivos_pendientes"}'
curl -X POST $B/dispositivo/verificar-pin -H "X-Device-Key: $K" -H "$J" \
  -d '{"usuario":"msalerno","pin":"1234"}'

# --- Lado médico (lo mismo que hace el panel de la web) ---
curl $B/medicos/me/dispositivo -H "Authorization: Bearer $T"                 # ver estado
curl -X POST $B/medicos/me/dispositivo/asignar -H "Authorization: Bearer $T" -H "$J" \
  -d '{"nombre_usuario":"msalerno"}'                                          # asignar
curl -X POST $B/medicos/me/dispositivo/formatear -H "Authorization: Bearer $T" -H "$J" \
  -d '{}'                                                                     # formatear
curl -X POST $B/medicos/me/dispositivo/formatear -H "Authorization: Bearer $T" -H "$J" \
  -d '{"nombre_usuario_reemplazo":"therrera"}'                                # cambiar usuario
curl -X POST $B/medicos/me/dispositivo/solicitudes/1/cancelar -H "Authorization: Bearer $T"  # cancelar
```

---

## 9. Lado web (referencia)

Estos endpoints los usa la web, no la ESP. Usan el login normal (`Authorization: Bearer`)
y los errores con el formato de siempre de FastAPI (`{"detail": "..."}`).

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /medicos/me/dispositivo` | médico | Estado: paciente, última conexión, pruebas pendientes, último pedido, código |
| `POST /medicos/me/dispositivo/asignar` | médico | Asigna un paciente a un dispositivo sin paciente y crea CARGAR_PERFIL |
| `POST /medicos/me/dispositivo/formatear` | médico | Crea RESET; con `nombre_usuario_reemplazo` es "cambiar usuario" |
| `POST /medicos/me/dispositivo/solicitudes/{id}/cancelar` | médico | Cancela un pedido PENDIENTE o ENTREGADA |
| `GET /pacientes/me/dispositivo` | paciente | Código para conectar, última conexión y si el dispositivo tiene su PIN actual |

Reglas del lado médico:

- Asignar sólo con el dispositivo sin paciente. Formatear y cambiar usuario sólo si el
  paciente asignado está en tu lista (o si no hay ninguno).
- Un médico que no tiene vinculado al paciente asignado ve "asignado a un paciente que
  no está en tu lista", sin el usuario, y no puede operarlo.
- El paciente sólo ve el código y su propio estado; no puede formatear ni asignar.

---

## 10. Pendiente (próxima etapa)

- Solicitud `RUTINA`: rutina + frecuencia recomendada en `CONFIGURACION.JSON`, y el
  punto amarillo de "frecuencia sin sincronizar" en la web.
- Subida de evaluaciones y entrenamientos desde la ESP.
