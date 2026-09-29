# Plantillas de WhatsApp · para Ángel

11/09/2026. Diego: «necesitamos un apartado para plantillas de WhatsApp que las
gestoras puedan usar, hazla y mándasela a Ángel».

**La pantalla está hecha y montada en los dos /testeo.** Esto es para que sepas
qué hay, qué no toqué y qué queda de tu parte. No hay que rehacer nada.

## Qué plantillas tenemos hoy

Diez, las del documento comercial, cargadas por la migración 151 en **cada**
proyecto (en MultiCRM son 10 proyectos × 10 = 100 filas; en ISEIE, 10):

| Día | Plantillas |
|---|---|
| **Día 1 · Primer contacto** | Saludo · Ficha de la formación · Aviso de correo enviado |
| **Día 2 · Prueba social** | Opiniones 1 de 3 · 2 de 3 · 3 de 3 |
| **Día 3 · Última plaza** | Última plaza 1 de 2 · 2 de 2 |
| **Día 4 · Último recurso** | Descuento de última oportunidad *(MultiCRM)* · Becas CETLAT *(ISEIE)* |
| **Fin de mes** | Seguimiento de fin de mes |

Ocho de las diez llevan **pista**: la letra pequeña del PDF, que se ve pero
**no se envía**. Y la del día 2 lleva `pide_adjunto`, que abre el selector de
archivos al elegirla (la captura de Opynio va justo detrás).

Las cuatro viejas genéricas —«Saludo inicial», «Seguimiento», «Oferta»,
«Reactivar»— están **desactivadas**, no borradas. El backend filtra por
`active`, así que no salen por ningún lado. Si alguien las echa de menos,
están.

## Lo que ya funcionaba y no he tocado

Tu selector del chat (`SelectorPlantillas`) ya hace lo importante: busca sin
tildes, enseña la pista y la marca de imagen, rellena `{nombre}`, `{producto}`
y demás con los datos de esa conversación, y **mete el texto en el campo de
escribir sin enviarlo**. Eso está bien como está.

## Lo que he cambiado

`/whatsapp/plantillas` era **solo un editor**: diez cuadros de texto en
desorden, y para una gestora encima grises, porque las compartidas solo las
cambia un admin. No era un sitio donde buscar qué mandar.

Ahora la pantalla abre en modo **consulta**:

- agrupadas por el día del proceso, con una línea que dice de qué va cada grupo
- buscador por nombre **o por lo que dice el mensaje**
- el texto entero, con los huecos a la vista — que es como hay que leerlo
- la pista en ámbar, y la marca «imagen» donde toca
- botón **Copiar** y enlace **Ir al chat**

El editor sigue **entero**, detrás del botón «Editar». No he quitado nada:
crear, guardar, borrar en dos pasos y los ámbitos siguen igual.

El grupo sale del **nombre** de la plantilla («Día 1 · …»), no de una columna
nueva. Lo que alguien cree a mano cae en «Otras», que es donde debe caer: una
columna obligaría a rellenarla cada vez que una gestora se crea una suya.

## Lo que queda, y es tuyo

De tus seis de WhatsApp, esta las toca de refilón:

1. **Que solo las gestoras vean el chat** — sigue pendiente.
2. **Zadarma**: la llamada de los días 2, 3 y 4 la exige el documento y hoy no
   existe. Es la que más falta hace del proceso.
3. **Mayús+Enter** para salto de línea.
4. **Etiquetas** de conversación.
5. **La sincronización que llega vacía**.
6. **Usar las plantillas del proceso en el chat** — esta ya está: el selector
   las coge solas porque salen de la misma tabla. Solo confirma que las ves en
   el chat de /testeo.

## Un aviso nuevo que verás

Desde hoy, las plantillas que dicen «quedan [nº] plazas» llevan un
**«comprueba las plazas»**. Diego: las plazas las llevan en admisión, **fuera
del CRM**. El CRM ya no las calcula — las calculaba y se ha quitado — solo
recuerda ir a mirarlas. Si tocas el chat, no montes ningún contador.

## Dónde probarlo

- MultiCRM: `https://360crm.tech/testeo/whatsapp/plantillas`
- ISEIE: `https://crm.iseie.com/staging/whatsapp/plantillas`

Elige un proyecto concreto: sin proyecto no hay plantillas que enseñar, porque
son de cada proyecto.

La pantalla es **el mismo fichero en los dos CRMs**, byte a byte. Si la tocas,
que siga siéndolo.
