# Manual de usuario del CRM

**Para quién es.** Para quien empieza: una gestora comercial, una
administradora nueva, un tutor o un colaborador. Se lee de una vez el primer
día y luego se consulta.

**Cómo está organizado.** Este documento es el **manual general**: qué es el
CRM, cómo se entra, cómo se mueve uno por él y qué ve cada rol. Después hay un
manual por cada apartado del menú, con los pasos de lo que más se hace, los
textos de los botones tal y como salen en pantalla, los errores frecuentes y el
guion del vídeo de ese apartado.

| Apartado del menú | Manual |
|---|---|
| Dashboard | [01-dashboard.md](01-dashboard.md) |
| Prospectos (lista, pipeline, audiencias, ficha, cola del día, seguimiento, proceso, convocatorias) | [02-prospectos.md](02-prospectos.md) |
| WhatsApp | [03-whatsapp.md](03-whatsapp.md) |
| Ventas y Finanzas | [04-ventas-y-finanzas.md](04-ventas-y-finanzas.md) |
| Clientes y Matrículas (con Diplomas) | [05-clientes-y-matriculas.md](05-clientes-y-matriculas.md) |
| Catálogo | [06-catalogo.md](06-catalogo.md) |
| Tutores y Consultas | [07-tutores-y-consultas.md](07-tutores-y-consultas.md) |
| Equipo de Desarrollo (Tareas) | [08-tareas.md](08-tareas.md) |
| Captación | [09-captacion.md](09-captacion.md) |
| Publicidad | [10-publicidad.md](10-publicidad.md) |
| Análisis | [11-analisis.md](11-analisis.md) |
| Conexión (MCP, Moodle, conectores, webhooks, asignación de leads) | [12-conexion.md](12-conexion.md) |
| Sistema | [13-sistema.md](13-sistema.md) |
| Configuración | [14-configuracion.md](14-configuracion.md) |

Para quien mantiene el CRM: [descuadres.md](descuadres.md) recoge lo que la
pantalla y el servidor dicen distinto. No es lectura para el primer día.

**Sobre los nombres de las pantallas.** El CRM se está rediseñando. Los textos
de este manual se han sacado del código de la rama de pruebas el 17/11/2026.
Si un botón cambia de nombre, lo que cuenta el manual sigue valiendo: búscalo
por lo que hace.

**Sobre los vídeos.** Cada manual termina con el guion de un vídeo de 3 a 4
minutos. Se graban sobre el CRM de pruebas o sobre una copia local, **nunca con
datos reales de alumnos ni de clientes a la vista**.

---

## 1. Qué es el CRM

El CRM es el sitio donde vive cada persona que se interesa por una de nuestras
formaciones. Lo tiene todo: cuándo pidió información y por dónde, quién la
atiende, qué se le ha dicho, si compró, cuánto ha pagado, su matrícula y, al
final, su diploma.

Si algo no está apuntado en el CRM, para el resto del equipo no ha pasado.

### Campus, empresas y proyectos

Cada **campus** es una marca con su web, sus formaciones y su campus virtual
(Moodle). En el CRM a un campus también se le llama **proyecto**. Los campus
pertenecen a una **empresa** (la sociedad que factura).

Puedes trabajar con un campus, con una empresa entera o con todos tus campus a
la vez. **Solo ves los campus que tienes asignados.**

El CRM también sigue las **plataformas de IA** (aplicaciones de pago por
suscripción). Cuando eliges una de ellas el menú cambia: sale el apartado
**Proyecto IA** con cinco entradas (Resumen, Cobros, Suscriptores, Facturación
y Conexión) y desaparecen Prospectos, WhatsApp, Captación, Catálogo, Tutores y
Finanzas, que ahí no tienen sentido.

---

## 2. Entrar

1. Abre la dirección del CRM que te haya dado tu administradora.
2. En **Inicia sesión** escribe tu **Email** y tu **Contraseña** y pulsa
   **Iniciar sesión**.
3. El ojo de la derecha del campo de la contraseña sirve para verla mientras
   la escribes.

