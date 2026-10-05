# Consultas de alumnos · estudio de los campus y propuesta de integración

Fase 0 de la épica #185 ([especificación de Manuel](especificaciones/consultas-alumnos-crm.pdf)),
issue #186. Responde a la decisión 5: «¿cómo envía hoy el campus las consultas?».

Estado a 5 de octubre de 2026. **Es una propuesta: no se programa nada hasta que
Diego la apruebe.**

## En resumen

- **Nueve campus son Moodle** (4.4, 4.5, 5.0 y 5.2) y uno, Academia IA, va sobre
  **Skool**. Basta **un solo adaptador, el de Moodle**.
- **Hoy el alumno pregunta por la mensajería privada de Moodle**: en ISEIE, Psiko,
  ISEIH e ISAEG el botón «Chat» del curso le lleva a un mensaje privado con su
  tutor. Son 1.465 de los 1.478 alumnos. Fono e ICTESS usan foros.
- Moodle deja **leer** consultas y mensajes, matriculados, último acceso y buscar un
  email. **No deja** dos cosas que pide la especificación:
  1. **Responder como el tutor** con un token común: la respuesta sale firmada por
     el usuario del token, o Moodle la rechaza.
  2. **Dar la fecha de matrícula**: no la devuelve ninguna función.

  Las dos se resuelven con un **plugin propio en el campus**, y en los campus ya se
  instalan: el de Certifex está en 8 de los 9.
- **Piloto propuesto: ISEIH.**
- **Decisiones para Diego** al final del documento.

## Cómo se ha comprobado

Cada dato lleva su fuente. Se ha usado:

| Fuente | Qué da |
|---|---|
| Panel de Certifex (producción, 05/10, solo lectura) | Campus conectados, versión de Moodle («Probar») y cursos y alumnos («Verificar») |
| Páginas públicas de cada campus, sin usuario | Que es Moodle, servicios web activos, plugins instalados y el código propio de cada campus |
| Aviso legal de cada web | La empresa titular |
| Código oficial de Moodle 4.4, 4.5, 5.0 y 5.2 | Que existen las funciones y los eventos que usaría el conector |
| Moodle 4.5 de prueba en Docker, vacío, en local | Lo que hace cada función de verdad: leer, responder y con qué permisos |
| Webs de cada marca y `docs/proceso-comercial.txt` | Lo que se promete al alumno sobre cómo contactar con el tutor |

**No se ha entrado en ningún campus ni se ha leído ningún mensaje de alumnos.**

---

## 1 · Los campus del ecosistema

| Proyecto | Empresa | Plataforma | URL del campus |
|---|---|---|---|
| ISEIE | ISEIE Innovation School SL | Moodle 4.4.3 | `https://iseie.com/campus/virtual/moodle` |
| Psiko Aprende | CEDIA Investigación y Desarrollo SL | Moodle 4.5.12 | `https://campus.psikoaprende.com` |
| Fono Aprende | CEDIA | Moodle 4.5.12+ | `https://fonoaprende.com/campus` |
| ISAEG | CEDIA | Moodle 4.5.12+ | `https://isaeg.com/campus` |
| ISEIH | CEDIA | Moodle 5.0.4 | `https://iseih.com/campus` |
| ICTESS | ICTESS Ingeniería e Innovación SL | Moodle 5.0.4 | `https://ictess.com/campus` |
| ISECD | CEDIA | Moodle 5.2.2+ | `https://isecd.com/campus` |
| ISSLOGG | CEDIA | Moodle 5.2.2+ | `https://isslogg.com/campus` |
| ISEF | CEDIA | Moodle 5.2.2+ | `https://institutoisef.com/campus` |
| Academia IA | Lateral Thinking Solutions SL | Skool | `https://academiaia.ai` |

- **Versiones:** salen del botón «Probar» de Certifex. La de ICTESS, que no está en
  Certifex, sale de su `UPGRADING.md` público. El método se comprobó con ISEIH, que
  da 5.0.4 por las dos vías.
- **Empresas:** salen del aviso legal de cada web y coinciden con el CRM de testeo.
  ISEIE va en CRM-ISEIE; el resto, en este CRM. **ICTESS no está claro:** el CRM de
  testeo lo tiene aquí, pero `docs/README.md` lo pone en el CRM de ISEIE (decisión 6).
