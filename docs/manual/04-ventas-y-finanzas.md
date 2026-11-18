# Ventas y Finanzas

Menú: **Principal › Ventas** (la misma pantalla que **Finanzas › Ventas**) y la
sección **Finanzas**: **Dashboard**, **Ventas**, **Ingresos**,
**Conversiones**, **Egresos**, **Cuentas por cobrar**, **Cuentas por pagar**,
**Comisiones**, **Nóminas**, **Pendientes de facturar**, **Pagos Stripe**,
**PayPal y banco** (solo en pruebas), **Facturación**, **Facturas de
colaboradores** e **Integraciones**. Atajo **G** y después **A** para el panel
de Finanzas.

Muchas entradas de Finanzas llevan la marca **Pruebas**: funcionan, pero
están en revisión.

## Para qué sirve

Aquí se registra lo que se vende y lo que se cobra, y de ahí salen las facturas,
las comisiones y todas las cifras de dinero del CRM.

**La regla de oro: el dinero sale de los cobros apuntados**, no del importe de la
venta. Una venta de 1.000 € con 200 € cobrados son 200 € cobrados hasta que se
apunte el resto. Un cobro que no se apunta no cuenta, tampoco en tu puesto del
ranking.

---

## 1. Registrar una venta

Hay dos caminos. Los dos hacen lo mismo.

### Desde la ficha del prospecto (lo normal)

1. Abre la ficha y pulsa **Convertir lead** (o **Nueva conversión** en
   **Historial de compras**).
2. En **Registrar conversión**: el producto (con **+ Añadir más productos** si
   compra varios), el importe y el IVA (**Exento (sin IVA)** o **Precio ya
   incluye IVA (desglosar)**).
3. Elige si ha pagado: **Sin pago**, **Parcial** o **Pagó TODO**. **La forma de
   pago sola no registra el cobro**: si no eliges, no hay cobro.
4. Forma de pago: **Tarjeta**, **Tarjeta (Stripe)**, **Transferencia**,
   **Depósito bancario**, **Efectivo**, **Bizum**, **PayPal**, **Fraccionado** u
   **Otro**.
5. Si paga a plazos, **Plan de cuotas** con **Recalcular automáticamente**.
6. Si el producto tiene enlaces de pago, salen en **Enlace de pago para
   compartir**: cópialo y pégaselo al cliente.
7. Guarda. Sale **Venta registrada** y el prospecto pasa a **Convertido**.

Después, el CRM te dice qué pasa con la factura: **La factura no se emite
sola. El cobro está en la cola de facturación** (Finanzas › Facturación). Si la
venta no tenía ningún cobro, lo que toca es una **proforma**: reserva el número
y se convierte en factura cuando entre el pago.

### Desde Ventas

1. **Ventas** › **Nueva venta**. Hay que tener un campus elegido arriba.
2. Elige el tipo:
   - **Venta propia**: la registras tú y cuenta para ti.
   - **Venta de otra gestora**: eliges el prospecto y la venta queda de quien lo
     lleva.
   - **Venta automática (sin gestora)**: la registra la plataforma, de cero; no
     cuenta para ninguna gestora (solo administración).
3. En **Registrar venta**, **Cliente existente** (búscalo; escribe al menos 2
   caracteres) o **Cliente nuevo**.
4. La formación, el importe, la fecha y el pago. **Por la fecha que pongas se
   considera histórica (anterior a hoy) o del día.**
5. Si paga a plazos, **Plan de cuotas** con **Auto-distribuir**.

---

## 2. Apuntar cobros y cuotas

En la ficha, **Historial de compras**, cada venta tiene sus botones:

