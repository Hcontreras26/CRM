# Conexión

Menú: sección **Conexión**, con **MCP**, **Moodle**, **Conectores**, **Webhook
de transferencias** y **Asignación de leads**.

## Para qué sirve

Todo lo que conecta el CRM con otros sistemas:

| Entrada | Para qué |
|---|---|
| **MCP** | Consultar los datos del CRM desde Claude, hablándole como a una persona. |
| **Moodle** | Ver los cursos, alumnos y recursos del Moodle de cada campus, sin salir del CRM. Solo lectura. |
| **Conectores** | Traer datos de fuera al CRM (cursos o pedidos de una tienda, entradas de un WordPress…). |
| **Webhook de transferencias** | Avisar a otro sistema cada vez que se apunta un cobro por transferencia o depósito. |
| **Asignación de leads** | Que cada formulario vaya a la gestora que está trabajando en ese momento. |

La configuración de Stripe, Brevo y el Moodle de las consultas está en
**Finanzas › Integraciones** ([04-ventas-y-finanzas.md](04-ventas-y-finanzas.md)).

---

## 1. MCP (Claude)

Con el MCP, Claude puede **consultar** el CRM (no cambia nada): «¿cuántas
ventas llevamos este mes por campus?». Cada persona ve en Claude solo lo que ve
en el CRM.

### Conectar tu Claude

1. Entra en **Conexión › MCP**.
2. Si ya hay una conexión para ti en **Conexiones de Claude**, pulsa **Sacar mi
   URL**. Si no, **Nueva conexión con Claude**: elige **Qué podrá consultar
   Claude** (un campus, una empresa entera o, si eres superadmin, todo el
   sistema), ponle **Nombre** y **Crear y ver mi URL**.
3. Copia la URL. **Solo se enseña ahora.** Pulsa **Ya lo he copiado**.
4. En Claude (escritorio o web): **Configuración › Conectores › Agregar conector
   personalizado**. Ponle un nombre, pega la URL y déjalo **sin OAuth**.
5. La primera vez, el CRM puede pedir un código para autorizar esa conexión:
   sale en la pantalla del MCP (**Autorizar**, **Copiar**). Dáselo a Claude.

**Esta URL es tu llave: quien la tenga consulta el CRM con tus permisos. No la
compartas ni la pegues en capturas.** Si la pierdes o se filtra, pide una nueva
en la conexión: la anterior deja de funcionar.

Si no tienes ningún campus asignado: **No tienes ningún campus asignado: Claude
no verá nada.**

### Para administración

- **Claude conectados del equipo**: quién tiene conexión, para qué y cuándo la
  usó. **Revocar** la quita.
- **Actividad**: cada consulta que se ha hecho al CRM desde Claude: quién, qué,
  cuándo y con qué resultado.
- Superadmin: el **Interruptor de emergencia**. **Apagar el MCP** deja todas las
  URLs sin respuesta al momento (pide el motivo, que queda en la Actividad).
  **Encender el MCP** lo vuelve a abrir.

---

## 2. Moodle

**El Moodle de cada campus · solo lectura.**

1. **Moodle › Cursos y alumnos** enseña **Campus conectados** (con **Cursos activos** y
   **Cursos en total**) y **Pendientes de conectar**. Cada campus sale
   **Conectado**, **Sin conectar** o **No responde**.
   Con un campus elegido arriba abre directamente sus cursos; con **Todos**, la
   lista. Cuenta como conectado el campus con su Moodle en **Integraciones ›
   Moodle** (el de todo el CRM) o con un token de solo lectura puesto aquí. Si
   no tiene ninguno, dice **Este campus no tiene Moodle conectado** y lleva a
   Integraciones.
2. **Abrir** un campus: sus cursos, con buscador, filtros por categoría y estado
   y **Para revisar**:
   - **Nadie matriculado**: cursos activos sin alumnos.
   - Cursos con alumnos que no han entrado en 30 días.
   - Alumnos a los que no se ha visto entrar jamás.
3. Pulsa un curso para ver su estado, alumnos y recursos.

### Conectar un Moodle

Solo superadmin. En un campus **Pendiente de conectar**, **Conectar**: la
**Dirección de su Moodle** (la de su página de inicio) y el token de un servicio
web de solo lectura. **¿Cómo consigo el token?** explica los pasos en el Moodle
y **Funciones del servicio** › **Copiar todas** da la lista de funciones que
necesita. El token **se guarda cifrado en el servidor y no se vuelve a
mostrar**. Para quitarlo: **Conexión** › **Desconectar este Moodle**.

---

## 3. Conectores

**Traer datos de fuera al CRM.** El CRM va a buscar los datos **cuando tú le das
a importar**; nunca escribe en el sitio de origen.

1. **Nuevo conector**. Elige el tipo: los cursos de una tienda WooCommerce al
   catálogo, los pedidos de una tienda, o entradas y páginas de un WordPress.
2. **Para quién** (un campus, una empresa o todo el sistema), **Campus por
   defecto**, **Nombre** y los datos de acceso. **Las claves se guardan en el
   servidor y no se vuelven a mostrar.**
3. **Probar y mapear**: el CRM se conecta, trae una muestra y propone de dónde
   sale cada campo. Revísalo. **Conectado. Nada se importa hasta que lo pidas.**
4. Importa.

**Si buscabas otra cosa:** para que te avisen cuando entra un prospecto, es
**Captación › Webhooks**; para Claude, **MCP**; una tienda WooCommerce que se
sincronice sola tiene su pantalla en **Catálogo › WooCommerce**.

