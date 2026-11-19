El mapa de todo lo que se conecta o se enciende en el CRM: dónde se configura en la web, qué hace falta y cómo está hoy. Cada función tiene su tutorial con los pasos. Lo que lleva un interruptor del servidor lo enciende el responsable técnico; aquí solo se dice si está encendido o apagado.

La columna «Hoy» es del **18/11/2026**.

## Todas las funciones

| Función | Dónde se configura | Qué hace falta | Hoy |
|---|---|---|---|
| [Stripe: cobros](tutorial:stripe) | Configuración › Integraciones › tarjeta «Stripe» | Una clave restringida de solo lectura de la cuenta de Stripe del campus. | En uso en los campus con Stripe. |
| [Stripe: webhook](tutorial:stripe#2-el-webhook-y-su-secreto) | La misma tarjeta, plegable «Webhook» | La dirección del CRM en Stripe y el secreto de firma de Stripe en el CRM. | Activo en los campus con Stripe. |
| [Stripe: disputas](tutorial:stripe#3-disputas-contracargos) | Finanzas › «Disputas de Stripe» | La clave de lectura tiene que poder leer las disputas. | La pantalla funciona; el repaso automático y sus avisos, apagados. |
| [Links de pago](tutorial:links-de-pago-instalacion) | Configuración › Integraciones › tarjeta «Links de pago» | Una clave restringida de escritura por campus. | **Encendidos**, con la clave puesta en todos los campus con Stripe. |
| [PayPal](tutorial:paypal) | Integraciones › tarjeta «PayPal» | La aplicación REST de la cuenta Business del campus. | Apagado. |
| [Extractos del banco](tutorial:banco-santander) | «PayPal y banco» › «Banco (extractos)» | Nada: se sube el extracto del banco. | Apagado. |
| [Datos fiscales de cada empresa](tutorial:facturacion#1-datos-fiscales-de-cada-empresa) | Finanzas › Facturación › «Configuración» | Razón social, CIF, dirección, correo de facturación, serie. | En uso. Revisar que cada empresa tenga CIF y correo. |
| [Anular una factura emitida](tutorial:anular-factura) | Finanzas › Facturación › «Anular» | El permiso «Anular y abonar». | **En uso.** Las emitidas ya no se borran. |
| [Factura automática](tutorial:facturacion#2-factura-automatica-y-cola-de-facturacion) | Nada aparte: se sigue en la «Cola de facturación». | El CIF de la empresa y los datos fiscales del alumno. | Apagada. |
| [Auditoría de facturación](tutorial:facturacion#3-auditoria-de-facturacion) | Aviso en toda la app y «Marcar como solucionado». | Los correos que reciben el aviso. | Apagada. |
| [Informe mensual a la gestoría](tutorial:facturacion#4-informe-mensual-para-la-gestoria) | Reportes › «Informe mensual para la gestoría» | El correo de la gestoría de cada empresa. | Se descarga a mano; el envío, apagado. |
| [Facturas de colaboradores](tutorial:facturas-colaboradores) | Finanzas › «Facturas de colaboradores» | La ficha de cada colaborador y el correo de facturación de la empresa que paga. | En uso. |
| [Monitask](tutorial:monitask) | Integraciones › tarjeta «Monitask» | La aplicación de Monitask: su ID, su secreto y la dirección de retorno. | Apagado. |
| [Brevo](tutorial:brevo) | Configuración › «APIs globales», la marca e Integraciones | La clave de Brevo y un remitente verificado. | Correo en uso; aviso de bloqueados, apagado. |
| [WhatsApp](tutorial:whatsapp) | WhatsApp › «Conexión» | Que cada persona escanee el QR con su móvil. | En uso. |
| [Moodle](tutorial:moodle) | Integraciones › tarjeta «Campus (Moodle)» | La dirección del campus y un token de administrador. | Campus a campus: lo dice «Salud de las conexiones». |
| [Meta Ads](tutorial:meta-ads) | Publicidad › «Meta Ads» | El ID de la cuenta y un token de usuario del sistema. | Sincroniza; la renovación de tokens, apagada. |
| [Google](tutorial:google) | Todavía no hay pantalla. | — | No existe aún. |
| [Tablero y GitHub](tutorial:tablero-github) | Equipo de Desarrollo › «Configurar tablero» › «GitHub» | El secreto del webhook, un token de solo lectura y quién es quién. | El tablero, en uso; la conexión con GitHub, apagada. |
| [Certifex](tutorial:certifex) | Diplomas y Certificaciones | Nada en la web: la conexión va en el servidor. | Panel en uso; la confirmación de datos del diploma, apagada. |
| [Asignación de leads](tutorial:asignacion-leads) | Configuración › «Asignación de leads» | Los dos escenarios de Make. | En uso en todos los campus. |
| [Copia diaria de la base](tutorial:copia-diaria) | No hay pantalla. | La clave del ZIP y los destinatarios. | Apagada. |
| [Otras](tutorial:otros) | Webhooks, MCP, conectores, WooCommerce, IA… | Ver su tutorial. | — |

![La pantalla Integraciones del CRM de pruebas](c1-integraciones.webp "Integraciones en el CRM de pruebas. Arriba, «Salud de las conexiones», que dice campus a campus qué conexión funciona (las celdas están desenfocadas a propósito). Debajo, las tarjetas.")

## Antes de tocar nada

- **Elige el campus arriba.** Casi todo se configura campus a campus: con «Todos» o una empresa elegida, las tarjetas no salen o no dejan guardar.
- **Mira primero «Salud de las conexiones»** en Integraciones y pulsa «Comprobar ahora»: dice, campus a campus, qué conexión funciona, cuál falla y por qué.
- Las claves se guardan **cifradas** y no se vuelven a enseñar. Para cambiar una, pega la nueva encima.
- Las claves no se mandan por WhatsApp ni por correo: en mano o con un gestor de contraseñas.

## Quién puede

| Permiso | Qué deja hacer |
|---|---|
| «Ver integraciones» | Ver las tarjetas y su estado, sin cambiar nada. |
| «Configurar integraciones» | Pegar claves, probarlas y desconectarlas. |
| «Configurar los links de pago» | Las reglas de los links y el webhook de la cuenta de Stripe. |
| «Ver la salud de las conexiones» | La tabla de arriba y «Comprobar ahora». |