- **Proyectos sin campus, fuera de alcance:** Psicólogo IA, Nutricionista IA, Tarot
  IA, Sexólogo IA y Veterinary AI (`docs/README.md`). Son proyectos de tipo `ia`:
  aplicaciones de pago sin cursos ni tutores. La migración 013 dice que «no hay
  pipeline de leads; solo seguimiento de quien pagó / usa la plataforma». No tienen
  consultas de alumnos que integrar.
- **Servicios web:** los 9 Moodle los tienen activos (`enablewebservices = 1`).

Alumnos y cursos, según la verificación de Certifex del 05/10:

| Campus | Cursos | Alumnos |
|---|---|---|
| ISEIE | 295 | 948 |
| Psiko Aprende | 134 | 459 |
| ISEIH | 39 | 52 |
| Fono Aprende | 13 | 13 |
| ISAEG | 6 | 6 |
| ISSLOGG | 171 | 0 |
| ISECD | 0 | 0 |
| ISEF | 0 | 0 |
| ICTESS | — | — (no está conectado a Certifex) |

---

## 2 · Cómo envía hoy el alumno una consulta

| Campus | Canal | Prueba |
|---|---|---|
| ISEIE | **Mensajería** | Código del campus: el «Chat» de 185 cursos lleva al mensaje privado con el tutor |
| Psiko Aprende | **Mensajería** (y foros) | Código del campus: 92 cursos; su web habla de «foros de discusión… y apoyo por correo electrónico» |
| ISEIH | **Mensajería** | Código del campus: el «Chat» lleva al mensaje privado con las tutoras generales, dando preferencia a la matriculada en el curso |
| ISAEG | **Mensajería** | Código del campus: 3 cursos con tutor fijo |
| Fono Aprende | **Foros**, teléfono y correo | Web: «foros de consulta con el equipo docente»; condiciones de matriculación: «teléfono, correo electrónico y los canales habilitados… en la plataforma» |
| ICTESS | **Foros** | Web, 191 fichas de cursos: «foros con tutores especializados» |
| ISECD | Sin alumnos | La web promete la «mensajería interna del campus» |
| ISSLOGG | Sin alumnos | Solo tiene foros, sin la actividad Chat. **No tiene el correo (SMTP) configurado** |
| ISEF | Sin alumnos | Solo tiene foros, sin la actividad Chat |
| Academia IA | Mensajes y publicaciones de Skool | — |

- **Ningún campus usa formulario.** El correo aparece solo como apoyo.
- **Cómo funciona «el Chat lleva a la mensajería»:**
  - En ISEIE, Psiko, ISEIH e ISAEG hay un código propio en el HTML del campus.
  - En la actividad Chat del curso, comprueba que el alumno puede escribir al tutor
    (`core_message_get_member_info`).
  - Si puede, cambia el botón para que abra `/message/index.php?id=<tutor>`. Si no,
    deja la sala de chat.
  - Por eso **el canal real es la conversación privada de Moodle**, no la sala de chat.
- **Lo que no se ha medido:** cuántos mensajes y cuántas entradas de foro hay en cada
  campus. Hace falta un administrador del campus; el token de Certifex no tiene ese
  permiso. La propuesta cubre los dos canales, así que no depende de ese dato.

---

## 3 · Qué ofrece cada plataforma

### Moodle

Moodle **no tiene webhooks de serie**. Tiene servicios web REST, y además genera
eventos internos que **un plugin** puede escuchar.

- Las 11 funciones y los 4 eventos de abajo existen en las 4 versiones en uso:
  revisado en el código de `MOODLE_404`, `405`, `500` y `502_STABLE`.
- Están probadas en un Moodle 4.5 de prueba.