**La primera vez.** Te llega un correo de bienvenida con un enlace. Te lleva a
**Establece tu contraseña**. La contraseña tiene que cumplir los cuatro
requisitos que salen en pantalla: **Mínimo 8 caracteres**, **Al menos una
mayúscula**, **Al menos un número** y **Las contraseñas coinciden**. Al
guardarla sale **Contraseña guardada** y vuelves a la entrada.

Si el correo no te llega, tu administradora puede copiarte el enlace desde la
ficha de usuario (caduca en 24 horas).

**Si olvidas la contraseña.** Debajo del botón de entrar está **¿Has olvidado
tu contraseña?**. Escribe tu correo y pulsa el botón. Sale **Mira tu correo**:
si ese correo tiene una cuenta activa, le llega un enlace para poner una
contraseña nueva. Caduca en 24 horas y solo sirve una vez.

**Errores al entrar.**

| Lo que ves | Qué pasa |
|---|---|
| **Completa todos los campos** | Falta el correo o la contraseña. |
| Un aviso en rojo debajo de la contraseña | El correo o la contraseña no son correctos, o tu usuario está desactivado. Si estás segura de la contraseña, pide a tu administradora que mire si tu usuario está activo. |
| **Token no detectado** en la página de la contraseña | Has abierto esa página sin el enlace del correo. Vuelve a abrir el enlace desde el correo. |

**La sesión.** La sesión se renueva sola mientras trabajas. Si pasas muchos días
sin entrar, te pedirá la contraseña otra vez.

---

## 3. Moverse por el CRM

La pantalla tiene tres partes: el **menú** a la izquierda, la **cabecera**
arriba y el contenido en el centro.

### El menú

Está ordenado en secciones: Principal, Equipo de Desarrollo, Captación,
Publicidad, Catálogo, Tutores, Finanzas, Análisis, Clientes, Conexión y
Sistema. **Cada persona ve solo lo que puede usar**: si una entrada no te sale,
no es un fallo, es que tu rol no la tiene.

- Las entradas con grupo (Prospectos, WhatsApp) se abren y se cierran con la
  flecha. Prospectos sale abierto: es la pantalla del día.
- Algunas entradas llevan la marca **Pruebas**: funcionan, pero están todavía en
  revisión.
- Las que dicen **Próximamente** no se abren: aún no existen.
- En el móvil el menú se abre con el botón de las tres rayas (**Abrir menu**).

Abajo del todo está tu nombre. Al pulsarlo salen **Mi perfil**, **Configuración
del CRM** (solo para administración) y **Cerrar sesión**.

### El selector de campus

Arriba del menú está el selector de campus. Al abrirlo ves tus campus agrupados
por empresa y, encima, **Todos los proyectos** (la vista global).

- **Un campus:** todo lo que ves es de ese campus.
- **Una empresa:** se suman todos sus campus. La pestaña del navegador dice el
  nombre corto de la empresa.
- **Todos los proyectos:** se suman todos tus campus.

Hay cosas que solo se pueden hacer con un campus elegido, porque pertenecen a
uno concreto: crear un prospecto, registrar una venta, crear un producto,
emitir una factura, configurar el proceso comercial o un webhook. Si estás en
la vista global, la pantalla te lo dice (por ejemplo, **Elige el proyecto antes
de crear el prospecto: estás en la vista de todos los proyectos.**).

### La búsqueda rápida

Pulsa **Ctrl + K** (en Mac, **Cmd + K**) en cualquier pantalla. Escribe un
nombre, un correo, un teléfono, un número de venta o de factura, o el nombre de
una pantalla. Con las flechas te mueves entre los resultados y con **Intro**
abres el que quieras. Desde ahí también puedes **Crear nuevo prospecto**,
**Crear nuevo producto**, **Ver atajos de teclado** o **Cerrar sesión**.

### Atajos de teclado

Pulsa **?** para ver la lista completa. Los atajos no funcionan mientras
escribes en un campo: pulsa **Esc** para salir del campo.