| Botón | Qué hace |
|---|---|
| **Registrar pago** | Abre **Registrar abono**: **Importe del abono (EUR)**, **Fecha** (pon la real), **Forma de pago** y, en transferencias y depósitos, **Referencia del banco**. |
| **Gestionar cuotas** | Abre **Cuotas de pago**: **Nº de cuotas**, **Fecha primera cuota**, **Añadir cuota**, **Marcar pagada** y **Guardar cuotas**. Las cuotas se reparten sobre lo **pendiente**, no sobre el total. |
| **Editar** | **Editar conversión**: producto, importe, forma de pago y fechas. El total nuevo no puede ser menor que lo ya cobrado. |
| Factura / proforma | **¿Emitir una proforma?** si no hay cobros, o **¿Emitir la factura?** si los hay. Ver el apartado 4. |
| **Devolver** | **Registrar devolución**. Está en **fase de prueba**: el propio CRM dice que no se use todavía en operativa real. |
| **Eliminar compra** | Pide **Motivo**. Se borran también sus pagos. **No lo uses para corregir**: edita. |

**Si el CRM te avisa de un cobro repetido** (mismo importe, seguido) y te
pregunta **¿Seguro que quieres registrarlo igualmente?**, compruébalo antes de
aceptar. Muchas veces es un doble clic.

**Los pagos por Stripe entran solos.** Antes de apuntar a mano un pago que se
hizo con tarjeta por Stripe, pregunta: podría quedar contado dos veces.

### Repartir una venta entre dos gestoras

Solo administración. En la venta, **Repartir venta** › **Añadir a alguien** ›
**A partes iguales** o los porcentajes a mano (tienen que sumar 100 %) ›
**Guardar reparto**. Cada una suma su parte en Ventas. **Deshacer el reparto**
devuelve la venta entera a su vendedora.

### Mi meta del mes

En Ventas, la tarjeta **Mi meta del mes** › **Poner meta**: ventas y cobrado.
El cobrado es la cifra del ranking.

---

## 3. Consultar ventas

**Ventas** enseña todas las ventas del periodo con filtros: **Empresa o
proyecto**, **Ver ventas de** (gestora), **Curso**, **Reparto** (**Todas**,
**Solo compartidas**, **Solo enteras**), **Desde**, **Hasta** y **Rápido**
(**Hoy**, **Semana**, **Mes**, **90 días**, **Año en curso**).

Cada fila lleva una etiqueta:

| Etiqueta | Qué es |
|---|---|
| **VENTA** | Una venta nueva registrada en el periodo. Dinero nuevo. |
| **CUOTA** | Una mensualidad cobrada en el periodo, de una venta que puede ser de hace meses. |
| **MISMA VENTA** | Una segunda factura de una venta que ya está en la lista. No es una venta más. |
| **COMPARTIDO** | Venta repartida entre dos gestoras. |

El botón **Tutoriales** explica cómo leer la pantalla sin malinterpretar los
números. **Análisis** abre **Análisis de ventas** (**Resumen**, **Por asesora**,
**Por cliente**). **Sin formación** lista las ventas cobradas que no dicen de
qué formación son: mientras no lo digan, **su profesor no cobra comisión** por
ellas. Se confirman una a una.

Pulsar una venta abre su detalle: **Datos de la venta**, **Plan de cuotas**,
pagos y facturas, con **Ficha del cliente** para volver.

---

## 4. Facturas

Menú: **Finanzas › Facturación**.

### Cómo va una factura

1. Se apunta el cobro. El cobro queda **esperando factura** en la cola.
2. Se completan los **datos fiscales** del cliente (**Nombre**, **NIF / DNI /
   CIF**, **Dirección fiscal**, **Código postal**, **Ciudad**, **País**).
3. Se emite: el CRM le pone número. **La emisión es manual a propósito**: así no
   salen dos facturas del mismo cobro.
4. Se envía al cliente: **¿Enviar factura por email?** › comprueba el correo ›
   enviar. Pasa a **Enviada**.

Una **proforma** es una factura previa, sin valor fiscal, para que el cliente
sepa qué va a pagar. Al cobrarla, **Apuntar cobro y facturar**: pasa a ser la
factura.

### La pantalla de Facturación

- La **cola de facturación por campus**: todo cobro sin factura sale aquí por
  orden de fecha, venga de Stripe o lo registre una gestora. **Se emiten en
  orden para que la numeración no se descoloque.** **Emitir la factura**
  propone el número siguiente.
