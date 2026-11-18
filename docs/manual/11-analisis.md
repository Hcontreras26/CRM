# Análisis

Menú: sección **Análisis**, con **Reportes** y **Feedback**. Atajo **G** y
después **R** para Reportes.

Las pantallas de IA del CRM (Análisis IA, Pregunta a tus datos y Chat IA) están
**apagadas**: para preguntar a los datos se usa Claude por el MCP (ver
[12-conexion.md](12-conexion.md)). Si alguien entra por su dirección antigua,
vuelve al inicio sin error.

## Para qué sirve

- **Reportes**: los números del equipo y de cada campus, descargables.
- **Feedback**: por qué no compra la gente que pidió información.

---

## 1. Reportes

Arriba, el **Periodo que estás viendo** (desde–hasta) y los botones **CSV** y
**PDF**. Todo respeta el campus o la empresa elegidos.

| Bloque | Qué cuenta |
|---|---|
| Las cifras de arriba | **Total prospectos**, **Tasa conversión**, **Ventas cobradas** y **Por cobrar**. Cuenta las **ventas cerradas en el periodo**, por su fecha de venta; «Ventas cobradas» es lo cobrado **de esas** ventas, no el dinero que entró en el periodo. |
| **Resumen del periodo** | El dinero que entró en el periodo, contra el periodo anterior. |
| **El equipo este mes** | El ranking por lo cobrado, con **De ventas del mes**, **De ventas anteriores** y **Cuotas**. |
| **Asesoras, mes a mes** | Cada gestora por meses. Pulsa cualquier número para ver los registros que hay detrás. **Por cobro** cuenta el dinero en el mes en que entró; **Por factura**, en el mes en que se emitió la factura (como cuadra contabilidad). |
| **Tasa de cierre** | De los que entraron, cuántos compraron, por gestora. **¿de dónde sale?** lo explica. Los meses en línea discontinua no han cerrado y todavía pueden subir. |
| **¿Dónde ponemos el dinero?** | Por canal y por campaña: **Gasto**, **Prospectos**, **Ventas**, **Cobrado**, **Coste por venta** y **Retorno**. Los canales sin gasto (orgánico, ChatGPT, referidos, WhatsApp) salen igual. **Descargar CSV**. |
| **Por país de entrada** | Prospectos, convertidos, tasa y ventas por país. |
| Actividad por comercial | Llamadas, WhatsApp, correos y personas tocadas por cada gestora. |
| **Cuánto pone cada proyecto** y **De dónde vienen estas cifras** | El reparto por campus. Los totales de arriba son la suma de esta tabla. |
| **Seguimiento y tiempos** | Hasta qué contacto llega cada prospecto y cuánto se tarda. |
| **Feedback · por qué no compran** | Resumen del feedback, con **Ver el panel**. |

### Descargar

- **Prospectos + Ventas (descargable)**: marca **Incluir ventas (convertidos)** y
  **Limitar al período seleccionado**, y **Descargar Excel**.
- **Reporte de ventas**: ventas cerradas del período con cliente, producto,
  importe, pagado y pendiente.
- **Reporte de prospectos + ventas**: todos los prospectos del período.

### El baremo de la tasa de cierre

Administración puede decir qué tasa es buena o regular en cada campus: **Añadir
tramo** (cada tramo vale desde su porcentaje hasta el siguiente) o **Quitar el
baremo**. El **Baremo general** vale para los campus que no tengan el suyo; lo
cambia solo el superadmin.

---

## 2. Feedback

A quien pidió información y no siguió adelante se le puede mandar una encuesta
corta («¿por qué has desistido?»). La encuesta se abre sin entrar al CRM y solo
se contesta una vez.

### En la ficha del prospecto

Cuando toca, sale **Correo de feedback pendiente de revisar**. La gestora decide:
**Enviar ahora** o **No enviar**. Si la persona no tiene correo, no se puede
mandar.

### El panel

Menú: **Análisis › Feedback**. **Por qué no compran**:

- **Enviados**, **Respondidos**, **Tasa de respuesta** y **Nota de atención**
  (de 1 a 5).
- El motivo que más se repite (**El precio**, **Las fechas no le encajan**,
  **Eligió otro centro**, **No le contestaron a tiempo**…), separando lo que
  **depende de nosotros**.
- **Lo que escribieron al poner Regular, Mal o Muy mal.**
- **Mes a mes** y el **Desglose** por campus y gestora.

---

## Permisos

| Acción | Gestora | Admin | Soporte | Project manager |
|---|---|---|---|---|
| Sus informes (los de la gestora, los suyos) | Sí, desde el Dashboard | Sí | Sí | Sí |
| El resumen de todo el equipo (Reportes) | No | Sí | Sí | Sí |
| ¿Dónde ponemos el dinero? | No | Sí | No | Sí (ver [descuadres.md](descuadres.md)) |
| Cambiar el baremo de la tasa | No | Sí | No | No |
| Ver el puesto de otra gestora | No | Sí | Sí | Sí |
| Ver el feedback y enviar la encuesta | Sí (en la ficha) | Sí | Sí | Sí |

## Errores frecuentes

| Lo que ves | Qué pasa y qué hacer |
|---|---|
| Las ventas de Reportes no coinciden con las de Finanzas | Reportes cuenta ventas por su fecha de venta; el Resumen y Finanzas, el dinero por su fecha de cobro. Mira qué bloque estás comparando. |
| **La suma de los campus no cuadra con el total de la sociedad** | Una de las dos cifras cuenta algo que la otra no. Avisa a soporte con el periodo. |
| **No se pudo generar el reporte** | Prueba con un periodo más corto. |
| **El correo de feedback no salió: lo paró el freno de correos de pruebas.** | En pruebas los correos solo salen a direcciones permitidas. Es normal. |

## Guion del vídeo (3 minutos)

1. **(0:00–0:20)** «Reportes son los números del equipo; Feedback, por qué no
   compra la gente.»
2. **(0:20–1:00)** El periodo, las cifras de arriba y el aviso de que cuentan
   ventas cerradas, no dinero entrado.
3. **(1:00–1:40)** **Asesoras, mes a mes**: pulsar un número y ver los
   registros. **Por cobro** frente a **Por factura**.
4. **(1:40–2:10)** **¿Dónde ponemos el dinero?** y **Descargar CSV**.
5. **(2:10–2:40)** **Feedback**: los motivos y lo que escribieron.
6. **(2:40–3:00)** En una ficha de prueba, **Correo de feedback pendiente de
   revisar** con **Enviar ahora** / **No enviar**.
