# Captación

Menú: sección **Captación**, con **Email**, **Formularios**, **Make**,
**Webhooks** y **Widget web**. **Campañas** y **Tráfico orgánico** salen como
**Próximamente**: aún no tienen datos reales (el gasto de Meta está en
**Publicidad**).

## Para qué sirve

Es por donde entran los prospectos al CRM y lo que se les manda solo al entrar:

| Entrada | Para qué |
|---|---|
| **Formularios** | Formularios hechos en el CRM para pegar en una web. |
| **Make** | Recibir prospectos desde un escenario de Make con la asesora ya asignada. |
| **Webhooks** | Recibir prospectos (o matrículas) desde cualquier sistema de fuera: Elementor, Zapier, código propio… |
| **Widget web** | El botón de WhatsApp de la web, que reparte a quién escribe cada visitante. |
| **Email** | Secuencias de correos automáticos. |

Es trabajo de administración. Una gestora no lo necesita para su día a día.

---

## 1. Formularios

1. **Nuevo form** (o la tecla **N**). Elige una plantilla: **Contacto básico
   (nombre + email + teléfono)**, **Lead con producto de interés** o **Custom
   (campos manuales)**.
2. Ajusta **Texto del boton**, **Color principal**, **Mensaje de exito** y, si
   quieres, **URL de redireccion (opcional)**. Marca **Activo**.
3. **Guardar**.
4. **Embed** da el código para pegar en la web: **Iframe** o **Script (Shadow
   DOM)**, y la **URL API publico**.

Lo que la persona ve al enviar: **¡Gracias! Hemos recibido tus datos.** Un
formulario desactivado sale como **INACTIVO**.

---

## 2. Make

Para los formularios que pasan por un escenario de Make.

1. **Nuevo conector** › **Nuevo conector Make**. Se crea en **modo test**: **Solo
   guarda el payload para inspección. NO crea leads.**
2. Copia la **URL del webhook (configura en Make)** y el **Secret** (cabecera
   X-Make-Secret) y ponlos en el módulo HTTP de Make.
3. Manda una prueba desde Make y mira lo que llega en **Historial de eventos
   recibidos** (**Ver payload**).
4. Haz el mapeo de campos y guárdalo.
5. Pásalo a **ACTIVO**: **Aplica el mapeo y crea leads en el CRM.**

Cada conector enseña **Recibidos**, **Leads creados** y **Errores**.

---

## 3. Webhooks

Para cualquier sistema que pueda mandar los datos en JSON.

1. **Nuevo webhook** (o la tecla **N**). Ponle **Nombre interno** y elige
   **¿Dónde van los datos?**: **Lead** o **Matrícula**.
2. Copia el **Endpoint del webhook (JSON)** (método POST). Si el formulario solo
   sabe mandar correos (Contact Form 7, WPForms…), usa el **Endpoint del
   mailhook (email entrante)**.
3. **Capturar estructura del payload** › **Esperar payload** › manda una prueba
   desde el sistema de fuera. Los campos aparecen: pulsa uno y elige a qué campo
   del CRM va (**Nombre**, **Email**, **Teléfono**, **País**, **Notas**…). Para
   juntar dos campos (prefijo y teléfono), asígnalos al mismo destino.
4. Enciéndelo: **Encender webhook**. Sale **● ESCUCHANDO**.

**Apagar webhook (no recibe más)** lo para sin borrarlo. El historial enseña
cada evento con su **Resultado**.

---

## 4. Widget web

El botón de WhatsApp de la web (**¿Hablamos? 👋**). Se configura **en cada
campus**: elígelo arriba.

- Qué gestoras salen en el botón y el mensaje.
- **Idioma del botón**: **Automático (el de cada página)** u otro.
- **Código para tu sitio web**: cópialo y pégalo en la web.
- **Los cambios se reflejan en ~1 minuto.**
- Abajo, cuántos **pulsan** el botón y cuántos **pasan a conversación**, por
  gestora, y desde qué páginas.

Si no salen pulsaciones y la web tiene el código antiguo, vuelve a pegar el
código.

---

## 5. Email (secuencias)

Correos que salen solos.

1. **Nueva secuencia** (o la tecla **N**).
2. Elige cuándo empieza: **Cuando se crea un lead**, **Cuando cambia el
   estado**, **Cuando se convierte** o **Manual (lanzar a mano)**.
3. **Añadir paso**: cada correo, con su espera en **horas tras anterior**.
4. **Guardar**. Una secuencia parada sale como **PAUSADA**.

Desde la ficha de un prospecto, **Enrolar en secuencia de email** lo mete a mano;
en la pestaña de la ficha se ve en cuál está y se puede **Detener**.

Las plantillas de correo se editan en **Configuración › Plantillas email**.

---

## Permisos

| Acción | Gestora | Admin | Soporte | Project manager |
|---|---|---|---|---|
| Ver formularios, secuencias y el widget | Sí, pero no le sale en el menú | Sí | Sí | Sí |
| Crear, editar y borrar formularios y secuencias | No | Sí | Sí | No |
| Poner o sacar a un prospecto de una secuencia | Sí | Sí | Sí | No |
| Make: ver | No | Sí | Sí | Sí |
| Make: crear y editar | No | Sí | Sí | No |
| Webhooks: ver | No | Sí | No | Sí |
| Webhooks: crear y editar | No | Sí | No | No |
| Widget: configurar | Sí, pero no le sale en el menú | Sí | Sí | Sí |

## Errores frecuentes

| Lo que ves | Qué pasa y qué hacer |
|---|---|
| **Formulario no disponible** (en la web) | El formulario está inactivo o se ha borrado. |
| El webhook recibe pero no crea prospectos | Está en **TEST** o sin mapeo. Revisa el modo y guarda el mapeo. |
| **Guarda primero el webhook para iniciar la escucha** | Guarda antes de pulsar **Esperar payload**. |
| **Activo sin mapeo guardado** (Make) | Entran con los campos reconocidos por su nombre habitual. Guarda el mapeo para no depender de eso. |
| El botón de WhatsApp no cambia | Espera un minuto; el cambio no es instantáneo. |

## Guion del vídeo (3 minutos)

1. **(0:00–0:20)** «Captación es por donde entran los prospectos. Es trabajo de
   administración.»
2. **(0:20–1:00)** **Formularios**: **Nuevo form** con **Contacto básico**,
   **Guardar** y **Embed**.
3. **(1:00–1:50)** **Webhooks**: **Nuevo webhook**, **Esperar payload**, mandar
   una prueba, mapear dos campos y **Encender webhook**.
4. **(1:50–2:20)** **Make**: modo **TEST** y **ACTIVO**, y dónde se ve lo
   recibido.
5. **(2:20–2:45)** **Widget web**: las gestoras del botón y el código.
6. **(2:45–3:00)** **Email**: una secuencia y sus pasos.