- La lista de facturas con estados **Emitida**, **Enviada**, **Pagada** y
  **Cancelada**, y etiquetas **ABONO**, **PROFORMA**, **STRIPE**, **CUOTA**,
  **¿REPETIDA?**.
- **Cobros de Stripe sin asociar**: **no generan factura hasta asociarlos**.
  **Asociar en Pagos Stripe →**.
- **Configuración**: empresas emisoras, series, regímenes y el **Diseñador de
  facturas** (administración y soporte).

Un **borrador** (sale **— sin numerar —** o **BORRADOR — emitir**) es una
factura a la que le faltan datos fiscales. **Validar y emitir factura** pide los
datos que faltan.

### Lo que hay que saber

- **Una factura con número no se borra ni se edita.** Si tiene un error, se
  corrige con una factura rectificativa (abono). Lo hace facturación.
- **Cambiar solo las fechas** (emisión y pago, sin tocar importes) es **Guardar
  fechas**, para quien tenga ese permiso.
- Si falta algún número en la serie, sale arriba **No existen estos números:**
  con **Emitir la que falta**.
- Quien **lleva un equipo comercial** ve las facturas de su equipo, pero
  corregirlas, abonarlas, asociarlas o borrarlas lo hace la administración sin
  equipo. La pantalla lo avisa.

---

## 5. El resto de Finanzas

| Pantalla | Para qué |
|---|---|
| **Dashboard** (Contabilidad) | La caja del mes: **Ingresos cobrados**, **Facturado (emitido)**, **Por cobrar**, **Vencido**, **Egresos** y **Balance neto**; **Evolución mensual (12 meses)**, **Egresos por categoría** y **Ventas por vendedora**. Quien lleva equipo ve las cifras de su equipo; egresos y balance, solo la administración sin equipo. |
| **Ingresos** | Las entradas de dinero, con los mismos filtros que Ventas. |
| **Conversiones** | **Ingresos del mes**, **Conversiones del mes**, **Ticket medio** y los últimos pagos. |
| **Egresos** | Los gastos. **Nuevo egreso**: **Concepto**, **Importe (EUR)**, **Fecha** y **De quién es** (un campus o la empresa). Se descarga en **CSV**. |
| **Cuentas por cobrar** | Lo que los clientes tienen pendiente, en **Lista** o **Calendario**, con **Solo vencidas**. Una gestora ve lo suyo: **Tus cobros pendientes y sus vencimientos**. |
| **Cuentas por pagar** | Lo que debemos. **Nueva factura** (proveedor, concepto, importe, vencimiento) y **Registrar pago**. |
| **Comisiones** | Las comisiones del equipo comercial, por mes. **Pagar**, **Marcar todas como pagadas**, **Cerrar mes** y **Exportar**. |
| **Nóminas** | Plan de cada persona (**Fijo €/mes**, **€/hora**, comisiones) y **Generar/recalcular periodos**. |
| **Pendientes de facturar** | Ventas que quedaron sin importe (se marcó «convertido» sin registrar el precio). **Completar** para ponérselo. |
| **Pagos Stripe** | Los cobros por tarjeta. El CRM los trae solo cada cinco minutos. **Sincronizar** trae los últimos treinta días; **Importar desde el alta**, todo lo posterior a la fecha de corte. Los que salen **NO ASOCIADO** hay que asociarlos a su cliente y su venta. Las disputas salen marcadas **DISPUTA** con su fecha límite. |
| **PayPal y banco** | Solo en pruebas. Cobros de PayPal y extractos del banco: **Subir un extracto** (Norma 43 o CSV) y **Enlazar** cada abono con su venta. |
| **Facturas de colaboradores** | Las facturas que sube cada mes el personal externo. **Añadir colaborador**, ver la factura, anularla o marcarla pagada. |
| **Integraciones** | Los servicios conectados (Stripe, Brevo, Moodle de cada campus…). **Guardar credenciales**, **Probar conexión**. Ver [12-conexion.md](12-conexion.md). |

