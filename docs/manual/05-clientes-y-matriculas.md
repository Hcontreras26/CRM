# Clientes y Matrículas

Menú: sección **Clientes**, con **Clientes**, **Revisión duplicados**, **Buscar
duplicados**, **Matrículas** y **Diplomas**. Atajo **G** y después **C**.

## Para qué sirve

- **Clientes**: las personas que ya han comprado, con lo que han pagado y lo que
  deben.
- **Duplicados**: limpiar fichas repetidas de la misma persona.
- **Matrículas**: el alta de cada alumno en su formación, con sus documentos.
- **Diplomas** (y **Certificaciones**, dentro de Matrículas): aprobar, emitir y
  enviar los diplomas de **Certifex**, el registro central de titulaciones.

---

## 1. Clientes

**Clientes** enseña quién ya compró: **Cliente**, **Gestora**, **Cuotas**,
**Compras**, **Facturado**, **Pendiente**, **Última compra** y **Último
contacto**. Una gestora ve solo los suyos.

- **Filtros principales**: **Gestor** (administración), **Programa**, **Estado
  pago** (**Pago parcial**, **Sin pagar**…), **Última compra desde/hasta** y
  **Orden** (**Más reciente**, **Más facturado**, **Más cobrado**, **Más
  pendiente de cobro**, **Nombre A→Z**).
- Arriba, **Salud de cobro** (cuánto se debe y cómo de cerca está de vencer) y
  **Próximos cobros**.
- En cada fila: **WhatsApp**, **Email** y **Nueva venta / upsell**.
- **CSV** descarga la lista (administración).

### Venderle otra formación a un cliente

En la fila, **Nueva venta / upsell** (o en su ficha, **Nueva venta**). Se abre
**Registrar venta** con el cliente ya elegido. Ver
[04-ventas-y-finanzas.md](04-ventas-y-finanzas.md).

### La ficha del cliente

**Datos de contacto**, **Datos fiscales** (se rellenan al completar una factura
y quedan guardados para las siguientes), **Fechas clave**, **Origen de tráfico**
y sus compras. Botones: **WhatsApp**, **Email**, **Nueva venta**, **Editar**,
**Fusionar** y **Ficha completa** (**Ver ficha completa en Prospectos**).

---

## 2. Duplicados

Solo administración.

### Revisión duplicados

Los duplicados que entran por formulario o webhook esperan aquí. Pestañas
**Pendientes**, **Aprobados**, **Fusionados** y **Descartados**. Los que piden
la misma formación salen marcados **REINCIDENTE**.

Con cada uno:

- **Aprobar (queda activo)**: es otra consulta legítima y se queda.
- **Fusionar al original**: es la misma persona y se une a la ficha de antes.
- **Descartar**: se borra (con **Motivo (opcional)**).
- **Ver ficha del nuevo →** y **Abrir original** para compararlos.

### Buscar duplicados

Para repasarlos a mano en un campus. **Fichas que comparten correo, teléfono o
usuario de WhatsApp con otra.** Se busca por nombre, correo, teléfono o número
de ficha; **Solo los que nadie ha revisado** deja solo los pendientes.

1. Marca la ficha que se queda (**Esta es la ficha que se queda**).
2. Deja marcadas las que se cierran.
3. Escribe **Por qué son la misma persona** (queda en el historial de todas).
4. Fusiona. Sale **Fusionadas**. El historial completo (interacciones,
   recordatorios, ventas, matrículas, correos y el chat de WhatsApp) pasa a la
   que se queda.

Si una de las que vas a cerrar tiene venta, el CRM avisa: **Una de las fichas
que vas a cerrar tiene venta**.

---

## 3. Matrículas

Menú: **Clientes › Matrículas**. Pestañas: **Listado**, **Webhooks de
admisión**, **Certificaciones** y **Diplomas** (las tres últimas, según
permisos).

### Cómo llega una matrícula

