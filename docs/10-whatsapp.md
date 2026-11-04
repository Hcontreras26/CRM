# WhatsApp en el CRM

Guía para quien enlaza un número y para quien toca el código.

Todo lo que hay aquí sale de romperlo en pruebas: cada regla tiene detrás un
fallo concreto que ya pasó.

---

## Lo primero: qué es esto

Cada usuario del CRM enlaza **su propio número** y ve **solo sus
conversaciones**. No hay un WhatsApp común del CRM.

La sesión de cada persona se llama `crm-u<id>` — por ejemplo `crm-u7` para el
usuario 7. Ese nombre **sale del token de sesión**, nunca de nada que mande el
navegador, así que nadie puede pedir la sesión de otro.

Quién puede ver la sesión de quién:

| | |
|---|---|
| **Superadmin** | Cualquiera |
| **Admin** | Solo quien comparta proyecto con él. Un administrador de una marca no tiene por qué leer los mensajes de la gestora de otra |
| **El resto** | La suya y punto. Si piden otra, se rechaza con 403 — no se ignora en silencio |

Cuando se está viendo la sesión de otra persona, **la pantalla lo dice siempre**,
aunque sea la propia. Leer los mensajes de alguien sin que se note es justo lo
que no puede pasar.

Un administrador también puede **enlazar** el número de una gestora — tenerla al
lado con el móvil es más rápido que explicárselo por teléfono. En ese caso queda
escrito que pulsó él, no ella: ver «El aviso» más abajo.