| Teclas | Qué hace |
|---|---|
| Ctrl/Cmd + K | Abrir la búsqueda rápida |
| Ctrl/Cmd + B | Contraer o expandir el menú |
| ? | Ver todos los atajos |
| Esc | Cerrar un diálogo |
| G y después D | Ir al Dashboard |
| G y después L | Ir a Prospectos |
| G y después C | Ir a Clientes |
| G y después P | Ir a Productos |
| G y después R | Ir a Reportes |
| G y después A | Ir al panel de Finanzas |
| G y después S | Ir a Configuración |
| N | Crear uno nuevo en la pantalla en la que estás (prospecto, producto, formulario, webhook, secuencia, egreso o cuenta por pagar) |

Los de la letra G solo llevan a la pantalla: si tu rol no la tiene, verás **No
tienes acceso a esta pantalla**.

### La campana

La campana de la cabecera avisa de lo que te toca o te interesa: **Nuevo
prospecto**, **Recordatorio vencido**, **Cobros vencidos** y el resto de
avisos. El número rojo es lo que no has leído. **Ver todas** lleva a
**Sistema › Notificaciones**, donde se separan en **Para hacer** (piden que
alguien actúe) y **Para saber** (han pasado, no piden nada), y donde decides
**Qué avisos quiero**. Ver [13-sistema.md](13-sistema.md).

### El botón flotante

Abajo a la derecha hay herramientas flotantes: los **atajos del campus** (los
que configura la administración) y el panel de **tickets de soporte**. Si te
estorban, se pueden esconder y volver a mostrar.

### Sin conexión

Si se cae internet sale **Sin conexión**: algunas acciones podrían no
completarse. Cuando vuelve, sale **Conexión restaurada**. Repite lo último que
hiciste si no ves el aviso de que se guardó.

### «No tienes acceso a esta pantalla»

Sale si escribes la dirección de una pantalla que tu rol no tiene, o si
entras por un enlace antiguo. **Si crees que deberías verla, pídeselo a un
administrador.** Lo que ves y lo que no lo decide el servidor: una gestora no
puede ver los prospectos de otra aunque sepa su número o copie un enlace.

---

## 4. Los roles: quién ve qué

Cada persona tiene un **rol**. El rol decide qué ve y qué puede hacer. Además,
una administradora puede darte o quitarte **permisos sueltos** y crear **roles a
medida** (ver [14-configuracion.md](14-configuracion.md)). Una persona puede
tener **más de un rol**, por ejemplo gestora y tutora: los roles se suman.

Si necesitas hacer algo y el CRM no te deja, no es un fallo: pídeselo a tu
administradora.

| Rol (como sale en el CRM) | Qué ve | Qué hace |
|---|---|---|
| **Gestor** (gestora, asesora comercial) | Sus prospectos, sus clientes, sus ventas, sus facturas, sus cifras y su WhatsApp. | Atiende a sus prospectos siguiendo el proceso comercial, registra ventas y cobros, completa datos para facturar y prepara la matrícula. Entra en el reparto de prospectos. |
| **Admin** (administradora) | Todo lo de sus campus o de su empresa. | Lleva el campus: reparte y reasigna prospectos, revisa duplicados, valida matrículas, da de alta usuarios, la facturación, los tutores y los diplomas. Puede supervisar el WhatsApp de su gente. |
| **Admin que lleva un equipo** (líder de equipo) | Lo suyo y lo de las gestoras de su equipo, nada más. | Supervisa a su equipo. No corrige, abona, asocia ni borra facturas: eso lo hace la administración sin equipo. |
| **Superadmin** | Todo. | Lo mismo que una admin, en todas las empresas, y lo que vale para todo el sistema. |
| **Desarrollador / Soporte** | Todos los campus y la parte técnica. | Claves, integraciones, módulos, incidencias. |
| **Project manager** | Las pantallas de sus campus, sobre todo en lectura. | Lleva las solicitudes de cambio del CRM y supervisa. |
| **Tutor / Profesor** | Sus cursos en Moodle, sus alumnos, sus consultas y sus comisiones. | Responde las dudas de sus alumnos y corrige tareas desde el CRM. No ve prospectos, ventas ni finanzas. |
| **Tutor redactor** | Su tablero de tareas, su factura del mes, sus consultas y sus cursos. | Hace los cursos y responde en Moodle. |
| **Colaborador** | Su tablero de tareas y su factura del mes. | Personal interno o externo (web, SEO, contenido). |