| Lo que pide la especificación | Cómo se hace | Resultado de la prueba |
|---|---|---|
| Avisar de una **consulta nueva** y de los **mensajes posteriores** | Consultando cada pocos minutos. Mensajería: `core_message_get_conversations` y `core_message_get_conversation_messages`. Foros: `mod_forum_get_forum_discussions` y `mod_forum_get_discussion_posts`. Para que el aviso sea inmediato: un plugin que escuche `\core\event\message_sent`, `\mod_forum\event\discussion_created` y `\mod_forum\event\post_created`. | ✅ El token del CRM lee las conversaciones del tutor y los foros del curso |
| Publicar la **respuesta del tutor** | `core_message_send_messages_to_conversation` y `mod_forum_add_discussion_post` | ⚠️ Con un token común, en la mensajería **Moodle la rechaza** («cannot send a message to conversation») y en el foro **sale firmada por el usuario del token**. Solo sale como el tutor con un **token del propio tutor** o con un plugin. |
| **Mensaje que empieza el tutor** | `core_message_send_instant_messages` y `mod_forum_add_discussion` | ⚠️ El mismo límite: sale firmado por el usuario del token |
| **Matriculados por curso** y **último acceso** | `core_enrol_get_enrolled_users`, que devuelve `lastcourseaccess` y el rol | ✅ |
| **Fecha de matrícula** | Ninguna función la devuelve, en ninguna versión. Solo con un plugin que escuche `\core\event\user_enrolment_created`. | ❌ No la da Moodle |
| **¿El email es usuario del campus?** | `core_user_get_users_by_field` con `field=email` | ✅ |

**Permisos:** el usuario del token **no necesita ser administrador**.
- Uno con rol de profesor ve los matriculados.
- Para leer las conversaciones de los tutores necesita un solo permiso más:
  `moodle/site:readallmessages`. Probado.
- Los tutores están matriculados en sus cursos con el rol `editingteacher` (según
  Certifex). Así se reconoce «el tutor está matriculado» (#187).

### Skool (Academia IA)

**No tiene API pública ni webhooks.** Lo único oficial es Zapier, en el plan Pro, con
dos avisos: nuevo miembro de pago y respuesta a las preguntas de entrada. No se pueden
leer ni enviar mensajes. **Academia IA queda fuera del conector.**

---

## 4 · Propuesta de conector

**Una lógica común en el CRM y un adaptador por plataforma.** Hoy solo hace falta el
adaptador de Moodle; sirve para los 9 campus.

```
Campus Moodle  ──(adaptador Moodle)──►  Lógica común del CRM
                                        · consultas y conversaciones
                                        · asignación al tutor (proyecto o empresa)
                                        · aviso al tutor por correo (Brevo)
                                        · respuesta → de vuelta al campus
                                        · métricas
```

El adaptador expone siempre las mismas operaciones, para que otra plataforma futura
solo tenga que implementarlas:

| Operación | En Moodle |
|---|---|
| `consultasNuevas(desde)` | Conversaciones y foros con mensajes posteriores a la última lectura |
| `mensajes(consulta)` | `core_message_get_conversation_messages` y `mod_forum_get_discussion_posts` |
| `responder(consulta, tutor, texto)` | Según la decisión 1 de abajo |
| `escribirAlAlumno(alumno, tutor, texto)` | Según la decisión 1 de abajo |
| `matriculados(curso)` | `core_enrol_get_enrolled_users` (la fecha de matrícula, según la decisión 2) |
| `esUsuario(email)` | `core_user_get_users_by_field` |

### Alta en Integraciones, ligada a proyecto y empresa

- Cada campus se da de alta en **Integraciones** (`project_integrations`, migración
  086), con el proveedor nuevo `moodle` y el `project_id` de su proyecto.
- **La empresa sale del proyecto** (`projects.sociedad_emisora_id`), así que no se
  guarda dos veces.
- En `config_public` van la URL del campus y los ajustes que no son secretos:
  frecuencia de lectura, canales activos (mensajería y foros) y el id de la
  conversación o el foro si hace falta.
- **El botón «Probar»** llama a `core_webservice_get_site_info` y guarda el resultado
  en `last_test_*`, como ya hace Integraciones con los demás proveedores.

### Un token por campus

- **Un token por campus**, de un **usuario de servicio dedicado, no administrador**.
  Va guardado cifrado en `encrypted_value` (AES-256-GCM), como el resto de secretos.
- El servicio web del campus lleva **solo las funciones del conector**. Es el mismo
  modelo que usa Certifex (`certifex_certificados`, 7 funciones de lectura).
- Si el token deja de valer, el CRM lo marca en Integraciones y avisa. No falla en
  silencio.

### Reintentos e idempotencia

- **Reintentos:** si un campus no responde, se vuelve a pedir con esperas crecientes
  (30 s, 2 min, 10 min) y queda anotado. No es teórico: el Moodle de ISSLOGG contesta
  «Database connection failed» en unos 70 de sus 171 cursos en casi cada barrido
  (Certifex, 28/09).
- **Idempotencia al leer:** cada mensaje se guarda con su id de Moodle; índice único
  `(integration_id, canal, moodle_id)`. Leer dos veces no crea dos consultas ni dos
  avisos.
- **Idempotencia al responder:** la respuesta se guarda antes de enviarla, con su
  estado (`pendiente`, `enviada` o `error`). Si el envío se corta, se reintenta solo
  lo pendiente y nunca se publica dos veces.
- **Lectura incremental:** se guarda por campus la marca del último mensaje leído y
  cada pasada pide solo lo posterior.

---

## 5 · Campus piloto

**Propuesta: ISEIH.**

- **Tamaño manejable:** 52 alumnos y 39 cursos. ISEIE (948) y Psiko (459) son
  demasiado grandes para probar.
- **Mismo canal que los grandes:** sus alumnos preguntan por la mensajería, como en
  ISEIE y Psiko. Lo que funcione en ISEIH sirve para el 99 % de los alumnos (1.465 de 1.478).
- **Moodle 5.0.4**, una versión intermedia entre las que hay (4.4 a 5.2).
- **Ya tiene el plugin de Certifex**, así que se sabe que en ese campus se puede
  instalar uno.

Alternativa: **ISAEG** (6 alumnos, mismo canal), si se prefiere empezar con casi nadie
dentro.

---

## Decisiones para Diego

1. **Cómo sale la respuesta del tutor en el campus.** Con un token común no sale
   como el tutor. Opciones:
   - **a)** Un token por tutor, que se pide al dar de alta al tutor. Es lo más
     sencillo en el CRM, pero son muchos tokens.
   - **b)** Un plugin propio del CRM en cada campus que publique en nombre del tutor.
     Es lo más limpio, y además da los avisos al momento y la fecha de matrícula
     (decisión 2).
   - **c)** Aceptar que la respuesta salga firmada por una cuenta «Tutoría» del
     campus. **Solo vale en los foros:** en la mensajería privada Moodle no la deja
     entrar en la conversación.