---

## 4. Webhook de transferencias

Avisa a otro sistema (por ejemplo, contabilidad en Make) **solo cuando se apunta
un cobro con forma de pago transferencia bancaria o depósito bancario**: al dar
de alta una venta con su primer pago, al registrar un abono, al cobrar una
proforma o una cuota. **Con tarjeta, Stripe, efectivo, Bizum o PayPal no se envía
nunca.**

1. **Nuevo webhook**: **Nombre**, **URL de destino** (empieza por https://),
   **Para quién** y las formas de pago.
2. **Secreto**: el CRM genera uno (o **Pegar el mío**, de al menos 16
   caracteres). Se enseña **una sola vez**: **Ya lo he guardado**. Con él, quien
   recibe comprueba que el aviso viene del CRM.
3. **Encendido** y guardar. **Enviar prueba** para comprobarlo.
4. **Últimos envíos**: cada aviso con su estado (**Enviado**, **Reintentará**,
   **Enviando**, **Fallido**). **Reenviar** los que fallaron.

---

## 5. Asignación de leads

Para los campus cuyo formulario pasa por Make. El formulario no va directo a una
gestora por turno: primero pregunta al CRM **quién está trabajando ahora**.

**Cómo funciona.** La entrada de Make manda el formulario al CRM. Si hay alguna
gestora **activa**, el CRM crea el prospecto con ella y lo manda al **escenario
2**. Si no hay ninguna, lo manda al **escenario 1**, que lo crea como siempre. Si
el CRM no contesta, Make lo manda al escenario 1 por su cuenta.

**Qué cuenta como «activa».** Cualquier acción en el CRM en los últimos minutos
(15 de serie): llamada, correo o WhatsApp registrado, nota, cambio de estado,
recordatorio, paso del proceso, editar o crear un prospecto, una venta, un
cobro, una matrícula o una factura. **No cuentan** abrir una ficha, tener la
sesión abierta o una nota de menos de 20 caracteres. Entre varias activas, la
que menos prospectos lleva hoy en ese campus.

Para administración:

1. **Nueva**: elige el campus y el formulario, y las direcciones del escenario 1
   y del 2. Copia la **Dirección de la entrada** y la clave (**solo se enseña una
   vez**: **Ya la he copiado**).
2. Móntalo en Make siguiendo **Cómo montarlo en Make, paso a paso** de la propia
   pantalla.
3. **Encendida** (apagada, todo va al escenario 1).
4. Abajo, cada decisión: **Cuándo**, **Campus · formulario**, **Escenario**,
   **Gestora · por qué** y **Envío**. **Reenviar** si falló.

---

## Permisos

| Acción | Admin | Superadmin | Project manager | Soporte, gestora |
|---|---|---|---|---|
| Usar el MCP (su URL) | Sí | Sí | Solo si se le da | Solo si se le da |
| Dar o quitar el MCP y ver la actividad | Sí (sus campus) | Sí | No | No |
| Apagar el MCP | No | Sí | No | No |
| Ver el Moodle de los campus | Sí | Sí | Sí | No |
| Conectar un Moodle | No | Sí | No | No |
| Conectores: ver | Sí | Sí | Sí | No |
| Conectores: crear, editar, importar | Sí | Sí | No | No |
| Conectores de todo el sistema | No | Sí | No | No |
| Webhook de transferencias y Asignación de leads: ver | Sí | Sí | Sí | No |
| Webhook de transferencias y Asignación de leads: crear y cambiar | Sí | Sí | No | No |
| Para todas las empresas | No | Sí | No | No |

El tutor y el tutor redactor no pueden usar el MCP nunca.

## Errores frecuentes

| Lo que ves | Qué pasa y qué hacer |
|---|---|
| Claude dice que no puede consultar | Puede que el MCP esté apagado (**El MCP está APAGADO**), que la URL se haya renovado o que falte autorizar el código. Mira la pantalla del MCP. |
| **Apagada: sus URLs no traen nada** | Esa conexión está apagada. |
| **Funciona, pero al servicio del token le falta alguna función** | En el Moodle, añade al servicio las funciones de **Copiar todas**. |
| **No se ha guardado nada** (Moodle) | La dirección o el token no valen. Revisa los dos. |
| **No se pudo conectar** (conector) | Suele ser la dirección o las credenciales. Edita el conector y vuelve a probar. |
| **Tiene que empezar por https://** | La URL de destino tiene que ser segura. |
| **Sigue sin entrar** al reenviar | El sistema de destino no responde. Se volverá a intentar. |

## Guion del vídeo (4 minutos)

1. **(0:00–0:20)** «Conexión es lo que une el CRM con otros sistemas. Casi todo
   es de administración, salvo el MCP, que puede usar quien lo tenga.»
2. **(0:20–1:30) MCP.** **Nueva conexión con Claude**, **Crear y ver mi URL**
   (difuminar la URL en el vídeo), y en Claude, **Agregar conector
   personalizado**. Hacer una pregunta sencilla de prueba.
3. **(1:30–2:20) Moodle.** La lista de campus, abrir uno, **Para revisar** y un
   curso.
4. **(2:20–2:50) Conectores.** **Nuevo conector** y **Probar y mapear** con un
   origen de prueba.
5. **(2:50–3:30) Webhook de transferencias.** Cuándo se envía (solo
   transferencia y depósito), **Enviar prueba** y **Últimos envíos**.
6. **(3:30–4:00) Asignación de leads.** Leer **Cómo funciona** y **Qué cuenta
   como «activa»**.