Cuando alguien rellena el **formulario de admisión** de la web, el CRM crea una
matrícula en **Solicitud admisión**. Si la persona ya tiene ficha (la gestora que
le está vendiendo), la solicitud se une a ella y a su venta; si no, se guarda sola
y **no** se crea ningún prospecto: es un respaldo de sus datos para matricularla,
que ven todas las gestoras del campus. Los formularios de admisión se conectan en
la pestaña **Webhooks de admisión** (administración). Hoy no hay un botón para
crear una matrícula a mano desde la pantalla.

### Los estados

| Estado | Qué significa |
|---|---|
| **Solicitud admisión** | Ha llegado la solicitud con sus datos. |
| **Datos validados** | Se han revisado los datos. |
| **Pendiente** | Falta algo para cerrarla. |
| **Validada** | Todo correcto. |
| **Rechazada** | No se admite, con su motivo. |

### Trabajar una matrícula

1. En **Listado**, filtra por estado, curso, campus o fecha (**Recibida
   desde/hasta**, en hora de Madrid) y pulsa **Ver**.
2. En el detalle: **Datos de la persona**, **Documentos** (DNI, título, foto,
   firma…), **Vínculos** (su prospecto y su venta), **Facturas de la venta** e
   **Historial**.
3. Completa lo que falte y **Guardar campos**. Sube los documentos que falten.
4. Administración cambia el estado: **Validar datos** (de Solicitud a Datos
   validados), **Validar matrícula** (a Validada) o **Rechazar** (pide el
   motivo).

---

## 4. Diplomas

Menú: **Clientes › Diplomas** (o la pestaña **Diplomas** de Matrículas). Sale
cuando el panel de Certifex está encendido en ese CRM.

El alumno pide su diploma desde Moodle al terminar. La petición llega aquí y
**Certifex no emite nada que no se apruebe en el CRM**.

### Las pestañas

| Pestaña | Qué hay |
|---|---|
| **Pendientes** | Solicitudes **Por decidir** y diplomas **Emitido, falta enviarlo**. |
| **Terminaron sin pedir** | Alumnos que Moodle da por terminados y no han pedido el diploma. **Pasar a pendientes** para emitirlo. |
| **Emitidos** | Lo enviado, con el aviso al alumno: **Pendiente de aviso**, **Enviado**, **No salió**, **Emitido fuera del CRM**. |
| **Rechazados** | Lo rechazado, con su motivo. |
| **Revocados** | Diplomas anulados. |

### Aprobar y emitir

1. En **Pendientes**, revisa cada solicitud: **nombre** (sale **Tildes o
   mayúsculas** o **Distinto de Moodle** si algo no cuadra), **DNI** (obligatorio:
   **Sin DNI · Poner**), correo y formación. **Editar** para corregir.
2. Si falta la firma del alumno, **Sin firma · Subir** (PNG, JPG o WEBP).
3. **Aprobar y emitir**. Certifex genera el diploma con su número de expediente y
   su QR.
4. Revisa el PDF y **Enviar diploma al alumno** (o **Está bien: enviar al
   alumno**). Emitir no avisa al alumno: el correo sale solo cuando lo apruebas.

Para varios a la vez: márcalos y usa la barra de abajo (**Elegir todos los
pendientes de aviso**, **Enviar o reenviar**).

### Otros casos

- **Rechazar**: **El motivo es obligatorio: es lo que leerá el alumno si
  apruebas el aviso de rechazo. Rechazar no le avisa.** Después, **Enviar el
  aviso de rechazo**.
- **Corregir nombre**: mismo número y mismo QR. Si el alumno ya recibió el
  anterior, usa **Reenviar**.
- **Revocar**: pide **Motivo de la revocación**. **La verificación pública
  pasará a decir «revocado», con este motivo. No se avisa al alumno.**
- **Nuevo diploma**: **para un cliente que no pide el diploma desde Moodle**.
  Queda en «Por decidir» para aprobarlo y emitirlo.
- **Ver envío** › **Imprimir justificante**: la prueba de que el correo salió
  (con rebotes, spam o dirección no válida si los hubo).

