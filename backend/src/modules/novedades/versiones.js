/**
 * Las novedades de cada versión, en UN solo sitio (Diego, 28/09).
 *
 * De aquí salen el apartado «Novedades», el aviso de la campana, el correo
 * al equipo y su PDF. Una versión nueva se añade ARRIBA: la primera es la
 * actual, y es la que se manda sola al arrancar en producción.
 *
 * `roles`: quién la ve con botón «Ir a…» (si no le toca, se lee igual).
 * `ruta`: la pantalla; null si no tiene una propia.
 */
/** Cómo se llama este CRM y su color: portada del PDF y cabecera del correo. */
export const CRM = { nombre: 'MultiCRM', color: '#1f3a5f' };

export const VERSIONES = [
  {
    "version": "2.0.0",
    "fecha": "2026-09-29",
    "titulo": "Versión 2.0.0",
    "intro": "El proceso comercial completo, la encuesta a quien no compra con la marca de cada campus, pantallas renovadas y muchos arreglos. Aquí está todo lo nuevo, con un botón para ir a cada pantalla.",
    "grupos": [
      {
        "titulo": "Proceso comercial",
        "items": [
          {
            "titulo": "La cola del día, para trabajarla sin salir",
            "texto": "Al pulsar a una persona se abre su panel con el mensaje del paso ya escrito con sus datos. Lo copias, apuntas el contacto y pasas a la siguiente con «Siguiente». La lista se agrupa por paso (día 1, día 2…) y enseña a todo el mundo, por páginas.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos/cola",
            "boton": "Abrir la cola del día"
          },
          {
            "titulo": "Buscar y filtrar en la cola",
            "texto": "Encima de la lista hay buscador por nombre, correo o teléfono, y filtros por formación, estado y fechas. El filtro de formación solo ofrece las formaciones que tiene la gente de la lista. Cada fila dice su estado, su campus y su gestora, y dentro del panel se despliega el historial de la persona.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos/cola",
            "boton": "Ir a la cola"
          },
          {
            "titulo": "Seguimiento de fin de mes",
            "texto": "Pantalla nueva dentro de Prospectos. Reúne a quien entró hace más de 15 días, no ha comprado ni ha dicho que no, y nadie ha tocado en el último mes. Primero sale quien nunca recibió un contacto; cada fila trae su estado, su teléfono y su correo.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos/seguimiento",
            "boton": "Abrir el seguimiento"
          },
          {
            "titulo": "El seguimiento, en bloque y para Wasapi",
            "texto": "Marca a varias personas y apúntales el contacto de una vez, o copia sus teléfonos o correos para una difusión. También puedes descargar la lista entera en el formato de Wasapi, con la opción de sacar solo a quien tiene formación apuntada.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos/seguimiento",
            "boton": "Ir al seguimiento"
          },
          {
            "titulo": "El proceso dentro de la ficha",
            "texto": "Al abrir un prospecto hay una pestaña «Proceso»: qué paso le toca, cuáles lleva hechos y el mensaje del paso listo para copiar, más un botón para escribir el correo del paso con su plantilla. En «Recordatorios» se ven las fechas de cada paso, y el Historial recoge ya llamadas, WhatsApp, notas y pasos dados.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos",
            "boton": "Ir a Prospectos"
          },
          {
            "titulo": "Tachar pasos, y el estado se pone solo",
            "texto": "Un paso se puede marcar como hecho aunque no haya un mensaje apuntado, y queda quién lo marcó y cuándo. Al apuntar el primer contacto, el prospecto pasa solo a «Contactado», y con el siguiente a «En seguimiento».",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos",
            "boton": "Ir a Prospectos"
          },
          {
            "titulo": "Filtro por paso y acciones en bloque en Prospectos",
            "texto": "En «Filtros» puedes elegir en qué paso del proceso va cada persona. Y al marcar varias, además de cambiar el estado o reasignar, les apuntas el contacto a todas o copias sus teléfonos y correos.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos",
            "boton": "Ir a Prospectos"
          },
          {
            "titulo": "Ajustar los pasos del proceso",
            "texto": "En «Proceso comercial» se dice claramente si un cambio vale para toda la empresa o para un solo campus. Cada paso puede llevar el aviso «comprueba las plazas», que sale en la cola, en la ficha y en la plantilla.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos/proceso",
            "boton": "Ver el proceso comercial"
          }
        ]
      },
      {
        "titulo": "«¿Por qué has desistido?» y la marca de cada campus",
        "items": [
          {
            "titulo": "El correo y la encuesta",
            "texto": "Cuando alguien pasa a «No interesado» le llega un correo con la marca de su campus y un enlace a una encuesta corta de seis preguntas. También a quien, 7 días después de su primer contacto, no ha comprado (cuenta desde el 29/09). Solo llega una vez por persona. Si pone Regular, Mal o Muy mal a la atención se le pide un comentario, y al final puede dejar los suyos. Lo que conteste queda en su ficha, pregunta a pregunta, y su gestora recibe un aviso.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": null,
            "boton": null
          },
          {
            "titulo": "Descartar con motivo",
            "texto": "Al descartar a alguien del seguimiento se abre una ventana grande: quién es, qué va a pasar y el motivo en botones. Puedes confirmar y enviar, o elegir «Quiero verlo antes»: el correo espera en su ficha con «Enviar» o «No enviar».",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos/seguimiento",
            "boton": "Ir al seguimiento"
          },
          {
            "titulo": "«Que me contacte más adelante»",
            "texto": "Si en la encuesta pide que le volvamos a contactar, elige cuándo: en dos semanas, en un mes… o el año que viene. A su gestora le aparece un recordatorio ese día.",
            "roles": [
              "gestor"
            ],
            "ruta": null,
            "boton": null
          },
          {
            "titulo": "Panel de Feedback",
            "texto": "En Análisis → Feedback: cuántos correos salieron, cuántos contestaron, los motivos que más se repiten, la nota media de atención de cada gestora y todo lo que escribieron: en «Otro», el porqué de una nota baja y sus comentarios. En «Mes a mes», cada cifra abre la lista de personas.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/informes/feedback",
            "boton": "Abrir Feedback"
          },
          {
            "titulo": "El feedback, también en Reportes",
            "texto": "Reportes tiene un bloque con esas cifras para las fechas elegidas y un botón para descargar todas las respuestas. Las cifras van también en la descarga general del informe.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/informes",
            "boton": "Abrir Reportes"
          },
          {
            "titulo": "Configurar esta marca: correos y formularios",
            "texto": "En «Configurar esta marca → General» hay una sección nueva: el fondo sobre el que va el logo, con vista previa, y el remitente «no contestar». El logo y los colores de la marca salen en el correo de feedback y en su encuesta. La cuenta de envío de correos de cada marca se cambia desde el panel, sin pedírselo a nadie.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": null,
            "boton": null
          }
        ]
      },
      {
        "titulo": "Pantallas nuevas y renovadas",
        "items": [
          {
            "titulo": "Un aspecto nuevo",
            "texto": "Colores más suaves y una cabecera fija con el nombre de la pantalla, la marca en la que estás y la campana. La marca o la empresa se cambia desde esa cabecera. El menú lleva un icono por sección y todos los formularios tienen el mismo formato.",
            "roles": [
              "gestor",
              "admin",
              "superadmin",
              "soporte",
              "tutor"
            ],
            "ruta": "/",
            "boton": null
          },
          {
            "titulo": "Prospectos, con sus cifras arriba",
            "texto": "Arriba, cuántos hay en cada estado y los avisos vencidos. Todos los filtros están en el botón «Filtros» y lo que tengas puesto se ve en píldoras al lado. Los tramos «hoy», «mañana» y «vencidos» están a la vista, sin abrir nada.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos",
            "boton": "Ir a Prospectos"
          },
          {
            "titulo": "Clientes, igual que Prospectos",
            "texto": "Cuatro cifras arriba: clientes, facturado, cobrado y pendiente. Debajo, la salud de cobro (vencido, esta semana, este mes), los próximos cobros y accesos directos.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/clientes",
            "boton": "Ir a Clientes"
          },
          {
            "titulo": "«Cómo voy»",
            "texto": "Cada gestora ve su puesto del mes, sus ventas y su tasa de conversión al lado de la media del equipo. Quien dirige ve un podio con las tres primeras y un desplegable con el ranking completo. Sale en el Dashboard, en Prospectos y en Clientes.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/",
            "boton": "Ir al Dashboard"
          },
          {
            "titulo": "Dashboard: «Lo que toca» y «Ayer y hoy»",
            "texto": "«Lo que toca» cuenta lo atrasado, lo de hoy, lo de mañana y lo de esta semana; cada número abre la cola ya filtrada, y también sale en Prospectos. «Ayer y hoy» da leads, contactados y ventas, contados igual que en Reportes.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/",
            "boton": "Ir al Dashboard"
          },
          {
            "titulo": "Último lead de cada gestora",
            "texto": "En Prospectos, quien dirige ve cuándo recibió cada gestora su último lead y cuántos días lleva sin recibir uno. Sirve para ver a tiempo si el reparto se está torciendo.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/prospectos",
            "boton": "Ir a Prospectos"
          }
        ]
      },
      {
        "titulo": "WhatsApp",
        "items": [
          {
            "titulo": "Plantillas por paso, desde cualquier sitio del chat",
            "texto": "Las plantillas se filtran por paso del proceso (Día 1, Día 2…). Ahora se abren también desde la barra de arriba del chat, aunque todavía no tengas una conversación abierta. Elegir una plantilla no la envía.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/whatsapp/chat",
            "boton": "Abrir el chat"
          },
          {
            "titulo": "Tus propias plantillas",
            "texto": "Con «Nueva mía» guardas una plantilla sin salir del chat, a partir de lo que estás escribiendo, y el filtro «Mías» te enseña solo las tuyas. Son del número de WhatsApp, no de quien entra. Desde la ficha también puedes escribir una propia para un paso concreto.",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/whatsapp/chat",
            "boton": "Abrir el chat"
          }
        ]
      },
      {
        "titulo": "Reportes y avisos",
        "items": [
          {
            "titulo": "Tus correos del CRM, con datos y con la marca",
            "texto": "Cada noche te llega «Tu día y lo de mañana»: lo que hiciste hoy, lo que te toca mañana en la cola, tus recordatorios con enlace y cómo va tu mes. Los lunes, «Tu semana»: tus números contra la semana anterior y la media del equipo, y tu puesto. Se apagan en «Mis preferencias».",
            "roles": [
              "gestor",
              "admin",
              "superadmin"
            ],
            "ruta": "/preferencias",
            "boton": "Ver mis avisos"
          },
          {
            "titulo": "Resumen del día y reporte semanal, por empresa",
            "texto": "Dirección recibe cada tarde el resumen del día y los lunes el reporte de la semana, con una sección por empresa —su logo, sus cifras, cada gestora y cada campus—. Quien lleva varias empresas recibe un solo correo con todas.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/informes",
            "boton": "Abrir Reportes"
          },
          {
            "titulo": "Escrito o nota de voz",
            "texto": "En Reportes, el bloque «Trabajo hecho en el periodo» separa cuántos mensajes de WhatsApp manda cada gestora por escrito, cuántos en nota de voz y cuántos adjuntos. Va también en la descarga y en el PDF.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/informes",
            "boton": "Abrir Reportes"
          },
          {
            "titulo": "El ranking del mes, en barras",
            "texto": "Dentro de «Asesoras», el ranking del mes en barras. Se elige qué comparar: ventas, vendido, cobrado o tasa. La tabla de siempre sigue debajo.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/informes",
            "boton": "Abrir Reportes"
          },
          {
            "titulo": "La campana, ordenada",
            "texto": "Los avisos repetidos se juntan en una fila («×6»). Lo que pide hacer algo va separado de lo informativo, y el número de la campana solo cuenta lo primero. Cada persona puede apagar los tipos de aviso que no quiera, y vale también para los correos. La gestora recibe aviso cuando se le asigna un prospecto nuevo, y cuando se reasigna uno se avisa a las dos.",
            "roles": [
              "gestor",
              "admin",
              "superadmin",
              "soporte"
            ],
            "ruta": "/notificaciones",
            "boton": "Ver mis avisos"
          },
          {
            "titulo": "El correo de la noche, con enlaces",
            "texto": "El «plan de mañana» que recibe cada gestora trae enlaces que abren el CRM con la lista ya filtrada. Y una vez al mes llega un repaso de su base, con la pestaña «Por validar» en Prospectos para marcar lo revisado.",
            "roles": [
              "gestor"
            ],
            "ruta": null,
            "boton": null
          }
        ]
      },
      {
        "titulo": "Finanzas y tutores",
        "items": [
          {
            "titulo": "Finanzas por empresa",
            "texto": "Con una empresa elegida (por ejemplo CEDIA), todas las pantallas de Finanzas suman sus campus: el panel, Ingresos, Egresos, Cuentas por cobrar y por pagar, Comisiones, Pagos Stripe y Pendientes de facturar. Nóminas enseña la lista de todos los campus; para crear una sigue pidiendo uno.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/finanzas",
            "boton": "Abrir Finanzas"
          },
          {
            "titulo": "«Avisar tutor»",
            "texto": "En Comisiones de tutores, un botón prepara el correo del mes para el tutor con sus formaciones y la cuenta hecha (comisión, IVA, retención y total), con forma de factura, y se puede retocar. De momento solo la vista previa: el envío a los tutores sigue en pausa hasta que se active.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/tutores/comisiones",
            "boton": "Ir a Comisiones"
          },
          {
            "titulo": "Sin tutor: también lo de antes del corte",
            "texto": "La casilla «Incluir ventas anteriores al corte» enseña también las formaciones sin tutor vendidas antes del 1 de agosto. Salen marcadas para no mezclarlas con las de ahora.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/tutores/sin-tutor",
            "boton": "Ver formaciones sin tutor"
          }
        ]
      },
      {
        "titulo": "Administración",
        "items": [
          {
            "titulo": "Registro",
            "texto": "Pantalla nueva en Sistema: qué ha pasado en el CRM y quién lo hizo. Junta cambios en fichas, documentos, entradas al sistema, errores, envíos de formularios y de Make, tareas automáticas y correos enviados. Se filtra por fecha y se descarga.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/registro",
            "boton": "Abrir el Registro"
          },
          {
            "titulo": "Correos",
            "texto": "Pantalla nueva en Sistema: todo lo que manda el CRM, con su texto, y lo que llega al buzón. Tiene «Enviados» y «Recibidos», y un botón «Traer del buzón» para no esperar.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/correos",
            "boton": "Abrir Correos"
          },
          {
            "titulo": "Conectores",
            "texto": "Pantalla nueva en la sección Conexión. Los conectores traen datos de otra web, por ejemplo los cursos de una tienda; las conexiones de Claude, que dan una URL para preguntarle por prospectos, ventas, facturas o informes (solo consulta), están en Conexión → MCP. Cada uno puede ser de un campus, de una empresa entera o, para super admin, de todo el sistema.",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/conexion/conectores",
            "boton": "Abrir Conectores"
          },
          {
            "titulo": "Más de un rol por persona",
            "texto": "Al editar un usuario, «Y además es…» le suma otro rol. Por ejemplo, una gestora que también da clase ve Prospectos y además sus cursos de tutora.",
            "roles": [
              "superadmin"
            ],
            "ruta": "/configuracion",
            "boton": "Ir a Configuración"
          },
          {
            "titulo": "Árbol de categorías, al alcance",
            "texto": "El árbol de categorías tiene entrada propia en Catálogo. Al elegir la categoría de un producto se baja por todos los niveles, y el buscador encuentra sin acentos: «adiccion» encuentra «Adicciones».",
            "roles": [
              "admin",
              "superadmin"
            ],
            "ruta": "/productos/categorias",
            "boton": "Abrir el árbol"
          }
        ]
      }
    ],
    "arreglos": [
      "La cola del día enseña a todas las personas, por páginas. Antes se cortaba en 300 sin avisar.",
      "Los prospectos dados de alta a mano o por carga masiva ya entran en la cola del día.",
      "Una interacción sin nota ya se guarda. Antes se perdía sin avisar.",
      "El filtro de formación ya no se queda vacío al cambiar de campus o de empresa.",
      "«Sin contactar nunca» ya no cuenta a quien tiene el estado cambiado a mano.",
      "Las plantillas de WhatsApp se ven con una empresa puesta, y la tuya desde la ficha se guarda a tu nombre.",
      "Las plantillas de correo del proceso ya rellenan el nombre, la formación y la firma de quien lo manda.",
      "Un formulario enviado dos veces por la misma persona ya no da error.",
      "Se puede registrar la venta de alguien dado de alta hoy que compró antes (si no vino de la web).",
      "Las notas admiten textos largos: hasta 10.000 caracteres.",
      "Un móvil español escrito sin +34 ya se guarda como español.",
      "Con «Todos» o una empresa elegida, el buscador rápido (Ctrl+K) y la campana ya funcionan.",
      "Al repartir los prospectos sin dueño ya no se cuelan fichas borradas ni spam.",
      "En la cola de facturación, un cobro ya facturado desde la venta deja de pedir factura, y no sale repetido como «Stripe sin asociar».",
      "Las facturas de ICTESS y Solvenic se ven con su numeración seguida, sin huecos falsos.",
      "Ya no se puede emitir una factura con un CIF provisional. CEDIA e ICTESS llevan sus datos fiscales reales.",
      "«Exportar PDF» del informe con IA descarga un PDF de verdad.",
      "Reportes ya no repite tablas y carga más rápido.",
      "El menú marca la pantalla en la que estás (en Conectores se encendía Formularios).",
      "Once pantallas que se quedaban en blanco si algo fallaba ahora enseñan un aviso.",
      "El menú de acciones de Usuarios se despliega bien.",
      "En los proyectos de IA, Clientes y Ventas dicen «Planes» en vez de «Cursos».",
      "«Chat IA» sale del menú mientras no esté activo. Antes llevaba a una pantalla de «Próximamente»."
    ]
  }
];

export const ACTUAL = VERSIONES[0];

export function versionDe(version) {
  return VERSIONES.find((v) => v.version === version) || null;
}