2. **Fecha de matrícula:** solo con un plugin (`user_enrolment_created`). Si no hay
   plugin, el CRM puede usar la fecha en que vio a la persona matriculada por primera
   vez, avisando de que es aproximada.
3. **Leer cada pocos minutos o plugin con avisos al momento.** Propuesta: empezar
   leyendo cada 5 minutos en el piloto, que no necesita instalar nada, y pasar al
   plugin si se aprueba la opción b.
4. **Academia IA (Skool)** queda fuera por falta de API. ¿Se gestiona a mano o no
   entra en Consultas?
5. **ICTESS no está conectado a Certifex** y es el único campus sin su plugin. Para el
   CRM habrá que crear su token aparte.
6. **¿En qué CRM está ICTESS?** El CRM de testeo lo tiene en este CRM y
   `docs/README.md` lo pone en el CRM de ISEIE. Decide dónde se da de alta su campus
   en Integraciones.

## Avisos que han salido por el camino

- **ISSLOGG no tiene el correo (SMTP) configurado.** Lo dice un comentario de su
  propio campus: «sin SMTP configurado ese formulario no envia nada (pendiente 3)». Los avisos de Moodle por correo no salen; para Consultas no importa,
  porque el CRM avisa con Brevo.
- **La documentación de Certifex dice que su plugin «no está en ningún campus»; está
  en 8 de 9.** Conviene corregirla allí.
- **El CRM tiene el CIF de Lateral Thinking como `PENDIENTE-CIF-LATERAL`**
  (migraciones 102, 161 y 165). Su aviso legal dice **B56472103**.
- **Los enlaces «campus» de las webs de ISEIE por país están rotos:** Argentina da 404
  y Chile, Colombia, Costa Rica, Ecuador y Brasil vuelven a la portada.