Un caso especial: la **gestora de colaboraciones** (en la lista de usuarios sale
como **Colaboraciones**). Es una gestora que se encarga de los tutores: darlos
de alta, sus cursos y sus comisiones. No vende, así que **no recibe
prospectos** y solo ve el apartado Tutores.

### Qué apartados del menú ve cada rol, de serie

«Sí» quiere decir que le sale la entrada con los permisos que trae su rol. Una
administradora puede cambiarlo persona a persona.

| Apartado | Gestor | Admin | Superadmin | Soporte | Project manager | Tutor | Colaborador |
|---|---|---|---|---|---|---|---|
| Dashboard | Sí | Sí | Sí | Sí | Sí | No | No |
| Prospectos | Sí | Sí | Sí | Sí | Sí | No | No |
| WhatsApp | Sí, salvo Actividad | Sí | Sí | Sí | Plantillas, Banco de mensajes, Actividad y Cómo se usa | No | No |
| Ventas | Sí | Sí | Sí | Sí | Sí | No | No |
| Equipo de Desarrollo (Tareas) | No | Sí | Sí | No | No | Mi tablero e Historial | Sí, y Mi factura |
| Captación | No | Sí | Sí | Sí, salvo Webhooks | Sí | No | No |
| Publicidad | No | Sí | Sí | Sí | Sí | No | Solo si se le da |
| Catálogo | Solo Cursos pendientes | Sí | Sí | Sí | Sí | No | No |
| Tutores | No | Sí | Sí | Solo Consultas | Solo Consultas | Mi campus y Consultas | No |
| Finanzas | Ventas y Cuentas por cobrar | Sí | Sí | Sí, salvo Facturación y Facturas de colaboradores | Sí, salvo Facturación | No | No |
| Análisis | No | Sí | Sí | Sí | Sí | No | No |
| Clientes | Clientes y Matrículas | Sí | Sí | Sí | Sí | No | No |
| Conexión | No | Sí | Sí | No | Sí, salvo MCP | No | No |
| Sistema | Sí, salvo Claves, Registro, Correos y Status | Sí | Sí | Sí | Sí | Solo Mis preferencias | Solo Mis preferencias |

Quien es **solo tutor** entra directo a **Mi campus**; quien es **solo
colaborador** o **solo tutor redactor**, a su tablero de tareas. Si se escribe
otra dirección, el CRM los devuelve ahí.

El detalle de cada pantalla está en el manual de su apartado, en la sección
«Permisos».

---

## 5. El recorrido de un prospecto

Un **prospecto** (o *lead*) es una persona que ha pedido información. Este es su
camino, de principio a fin.

### 5.1 Cómo entra

- **Por un formulario de la web.** Es lo más habitual. Llega al CRM
  directamente o a través de **Make** (una herramienta que conecta la web con el
  CRM).
- **Por el botón de WhatsApp de la web.** La persona escribe a tu WhatsApp de
  trabajo. Si la conversación no tiene ficha, la creas tú desde el propio chat.
- **Por una solicitud de admisión.** Si alguien rellena el formulario de
  admisión, se crea una matrícula y, si no existía, su ficha.
- **A mano.** Tú misma puedes dar de alta un prospecto (por ejemplo, alguien que
  llama), con **Nuevo prospecto**. Hace falta al menos una forma de contacto:
  correo, teléfono o usuario de WhatsApp.

El CRM apunta solo **el canal de origen** (Meta Ads, Google Ads, orgánico,
WhatsApp, referido, directo…) a partir de los datos de la web. Con ese dato se
decide en qué publicidad se invierte.

### 5.2 A quién le toca

El CRM **reparte solo** los prospectos nuevos entre las gestoras del campus,
por turno. Se salta a quien está marcada como **No disponible**, a quien tiene
una **ausencia** ese día y a la gestora de colaboraciones.