---

## Permisos

| Acción | Gestora | Admin | Soporte | Project manager |
|---|---|---|---|---|
| Ver sus ventas | Sí | Sí | Sí | Sí |
| Ver las ventas del equipo | No | Sí | Sí | Sí |
| Registrar una venta | Sí | Sí | Sí | No |
| Venta sin gestora | No | Sí | No | No |
| Apuntar cobros y cuotas | Sí | Sí | Sí | Sí |
| Borrar una venta (gestora: las suyas) | Sí | Sí | Sí | Sí |
| Repartir una venta | No | Sí | No | No |
| Devoluciones | No | Sí | Sí | No |
| Poner y quitar metas | La suya | La de su gente | No | No |
| Ver facturas (gestora: las suyas), crear, completar, enviar | Sí | Sí | Sí | Sí |
| Poner número al cobrar | No | Sí | No | No |
| Corregir y abonar | No | Sí | No | No |
| Configurar la facturación | No | Sí | Sí | No |
| Dashboard de Finanzas, egresos, cuentas por pagar | No | Sí | Sí | Sí (ver) |
| Cuentas por cobrar | Lo suyo | Sí | Sí | Sí |
| Comisiones y nóminas | No | Sí | Sí | Sí (ver) |
| Pagos Stripe: ver | Sí | Sí | Sí | Sí |
| Pagos Stripe: asociar | No | Sí | Sí | No |
| Integraciones: configurar | No | Sí | Sí | No |

Ojo: aunque la gestora tiene permiso para ver Pagos Stripe, Pendientes de
facturar y Facturación, esas entradas del menú solo salen a administración. Ver
[descuadres.md](descuadres.md).

## Errores frecuentes

| Lo que ves | Qué pasa y qué hacer |
|---|---|
| **Elige un proyecto o una empresa para registrar una venta** | Estás en la vista global. Elige un campus. |
| **Importe excede pendiente** | El cobro es mayor que lo que falta por pagar. Revisa el importe o edita la venta. |
| **Importe menor a lo ya pagado** | Al editar, el total nuevo no puede ser menor que lo cobrado. |
| **Factura en borrador** — **Faltan datos fiscales** | Completa los datos del cliente para emitirla con número. |
| **¿Emitirla igualmente, fuera de orden?** | Hay cobros más antiguos sin facturar. Emite primero los antiguos. |
| **Esta factura pasa de lo cobrado de la venta.** | El importe de la factura supera lo cobrado. Revísalo antes de seguir. |
| **Sin email** al enviar una factura | El cliente no tiene correo guardado. Añádelo en el diálogo. |
| Un cobro de Stripe que no aparece en la venta | Está **NO ASOCIADO**. Pon el correo en la ficha y sincroniza, o pide que lo asocien. |

## Guion del vídeo (4 minutos)

1. **(0:00–0:20)** «El dinero sale de los cobros apuntados, no del importe de la
   venta. Si no se apunta, no cuenta.»
2. **(0:20–1:20) Registrar una venta desde la ficha.** Prospecto de prueba ›
   **Convertir lead** › producto › **Parcial** › forma de pago › **Plan de
   cuotas** › guardar. Leer el aviso **La factura no se emite sola**.
3. **(1:20–2:00) Un cobro.** **Registrar pago** con fecha real y referencia.
   Enseñar el aviso de cobro repetido.
4. **(2:00–2:40) Ventas.** Filtros rápidos, las etiquetas **VENTA**, **CUOTA**,
   **MISMA VENTA**, y abrir **Tutoriales**.
5. **(2:40–3:20) Facturación.** La cola por campus, **Emitir la factura**,
   completar datos fiscales y **¿Enviar factura por email?** (con un correo de
   pruebas).
6. **(3:20–3:50) Cuentas por cobrar.** **Calendario** y **Solo vencidas**.
7. **(3:50–4:00)** «Una factura con número no se borra: se corrige con un
   abono. Eso lo hace facturación.»