### Certificaciones

Pestaña **Certificaciones** de Matrículas (administración): los cursos y alumnos
de cada campus con su nota y avance. Se elige un campus, se marcan alumnos y
**Aprobar** o **Rechazar**. **Todo lo aprobado y sin título no se borra**: si
luego resulta que no tocaba, solo se puede revocar. Desde aquí también se ven
las **consultas** que escriben los centros desde la web de Certifex (**Certifex ·
Consultas**): para responder, se escribe al centro desde tu correo; aquí solo se
apunta el estado y una **Nota interna**.

---

## Permisos

| Acción | Gestora | Admin | Soporte | Project manager |
|---|---|---|---|---|
| Ver clientes (gestora: los suyos) | Sí | Sí | Sí | Sí |
| Vender a un cliente, editarlo | Sí | Sí | No | Sí |
| Borrar un cliente, exportar CSV | No | Sí | No | No |
| Revisar y fusionar duplicados | No | Sí | Sí | No |
| Ver matrículas | Sí | Sí | Sí | Sí |
| Completar datos y subir documentos | Sí | Sí | Sí | No |
| Validar, rechazar o cerrar una matrícula | No | Sí | Sí | No |
| Ver diplomas (solo lectura) | No | Sí | No | Sí |
| Emitir diplomas (revisar, aprobar y emitir, enviar, crear uno nuevo) | No | Sí | No | No |
| Rechazar, corregir y revocar diplomas | No | Sí | No | No |
| Consultas de Certifex | No | Sí | Sí | Sí (ver) |

A una persona concreta se le puede dar **Diplomas (Certifex) · Ver** (solo
lectura) o **Emitir diplomas** (sin rechazar, corregir ni revocar).

## Errores frecuentes

| Lo que ves | Qué pasa y qué hacer |
|---|---|
| **Solo administración** — **Los diplomas los aprueba, envía y revoca administración.** | No tienes permiso. Si necesitas verlos, pide **Diplomas (Certifex) · Ver**. |
| **Pon el DNI para poder emitir** | El DNI (o NIE o pasaporte) es obligatorio en el diploma. **Sin DNI · Poner**. |
| **Este cliente no tiene correo** | Añádelo en su ficha para poder enviarle el diploma. |
| **Aprobado, pero el correo está apagado** | El envío queda aprobado a tu nombre, pero el correo de Certifex está apagado. Cuando se encienda, usa **Reenviar**. |
| **Los enlaces a Certifex no abren desde fuera** | Mientras tanto no salen avisos al alumno. **Ver PDF** sí funciona. |
| **Has cambiado datos de esta solicitud y no los has guardado** | Guarda antes de salir o se pierden. |
| **Una de las fichas que vas a cerrar tiene venta** | Revisa bien cuál se queda: la venta pasará a ella. |

## Guion del vídeo (4 minutos)

1. **(0:00–0:20)** «Cuando alguien compra, pasa a Clientes. Después viene su
   matrícula y, al final, su diploma.»
2. **(0:20–1:00) Clientes.** Filtros por estado de pago, **Salud de cobro**,
   abrir una ficha de cliente de prueba y **Nueva venta**.
3. **(1:00–1:40) Duplicados** (administración). **Revisión duplicados** con un
   caso de prueba: **Aprobar**, **Fusionar al original**, **Descartar**.
4. **(1:40–2:30) Matrículas.** Una solicitud de prueba: datos, documentos,
   **Guardar campos** y **Validar datos** › **Validar matrícula**.
5. **(2:30–3:40) Diplomas.** **Pendientes**, revisar nombre y DNI, **Aprobar y
   emitir**, ver el PDF y **Enviar diploma al alumno** (con un alumno de
   prueba). Enseñar **Rechazar** y leer que no avisa al alumno.
6. **(3:40–4:00)** «El nombre, el DNI y el correo salen en el diploma: que estén
   bien desde la venta.»