Cuando te toca uno, te llega un aviso. **Si vas a faltar, díselo antes a tu
administradora** para que te marque la ausencia; si no, te seguirán llegando
prospectos que nadie atenderá.

Solo administración puede cambiar la gestora de un prospecto.

### 5.3 Duplicados

Si llega alguien con el mismo correo, teléfono o WhatsApp que una ficha anterior
del mismo campus, se crea una ficha nueva **enlazada a la anterior** y se marca
como duplicado; si además pide la misma formación, sale como **reincidente**.

**Antes de contactar a alguien, mira si tiene una ficha anterior** y lee lo que
pasó. Administración revisa los duplicados y decide qué se hace con cada uno.

### 5.4 Los estados

| Estado | Qué significa |
|---|---|
| **Nuevo** | Acaba de entrar. Nadie ha hablado con ella. |
| **Por contactar** | Está pendiente del primer contacto. |
| **Contactado** | Ya se ha hablado con ella. |
| **En seguimiento** | Hay conversación en marcha y se le sigue. |
| **Próxima convocatoria** | Le interesa, pero para una convocatoria más adelante. No es un «no». |
| **Convertido** | Ha comprado. |
| **No interesado** | Ha dicho que no. |

El estado lo cambias tú, a mano. Dos excepciones:

- **Convertido** se pone solo al registrar la venta. Si lo intentas a mano, el
  CRM te dice **Registra la compra desde la ficha**.
- **No interesado** pide siempre un **Motivo de pérdida**. Escríbelo bien: con
  esos motivos se aprende por qué no compra la gente.

### 5.5 El proceso comercial

El proceso comercial es el mismo en todos los campus y el CRM lo aplica por ti:
a cada prospecto le pone su agenda de pasos con su fecha. **Los días se cuentan
desde que la persona pidió información**, no son días de la semana.

| Paso | Cuándo (por defecto) | Qué se hace |
|---|---|---|
| **1 · Primer contacto e información** | El mismo día o el siguiente | Saludo ofreciendo correo, llamada o WhatsApp. Ficha de la formación, dossier y correo con los adjuntos. |
| **2 · Prueba social: opiniones** | Días 2 y 3 | Una opinión de la formación, el enlace con todas y «¿pudiste revisar la información?». |
| **3 · Última plaza y facilidades de pago** | Día 4 | Quedan pocas plazas, reserva con financiación y el plan de pagos. |
| **4 · Última oportunidad** | Días 7 y 8 | El último recurso: un descuento o una beca, según el campus. |
| **5 · Seguimiento de toda la base** | Final de mes | Un mensaje corto a quien no compró ni dijo que no. Sin presión de venta. |

Administración puede ajustar los pasos de su campus. **Manda lo que diga la
cola**, no lo que recuerdes. El detalle, en [02-prospectos.md](02-prospectos.md).

**Las reglas que no se saltan** (del documento comercial):

- **Plazas.** El número de plazas disponibles se **comprueba antes de cada
  envío**. El CRM no lo lleva: nunca se copia del mensaje anterior.
- **Mensajes cortos.** Si no cabe en la pantalla del móvil sin desplazarse,
  pártelo en dos o tres.
- **Horas y diploma.** Toda información de una formación lleva las horas
  lectivas y el diploma que se obtiene.
- **Doble canal.** Cada correo se avisa por WhatsApp.
- **Descuento.** El 5 % de contado es del paso 3 y solo en máster y diplomado.
- **Tono.** Las plantillas marcan el orden; las palabras las pones tú. Cambia la
  forma, nunca los datos ni los importes. Lo que va **entre corchetes** lo
  rellenas tú antes de enviar.

### 5.6 La venta

Cuando la persona dice que sí, **registras la venta** desde su ficha o desde
**Ventas**: la formación, el importe, el primer pago (si lo hay) y, si paga a
plazos, el plan de cuotas. Al registrarla, el prospecto pasa a **Convertido** y
aparece en **Clientes**. Ver [04-ventas-y-finanzas.md](04-ventas-y-finanzas.md).