No usamos la API oficial de WhatsApp Business: hablamos el mismo protocolo que
**WhatsApp Web**, con [Baileys](https://github.com/WhiskeySockets/Baileys). Eso
tiene consecuencias, y de ahí sale casi todo lo que viene abajo.

---

## Para quien enlaza un número

### Qué hacer

- **Usa un número de trabajo.** Al enlazar se descarga a la base del CRM lo que
  ese móvil tenga guardado. Solo lo ves tú, pero queda en el servidor de la
  empresa.
- **Deja el móvil con batería y con datos.** No hace falta que esté al lado del
  ordenador, pero si el teléfono se queda sin conexión mucho rato, WhatsApp
  cierra la sesión.
- **Elige «Lo reciente»** salvo que de verdad necesites conversaciones viejas.
  Es la opción por defecto y deja la pantalla usable en segundos.
- **Si alguien pide que no le escribas, márcalo en el chat.** Es la regla que
  más protege el número: lo que hace que WhatsApp suspenda una línea no es tanto
  detectar el cliente como que la gente la bloquee y la reporte.
- **Para desvincular, usa el botón del CRM.** Deja la sesión cerrada del lado de
  WhatsApp y prepara un código nuevo. Quitarlo solo desde el móvil deja al CRM
  reintentando contra una sesión muerta.

### Qué NO hacer

- **No enlaces el mismo número desde dos sitios a la vez.** Dos sesiones con las
  mismas credenciales se pelean, se cierran la una a la otra y el número acaba
  desconectado sin motivo aparente.
- **No pulses «Enlazar» diez veces si tarda.** Cada pulsación puede abrir una
  conexión nueva. El botón ya reintenta solo tres veces y el código se renueva
  cada 18 segundos: espera.
- **No escanees un código de hace rato.** WhatsApp los caduca a los ~20 segundos.
  El CRM da uno nuevo automáticamente; si escaneas uno viejo, el móvil dice «no
  se pudo vincular» sin explicar por qué.
- **No mandes mensajes en ráfaga a gente que no te ha escrito.** Es la forma más
  rápida de que suspendan la línea. El CRM ya se niega a hacerlo, pero no le
  busques la vuelta.
- **No uses el número personal de nadie sin decírselo.** Sus conversaciones
  privadas acaban en la base del CRM.

### Cuánto historial traer

Al enlazar se elige, y **no se puede cambiar sin volver a enlazar** (WhatsApp lo
decide al abrir la sesión, no después):

| Opción | Qué trae | Cuándo usarla |
|---|---|---|
| **Empezar de cero** *(por defecto)* | Nada del pasado, solo lo que llegue a partir de ahora | **Casi siempre.** Es lo que hace falta para trabajar, y lo único que no mete conversaciones antiguas en el servidor de la empresa |
| **El último mes** | Los últimos 30 días | Si vienes atendiendo a gente por ese número y no quieres perder el hilo |
| **Todo el historial** | Todo lo que tenga el móvil, incluido lo personal y los grupos | Piénsatelo. Decenas de miles de mensajes y un buen rato de espera |

El recorte del mes lo hacen **los dos lados, y hace falta que sea así**:

- **En el puente** (local), que no llega a sacarlo del móvil.
- **En el CRM** al recibir, porque en producción no hay puente sino Evolution, y
  Evolution no sabe recortar.

Y esto no funcionaba en el VPS. `crearInstancia` mandaba un campo `modo` que
**solo entiende el puente**, y a Evolution le mandaba `syncFullHistory: false`
fijo — el único campo que Evolution mira. Resultado: en producción, «el último
mes» y «todo el historial» hacían exactamente lo mismo que «empezar de cero».
Tres opciones en pantalla y dos que no hacían nada. Es el fondo de la tarea #73.

Ahora `syncFullHistory` sale del modo (`politica.js`) y los 30 días los aplica
el CRM sobre lo que entra. Si el proceso se reinicia a mitad de una
sincronización, el modo se pierde y **no se recorta nada**: de las dos formas de
equivocarse, guardar de más tiene arreglo y tirar mensajes de una gestora no.

### Los grupos

**Los grupos entran y funcionan.** Se ven en la lista, se puede escribir en
ellos y se distinguen de una persona en la cabecera.

Durante un tiempo el código decía lo contrario: pedía `groupsIgnore: true` «para
no darle a Meta motivos de suspender el número». No se cumplía nunca, y por tres
motivos a la vez:

1. El **puente de Baileys no implementa** ese flag (la misma trampa de la #63:
   el puente es más permisivo que Evolution, así que lo que pruebas no es lo que
   corre).
2. `guardarAjustes` lo **apagaba solo**: reconstruía el bloque entero con
   `groupsIgnore: actuales.groupsIgnore ?? false`, así que tocar el interruptor
   de «responder a llamadas» encendía los grupos sin que nadie lo pidiera.
3. El propio CRM los **aceptaba a propósito** en `recibir()`.

Medido en la base de pruebas: 2 grupos de 5 conversaciones, con mensajes del
mismo día. Entraban en vivo.

Y aun así no se podía trabajar con ellos, porque `numeroDe()` partía el jid por
la arroba y mandaba las 18 cifras sueltas. Al otro lado eso se reconstruye como
`...@s.whatsapp.net`, un teléfono que no existe: los grupos se veían y contestar
en ellos no llegaba a ninguna parte. Ahora se manda el jid entero — también con
`@lid`, donde tomar las cifras por un teléfono mandaba el mensaje a un
desconocido.

La decisión vive en **un sitio**, `politica.js`, y se aplica en el CRM. Con
`WHATSAPP_GRUPOS=no` los grupos dejan de entrar de verdad y tampoco se enseñan
los que ya estuvieran guardados. Por defecto está en `si`.

Con «Todo el historial» en un número con años de uso llegan **decenas de miles**
de mensajes por tandas, durante bastante rato. Medido: 76.580 mensajes y 17.894
adjuntos.

### Los archivos viejos

De las conversaciones antiguas **no se descargan todos los archivos**. Con
17.894 adjuntos, bajarlos uno a uno pasaba de la hora — y lo que enviabas en ese
momento se ponía a la cola detrás de todos ellos.

Se bajan siempre:

- Todo lo que llega **ahora**, con prioridad sobre la cola
- Del historial, lo de los **últimos 30 días** (`WA_MEDIA_DIAS`)

Lo demás sale en el chat como **«⬇ Descargar»** y se pide con un clic.

Ojo: **puede que ya no exista**. WhatsApp guarda los ficheros un tiempo limitado
y de las conversaciones viejas suelen haber caducado. En ese caso el CRM lo dice
tal cual en vez de dejar el botón girando.

Los **stickers del historial no se descargan** nunca: eran 12.487 de los 17.894
—el 70% de la cola— para pintar monigotes de hace años.

---

## El aviso antes de enlazar

Antes de que aparezca el código hay que **leer y marcar una casilla**. No es
burocracia: enlazar por esta vía no es la forma oficial de WhatsApp, el número
puede acabar bloqueado, y quien lo pone es una persona con su teléfono.

El aviso dice, con todas las letras, que el número puede acabar bloqueado, que
mejor uno de empresa, que las conversaciones se guardan en el servidor de la
empresa y que la administración puede verlas, y que se puede desvincular cuando
se quiera.

**La casilla no basta por sí sola.** El servidor exige `enterado: true` y
responde 400 sin él, porque una casilla en la pantalla se esquiva llamando al
endpoint a mano.

Cada aceptación deja una línea en `wa_consentimientos` (migración 129) con:

- **De quién es** la línea y **quién pulsó**. Casi siempre el mismo, pero si un
  administrador enlaza el número de una gestora, ella **no leyó el aviso** — y
  esa diferencia es justo lo que hay que poder ver después.
- La **versión del aviso**. Al cambiar el texto se sube `VERSION_AVISO`: hay que
  poder saber qué leyó cada persona, no solo que aceptó algo alguna vez.
- Desde dónde: IP y navegador.

No hay índice único por usuario a propósito. Desvincular y volver a enlazar seis
meses después son dos decisiones distintas y las dos quedan escritas.

## El secreto del webhook

Es **obligatorio en producción**. Sin él se responde 503 y no se procesa nada.

Antes era «si está puesto», y eso dejaba la puerta abierta: esa ruta va antes del
`verifyToken` —la llama el contenedor, no un navegador—, así que olvidarse de la
variable permitía a cualquiera que supiera la dirección meter mensajes inventados
en la conversación de una gestora. Es el mismo agujero que ya hubo con Stripe.

Puede llegar de dos formas y **hacen falta las dos**: en la cabecera
`x-webhook-secret`, que es lo natural, o dentro de la propia dirección. Lo
segundo no es un capricho — el webhook **global** de Evolution, que es como está
montado, solo deja configurar una dirección y no permite mandar cabeceras
propias. Con el secreto obligatorio y solo por cabecera, Evolution habría llamado
sin ella y el CRM habría rechazado **todos** los mensajes entrantes.

No es peor: esa llamada va del contenedor al CRM por la red interna de la
máquina, no sale a internet.

## Los frenos (y por qué no se tocan)

El CRM se niega a enviar en dos casos. No son burocracia: son lo que evita que
suspendan la línea.

1. **A quien pidió que no le escribieran.** Ni con plantilla, ni «solo una última
   vez».
2. **Cuando se va demasiado rápido.** 6 por minuto, 60 por hora, 300 al día
   (`WA_TOPE_MINUTO`, `WA_TOPE_HORA`, `WA_TOPE_DIA`), más una pausa de 1,5
   segundos entre mensajes seguidos.

Los topes son **por número**: lo que mande un compañero no te frena a ti.

Y cuentan **solo lo que envía el CRM**. Esto costó un fallo: al enlazar, todo lo
que esa persona había escrito desde su móvil entra como saliente, y el freno lo
contaba como si lo hubiera disparado el CRM. Con 341 mensajes del propio
historial ya saltaba «llevas 341 hoy, se retoma mañana» sin haber enviado ni uno
desde el CRM. Ahora solo cuenta lo que lleva firma de usuario (`enviado_por`).

---

## Llamadas

**Hablar por el CRM no se puede.** No es que falte hacerlo: por esta vía WhatsApp
no da canal de audio. La voz vive en la aplicación del móvil y va cifrada punto a
punto. Lo que sí se hace es que no se pierda ninguna llamada.

### Lo que llega solo

Evolution emite el evento `CALL` con la llamada entrante, y hay que **pedirlo**:
`WEBHOOK_EVENTS_CALL: "true"` en `docker-compose.whatsapp.yml`. Sin esa línea el
contenedor la procesa pero no avisa a nadie.

Manda un aviso por **cada cambio de estado** de la misma llamada — `offer`,
`ringing`, `timeout`… — así que sólo se guarda el desenlace (`timeout` → perdida,
`reject` → rechazada, `accept` → contestada). El identificador va como
`call:<id>`, y el índice único de `wa_id` remata el duplicado si el aviso se
reintenta.

Se guarda como un mensaje más con `tipo = 'llamada'`. **No hizo falta migración:**
`tipo` no tiene lista cerrada de valores. El desenlace va en `texto` en seco
—`perdida`, no «Llamada perdida»— para poder filtrar sin buscar dentro de un
texto; la frase la pone la pantalla. Y `media_mime` guarda `video` o `audio`,
que en una llamada sí significa algo.

### El aviso mientras suena

Guardar sólo el desenlace vale para el historial pero **llega tarde para
avisar**: cuando entra el `timeout` la llamada ya se perdió. Por eso el `offer`
sí se atiende — no se guarda en la base, porque no es un hecho todavía — y vive
en un `Map` en memoria, como el pulso.

`GET /api/whatsapp/sonando` lo lee. Lo consulta **todo el CRM**, no sólo la
pantalla de WhatsApp, así que **no toca la base**: el nombre y el teléfono se
resolvieron una vez cuando entró el aviso. Es siempre la sesión de uno mismo,
nunca la de otro — a un administrador que está mirando el WhatsApp de una
gestora no le debe saltar su llamada.

El cartel se cae solo a los 45 segundos. WhatsApp deja de llamar sobre los 30;
el margen es por si el aviso de que terminó no llega nunca —un webhook que se
pierde, el contenedor reiniciándose—, porque si no habría que recargar la página
para quitarlo.

**El ritmo de consulta depende de si hay sesión**: 3 segundos con WhatsApp
enlazado, 60 sin él, y nada con la pestaña de fondo. Saberlo por el pulso no
bastaba: una gestora enlazada y tranquila no tiene pulso después de reiniciar el
servidor, así que iría a 60 segundos y una llamada de 30 no se vería nunca. Se
mira la base una vez y se guarda cinco minutos.

### Lo que sale

El botón de llamar abre `tel:` en el móvil de la gestora y **apunta el intento
antes** de marcar: al revés, cambiar de aplicación puede congelar la pestaña y la
llamada saldría sin registro, que es justo lo que se venía a resolver. El
identificador lleva el minuto dentro, así que pulsar dos veces no cuenta dos
llamadas.

### En la ficha del prospecto

El chat guarda la **conversación**; la ficha guarda el **historial de contacto**,
y son cosas distintas: quien abre un prospecto para ver por dónde va no entra en
WhatsApp. Por eso cada llamada escribe además una fila en `lead_interactions`
—cuyo enum `interaction_type` ya admitía `llamada`, no hizo falta tocar nada—, y
`LeadInteractionsCard` la pinta sin cambios.

Dos condiciones para no ensuciarla:

- **Sólo si el mensaje se guardó de verdad.** Cuando `guardarMensaje` devuelve
  vacío es que ese aviso ya había entrado —Evolution reintenta— y sin esa
  comprobación la misma llamada saldría dos y tres veces en el historial.
- **Sólo si hay prospecto atado.** Un número desconocido no tiene ficha donde
  apuntar nada.

`created_by` es NOT NULL y en una llamada entrante no hay ningún usuario del CRM
detrás: se apunta a nombre de **la gestora cuya línea la recibió**, que es quien
de verdad tuvo el contacto. Y si esa escritura falla no se tira el webhook — la
llamada ya está en el chat, que es lo que no se puede perder.

### La respuesta automática

`rejectCall` y `msgCall` son **ajustes de instancia de Evolution**, no algo
nuestro: rechaza la llamada y contesta con un texto. Se configuran por gestora
desde Conexión, y por defecto van apagados — quien sí coge el teléfono no debe
rechazar a nadie.

**Cuidado al guardarlos:** `/settings/set` no parchea, reemplaza el bloque
entero. Mandar `{ rejectCall: true }` a secas apagaría `syncFullHistory` y la
siguiente vinculación entraría sin historial. Por eso `guardarAjustes()` lee
antes y manda todo junto, y si no puede leer no escribe nada.

### La vía que no se ha tomado

Evolution admite `wavoipToken` → `useVoiceCallsBaileys()`, que sí da voz de
verdad. Es un **servicio externo de pago** (Wavoip): servidor y coste mensual.
Queda anotado, no se hace.

La otra es la **API oficial de WhatsApp Business**, que tiene llamadas desde
2025 — pero el número registrado ahí deja de funcionar en la app del móvil, y las
gestoras trabajan desde el móvil. Es cambio de modelo, no mejora.

## Quién entra a mirar la sesión de otra persona

Un administrador puede abrir el WhatsApp de una gestora — hace falta para
ayudarla y para supervisar. Pero son sus conversaciones con clientes, y algunas
serán personales: **poder mirarlas sin dejar rastro es lo que convierte una
herramienta de trabajo en una de vigilancia.**

Queda escrito en `user_activity_log` con la acción `whatsapp.mirar_sesion` y el
id de la gestora en `details`. Esa tabla ya existía y ya la usa auth, así que
**no hizo falta migración**: esto funciona esté como esté la base.

Se apunta **una vez cada media hora por pareja** (quien mira, a quién mira). La
pantalla del chat pregunta cada pocos segundos, así que sin el freno una tarde
mirando dejaría miles de filas idénticas y el registro no serviría para leerlo,
que es justo para lo que está.

Para consultarlo:

```sql
SELECT a.created_at, u.nombre AS miro, a.details->>'gestora' AS a_quien, a.ip_address
  FROM user_activity_log a
  JOIN users u ON u.id = a.user_id
 WHERE a.action = 'whatsapp.mirar_sesion'
 ORDER BY a.created_at DESC;
```

Y si el registro falla no se bloquea a nadie: quien está ayudando a una gestora
sigue trabajando, y el fallo va al registro del servidor.

## Para quien toca el código

### La forma

```
Navegador ──▶ CRM (Express) ──▶ puente/Evolution ──▶ WhatsApp
                  ▲                    │
                  └──── webhook ───────┘
```

El CRM habla con un servicio que expone los endpoints de **Evolution API**. En
el VPS es Evolution en Docker; en local es un puente con Baileys que imita esos
mismos endpoints, porque Docker no arranca en todas las máquinas.

El CRM no distingue cuál de los dos hay detrás.

### Reglas al tocar esto

- **La instancia sale del token, nunca del cuerpo de la petición.** Si algún día
  se acepta un `instancia` que manda el cliente, se acabó el aislamiento entre
  usuarios.
- **Toda ruta con `:id` de conversación pasa por `miConversacion(req, id)`.**
  Comprueba que es de quien la pide y contesta **404, no 403** — un 403
  confirmaría que ese chat existe.
- **El webhook exige `instance`.** Sin ella no se sabe de quién es el mensaje: se
  descarta con un aviso en vez de guardarlo en una sesión de nadie.
- **Nada de descargar adjuntos dentro del webhook.** Se hizo y fue el fallo más
  caro: al emparejar llegan miles de mensajes, y por cada uno el CRM le pedía el
  fichero de vuelta al mismo servicio que se los estaba mandando. Se saturó la
  cola de conexiones y **se perdieron 2.463 mensajes**. Va en una cola aparte, de
  uno en uno, con pausa.
- **Cuidado con los sockets viejos.** Cerrar el WebSocket no basta: hay que
  quitarle los manejadores antes. Si no, su evento `close` llega después, marca
  la sesión como caída y programa una reconexión que mata al socket bueno —
  bucle infinito de conectar/desconectar cada 3 segundos con el error 428.
- **El `<img>` no manda cabeceras.** Los adjuntos van por URL firmada (HMAC con
  `JWT_SECRET`), no por token. Y la firma se redondea a tramos de cuarto de hora:
  si cambia en cada refresco, el navegador se rebaja todas las fotos del chat
  cada cinco segundos.
- **El servidor firma el permiso; el frontend arma la dirección.** El CRM cuelga
  de `/crm/` o de `/testeo/`, y una ruta absoluta puesta por el servidor no
  existe para el navegador.

### Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `EVOLUTION_URL` | — | Dónde escucha Evolution o el puente |
| `EVOLUTION_API_KEY` | — | Su clave |
| `EVOLUTION_INSTANCIA` | `crm` | **Prefijo** de las instancias, no el nombre |
| `EVOLUTION_WEBHOOK_SECRET` | — | Secreto del webhook. **Obligatorio en producción** |
| `WA_TOPE_MINUTO` / `_HORA` / `_DIA` | 6 / 60 / 300 | Topes de ritmo |
| `WA_PAUSA_MS` | 1500 | Espera entre mensajes seguidos |
| `WA_MEDIA_DIAS` | 30 | Cuánto historial de adjuntos se baja solo |
| `WA_MEDIA_INTENTOS` | 3 | Intentos antes de dar un adjunto por perdido: ni el arranque ni «reintentar» lo vuelven a pedir (#638, migración 240) |
| `UPLOADS_DIR` | `/var/crm-uploads` | Dónde se guardan los archivos |

### Base de datos

`wa_conversaciones` y `wa_mensajes` (migración 128). La columna `instancia` es la
que separa a unos usuarios de otros, con `UNIQUE (instancia, jid)`.

**No hizo falta migración para el multiusuario**: el id del usuario va dentro del
nombre de la instancia, así que la columna que ya existía sirvió tal cual.

Los mensajes se deduplican por `wa_id` (índice único parcial), así que volver a
enlazar **no duplica** nada: las conversaciones se reutilizan por `jid` y los
mensajes ya guardados se ignoran.

### Límites conocidos

- **El historial solo llega al emparejar.** Al reconectar, WhatsApp no lo
  reenvía. Si se pierde la sincronización a medias, hay que desvincular y volver
  a enlazar.
- **Para descifrar un adjunto hace falta el mensaje original**, y el puente lo
  guarda en memoria con un tope de 20.000. Con «Todo el historial» en un número
  grande, los adjuntos más viejos dejan de poder recuperarse.
- **Nota de voz desde el navegador**: se graba en `audio/ogg;codecs=opus` cuando
  el navegador puede, y si no en webm/opus. Sin verificar contra WhatsApp real.