### 5.7 La matrícula y el diploma

La matrícula es el alta de la persona en la formación, con sus documentos.
Llega sola cuando la persona rellena el formulario de admisión. Tú puedes
completar sus datos y subir documentos; **validarla o rechazarla es de
administración**.

La persona estudia en el campus virtual con un tutor. Al terminar pide su
**diploma**, que emite **Certifex** (el registro central de titulaciones) cuando
administración lo aprueba. Ver
[05-clientes-y-matriculas.md](05-clientes-y-matriculas.md).

Lo que te toca a ti: que **el nombre, el DNI y el correo de la persona estén
bien escritos** desde el principio. Son los que salen en la factura y en el
diploma.

---

## 6. El día a día de una gestora

1. Mira la **campana** y tus **recordatorios**.
2. En el **Dashboard**, el bloque **Lo que toca** te dice cuántos tienes para
   hoy, mañana y esta semana. Pulsa un tramo y se abre la cola con él puesto.
3. Trabaja **La cola del día**: abre a cada persona, haz el paso, apunta el
   contacto y pasa a la siguiente.
4. Atiende tu **WhatsApp** desde el Chat.
5. Registra las ventas y los cobros en el momento.
6. Cuando puedas, repasa el **Seguimiento de fin de mes**.

**Apunta cada contacto, en el momento**: qué le dijiste, qué contestó y qué
quedó pendiente. Otras personas leen la ficha, la cola se calcula con lo que
apuntas y los informes del equipo salen de ahí. Una nota interna no es un
contacto: si hablaste con la persona, apúntalo como llamada, correo o WhatsApp.

---

## 7. Lo que NO se toca

Casi todo se puede arreglar en el CRM, menos esto.

- **No borres una venta para corregirla.** Edítala o pide ayuda. Borrarla deja
  descolgados sus cobros, su factura y su comisión.
- **No borres contactos apuntados** para «limpiar» la ficha. Si te equivocaste,
  corrígelo.
- **Una factura con número no se borra ni se edita.** Se corrige con una factura
  de abono (rectificativa). Eso lo hace facturación.
- **No pongas «Convertido» a mano** ni cambies el canal de origen a ojo.
- **No cambies el nombre, el DNI o el correo de un cliente** sin confirmarlo con
  él.
- **Pon la fecha real de cada cobro**, no la de hoy.
- **Fusiona dos fichas solo si estás segura** de que son la misma persona, y deja
  escrito por qué.
- **No trabajes los prospectos de otra gestora**, aunque esa persona te escriba
  a ti. Avisa a tu administradora.
- **No compartas tu cuenta ni tu contraseña.** Lo que se hace con tu usuario
  queda a tu nombre.
- **Precios, descuentos y promesas:** los de la ficha de la formación y el
  dossier. Los porcentajes máximos de descuento y de beca son internos.
- **Los datos personales se quedan en el CRM.** No se copian a chats personales,
  hojas propias ni correos personales. No envíes capturas con datos de clientes
  fuera del equipo.
- **Si alguien pide que se borren sus datos**, no lo hagas tú: pásaselo a tu
  administradora.
- **La configuración no es tuya**: pasos del proceso, plantillas compartidas,
  integraciones, claves y usuarios los llevan administración y soporte. Si algo
  debería cambiar, pídelo en **Solicitudes de cambio**.

---

## 8. A quién preguntar

| Para… | Pregunta a… |
|---|---|
| Un prospecto, el reparto, una ausencia, un duplicado, spam o una ficha de otra gestora | Tu administradora de campus |
| Que te den o te quiten un permiso, o un campus | Tu administradora |
| Una factura, un cobro que no cuadra, una devolución, un pago de Stripe | Quien lleva la facturación de tu empresa |
| Qué se dice en cada paso, descuentos y becas | La dirección comercial |
| Algo que no funciona en el CRM | Un ticket desde el icono flotante de soporte (ver **Sistema › Soporte**) |
| Una mejora o un cambio en el CRM | **Sistema › Solicitudes de cambio** |
| Lo que trae cada versión | **Sistema › Novedades** |

Para hablar con el resto del equipo tienes **Sistema › Mensajes**.

---

## 9. Glosario

| Palabra | Qué es |
|---|---|
| **Prospecto / lead** | Persona que ha pedido información y aún no ha comprado. |
| **Cliente** | Prospecto que ha comprado al menos una vez. |
| **Gestora / asesora** | Quien atiende a los prospectos y vende. |
| **Campus / proyecto** | Una marca con sus formaciones y su campus virtual. |
| **Empresa / sociedad** | La sociedad que factura los campus. |
| **Ficha** | Todo lo de una persona: datos, historial, pasos, ventas, matrícula. |
| **Interacción / contacto** | Cada llamada, correo, WhatsApp o nota apuntada en la ficha. |
| **Recordatorio** | Aviso que te pones para volver a una persona un día concreto. |
| **Paso** | Cada momento del proceso comercial. |
| **Cola del día** | La lista de a quién te toca contactar hoy y con qué paso. |
| **Reparto / round-robin** | Cómo se asigna cada prospecto nuevo a una gestora, por turno. |
| **Duplicado / reincidente** | Ficha de alguien que ya había entrado antes; reincidente si pide la misma formación. |
| **Venta / conversión** | El registro de una compra. |
| **Cobro / pago / abono** | Cada pago que entra de una venta. En la pantalla de cobros sale como «Registrar abono». |
| **Cuota** | Cada plazo de una venta a plazos. |
| **Proforma** | Factura previa, sin valor fiscal, que pasa a factura al cobrarse. |
| **Factura rectificativa (abono)** | La que corrige o anula una factura ya emitida. |
| **Matrícula** | El alta de la persona en la formación, con sus documentos. |
| **Convocatoria** | Cada beca o edición que se ofrece, con su embudo. |
| **Dossier** | El PDF de la formación: programa, módulos y salidas. |
| **Moodle / campus virtual** | La plataforma donde estudian los alumnos. |
| **Consulta** | Una duda que un alumno escribe a su tutor desde el campus. |
| **Certifex** | El registro central que emite los diplomas. |
| **Make** | Herramienta que lleva los formularios de la web al CRM. |
| **Wasapi** | Herramienta para el envío en bloque del seguimiento de fin de mes. |
| **MCP** | La conexión que deja consultar el CRM desde Claude. |

---

## Guion del vídeo general (4 minutos)

Se graba sobre el CRM de pruebas con un usuario gestor de prueba y datos de
mentira.

1. **(0:00–0:20) Qué es.** «El CRM es donde vive cada persona que pide
   información: desde que entra hasta que recibe su diploma. Si no está aquí,
   no ha pasado.»
2. **(0:20–0:50) Entrar.** Pantalla de entrada, **Iniciar sesión**, y enseñar
   **¿Has olvidado tu contraseña?** sin pulsarlo.
3. **(0:50–1:30) Moverse.** El menú por secciones, abrir y cerrar Prospectos,
   la marca **Pruebas** y **Próximamente**. El selector de campus: un campus,
   una empresa, **Todos los proyectos**.
4. **(1:30–2:10) Búsqueda y atajos.** Ctrl + K, buscar un prospecto de prueba y
   abrirlo. Pulsar **?** y enseñar la lista de atajos. G y L para ir a
   Prospectos.
5. **(2:10–2:40) La campana.** Abrir la campana, **Ver todas**, las dos
   columnas **Para hacer** y **Para saber**.
6. **(2:40–3:20) El recorrido.** Con una ficha de prueba: entra el prospecto,
   la cola del día, se apunta un contacto, se registra una venta y pasa a
   Clientes. Solo enseñar dónde está cada cosa; el detalle va en los vídeos de
   cada apartado.
7. **(3:20–3:50) Lo que no se toca.** Leer en pantalla la lista del apartado 7
   de este manual.
8. **(3:50–4:00) Cierre.** «Si algo no te sale en el menú, no es un fallo:
   pídeselo a tu administradora.»
