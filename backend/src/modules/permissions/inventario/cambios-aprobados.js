/**
 * Lo que cambia A PROPÓSITO respecto a antes de #423, uno a uno.
 *
 * Diego: «nadie gana ni pierde acceso; los cambios intencionados van en una
 * lista aparte para que yo los apruebe uno a uno». Esta es la lista. El script
 * `comparar-permisos.mjs` y las pruebas dejan pasar una diferencia SOLO si está
 * aquí; cualquier otra es un fallo.
 *
 * Cada cambio:
 *   id          corto, para nombrarlo en la #423
 *   que         una frase, para Diego
 *   motivo      por qué
 *   filas       las del inventario a las que afecta (su `id`)
 *   roles       a qué roles les cambia (con sus valores de serie)
 *   sentido     'pierde' o 'gana'
 *   aprobadoPor null hasta que Diego lo apruebe en la issue
 *
 * Hugo (21/10) decidió cerrar los agujeros en esta entrega en vez de copiarlos.
 *
 * Diego (26/10) aprobó la lista con tres decisiones:
 *   1. Su cuenta pasa a superadmin con soporte de rol de más (cambio de DATOS,
 *      en el guion del día de producción; aquí, `soporte-a-superadmin`). A
 *      cualquier otra persona de soporte le vale la lista tal cual.
 *   2. Los admin SIGUEN cambiando lo que trae cada rol y los roles a medida
 *      (`roles.edit` es del admin de serie), sin darles lo que no tienen.
 *   3. Soporte SIGUE dando de alta admins, gestoras y colaboradores.
 */

const DIEGO = 'Diego, 26/10';

export const CAMBIOS = [
  {
    id: 'webhooks-solo-admin',
    que: 'Los webhooks de entrada (los de admisión incluidos): verlos, crearlos, cambiarlos y borrarlos, solo admin y super admin, cada uno en sus campus.',
    motivo: 'Con la admisión en producción (#198), un webhook recibe DNI, fotos y firma. Hasta hoy la lista la veía cualquiera con sesión y soporte los creaba y cambiaba; en staging ya era solo de admin desde el 20/10.',
    filas: ['GET /api/webhook-tokens/', 'GET /api/webhook-tokens/:id/status', 'POST /api/webhook-tokens/', 'PATCH /api/webhook-tokens/:id',
      'DELETE /api/webhook-tokens/:id', 'POST /api/webhook-tokens/:id/listen', 'POST /api/webhook-tokens/:id/listen/stop'],
    roles: ['gestor', 'soporte', 'project_manager', 'tutor'],
    sentido: 'pierde',
    aprobadoPor: 'Diego, 20/10 (#198); a producción el 12/11',
  },
  {
    id: 'roles-sin-soporte',
    que: 'Cambiar lo que trae un rol fijo, crear o cambiar roles a medida y la vista de cada rol: el admin y el superadmin, como hasta hoy. Soporte, no.',
    motivo: 'Soporte lo hacía por el atajo de roleGuard, sin que nadie se lo diera. Hugo lo dejaba solo al superadmin; Diego (26/10): «los admin siguen pudiendo», sin poner a un rol lo que ellos no tienen.',
    filas: [
      'POST /api/permissions/custom-roles', 'PUT /api/permissions/custom-roles/:id',
      'DELETE /api/permissions/custom-roles/:id', 'PUT /api/permissions/role-views/:roleKey',
    ],
    roles: ['soporte'],
    sentido: 'pierde',
    aprobadoPor: DIEGO,
  },
  {
    id: 'admin-roles-entero',
    que: 'Con «Cambiar roles» el admin también borra un rol a medida que nadie tiene y cambia una clave suelta de un rol (p. ej. «Diplomas · Ver»), que antes solo hacía el superadmin.',
    motivo: 'Sale de la decisión 2 de Diego (26/10): el admin sigue cambiando lo que trae cada rol y los roles a medida; estas dos rutas son parte de lo mismo y ahora piden la misma clave. Sigue sin poder poner a un rol lo que él no tiene.',
    filas: ['DELETE /api/permissions/custom-roles/:id', 'PUT /api/permissions/claves/:clave/rol/:roleKey'],
    roles: ['admin'],
    sentido: 'gana',
    aprobadoPor: DIEGO,
  },
  {
    id: 'roles-a-medida-sin-soporte',
    que: 'Ver los roles a medida: admin y superadmin. Soporte, no.',
    motivo: 'Soporte los veía por el atajo de roleGuard; no administra permisos.',
    filas: ['GET /api/permissions/custom-roles', 'GET /api/permissions/custom-roles/:id'],
    roles: ['soporte'],
    sentido: 'pierde',
    aprobadoPor: DIEGO,
  },
  {
    id: 'excepciones-sin-soporte',
    que: 'Dar o quitar permisos a una persona: el admin (solo a gente de sus campus) y el superadmin. Soporte, no.',
    motivo: 'Soporte entraba por el atajo de roleGuard a `/users/:id/permissions`, sin límite de campus. Es una puerta para darse a sí mismo o a otros lo que no tienen.',
    filas: ['GET /api/permissions/users/:userId/permissions', 'PUT /api/permissions/users/:userId/permissions'],
    roles: ['soporte'],
    sentido: 'pierde',
    aprobadoPor: DIEGO,
  },
  {
    id: 'rol-de-otros-con-permiso',
    que: 'Cambiar el rol, los roles de más o «se dedica a colaboraciones» de alguien: quien da permisos («Permisos de cada persona»), y el admin solo a gente de sus campus y que no sea admin. Soporte, no.',
    motivo: 'Desde Usuarios, admin y soporte cambiaban el rol de cualquiera, de cualquier empresa: es la manera más corta de darle a alguien todo un rol. Ahora sigue las reglas de la ficha.',
    filas: ['PATCH /api/users/:id · users.cambiar_rol'],
    roles: ['soporte'],
    sentido: 'pierde',
    aprobadoPor: DIEGO,
  },
  {
    id: 'metas-sin-soporte-ni-pm',
    que: 'Poner o borrar una meta de ventas: admin (la de la gente de sus campus), gestora (la suya) y superadmin. Soporte y project manager, no.',
    motivo: 'Las dos rutas de metas no pedían ningún rol: cualquier sesión que llegara, soporte y project manager incluidos, fijaba o borraba la meta de cualquiera (IDOR, PR #434). Lo hacían por un descuido de la ruta, no porque alguien se lo diera.',
    filas: ['POST /api/ventas/goals', 'DELETE /api/ventas/goals/:id'],
    // El tutor también (12/11, paso a producción): en staging ya lo quitaba la #591, que aún no está en producción.
    roles: ['soporte', 'project_manager', 'tutor'],
    sentido: 'pierde',
    // Pendiente: hay que aprobarlo en la #423 (lo cierra un agujero, pero cambia el acceso de tres roles).
    aprobadoPor: null,
  },
  {
    id: 'superadmin-su-correo',
    que: 'El superadmin también puede cambiar su propio correo desde «Mi perfil».',
    motivo: 'Hoy esa ruta es solo del tutor. En el catálogo el superadmin lo tiene todo, sin excepciones; el resto de roles sigue igual.',
    filas: ['PATCH /api/auth/me/email'],
    roles: ['superadmin'],
    sentido: 'gana',
    aprobadoPor: DIEGO,
  },
  {
    id: 'tutores-tablero-rutas',
    que: 'El tutor entra en el tablero de tareas: «Ver su tablero» y «Editar tareas» de serie (su tablero de tutores).',
    motivo: 'Diego (04/11): «un tablero de tutores separado del de colaboradores» (#683, a producción en la v2.5.24). En staging lo explica el corte de rutas del tutor (`RUTAS_DEL_TUTOR`, cambio de regla `tutores-tablero`); en producción ese corte aún no está, así que se apuntan aquí las rutas del tablero. Lo que ve lo recorta el servicio: lo suyo y lo de su equipo de tutores.',
    filas: [
      'GET /api/tasks/metrics',
      'GET /api/tasks/metrics/areas',
      'GET /api/tasks/assignees',
      'GET /api/tasks/tags',
      'GET /api/tasks/historial',
      'GET /api/tasks/teams',
      'GET /api/tasks/teams/mine',
      'GET /api/tasks/teams/empresas',
      'POST /api/tasks/teams',
      'GET /api/tasks/teams/:teamId',
      'PATCH /api/tasks/teams/:teamId',
      'POST /api/tasks/teams/:teamId/roles',
      'PATCH /api/tasks/teams/:teamId/roles/:roleId',
      'GET /api/tasks/teams/:teamId/candidates',
      'PUT /api/tasks/teams/:teamId/members/:userId',
      'DELETE /api/tasks/teams/:teamId/members/:userId',
      'GET /api/tasks/columns',
      'POST /api/tasks/columns',
      'PATCH /api/tasks/columns/reorder',
      'PATCH /api/tasks/columns/:id',
      'DELETE /api/tasks/columns/:id',
      'GET /api/tasks/areas',
      'POST /api/tasks/areas',
      'GET /api/tasks/areas/assignments',
      'GET /api/tasks/areas/user/:userId',
      'PUT /api/tasks/areas/user/:userId',
      'PATCH /api/tasks/areas/:id',
      'PUT /api/tasks/areas/:id/members',
      'GET /api/tasks/external-projects',
      'POST /api/tasks/external-projects',
      'PATCH /api/tasks/external-projects/:id',
      'GET /api/tasks/',
      'POST /api/tasks/',
      'GET /api/tasks/:id',
      'PATCH /api/tasks/:id/move',
      'PATCH /api/tasks/:id/return',
      'PATCH /api/tasks/:id/approve',
      'PATCH /api/tasks/:id',
      'DELETE /api/tasks/:id',
      'POST /api/tasks/:id/checklist',
      'PATCH /api/tasks/:id/checklist/:itemId',
      'DELETE /api/tasks/:id/checklist/:itemId',
      'POST /api/tasks/:id/comments',
      'DELETE /api/tasks/:id/comments/:commentId',
      'POST /api/tasks/:id/tags',
      'DELETE /api/tasks/:id/tags/:tagId',
      'POST /api/tasks/:id/links',
      'DELETE /api/tasks/:id/links/:linkId',
    ],
    roles: ['tutor'],
    sentido: 'gana',
    aprobadoPor: 'Diego, 04/11',
  },
];

/** ¿Está aprobado (o pendiente de aprobar en esta lista) que esta fila cambie para este rol? */
export function cambioPrevisto(filaId, rol) {
  return CAMBIOS.find((c) => c.filas.includes(filaId) && c.roles.includes(rol)) || null;
}

/**
 * Los cambios que dependen de los DATOS de una persona, no de su rol: solo los
 * ve el script con la base de verdad (`scripts/comparar-permisos.mjs`). Cada uno
 * dice cuándo explica una diferencia: `explica(contexto)` recibe
 *   { persona, fila, antes, despues, despuesSin }  —`despuesSin(cambio)` vuelve
 * a calcular el «después» deshaciendo esa parte (sin roles de más, con el rol a
 * medida activo…)— y devuelve true si la diferencia sale de ahí.
 */
export const CAMBIOS_POR_DATOS = [
  {
    id: 'roles-de-mas-cuentan',
    que: 'Los roles de más cuentan en todo: también donde antes solo se miraba el rol principal (facturas, tutores, el MCP de quien además es admin, permisos sueltos). WhatsApp no cambia, y un tutor sigue sin MCP aunque tenga otro rol (`nuncaPrincipal`).',
    motivo: 'Antes unas comprobaciones miraban los roles de más y otras no (checkPermission no; el menú solo el principal). Ahora una sola regla: basta con que uno de sus roles lo traiga. Salvo lo que el rol principal vetaba (QA de Diego, punto 6).',
    // WhatsApp, nunca: lo decide el rol principal, como antes. Una diferencia ahí es un fallo.
    explica: ({ persona, fila, antes, despuesSin }) => persona.roles_extra.length > 0 && fila.modulo !== 'whatsapp'
      && despuesSin('sinRolesDeMas') === antes,
    aprobadoPor: DIEGO,
  },
  {
    id: 'rol-a-medida-desactivado',
    que: 'Un rol a medida desactivado deja de aplicarse: la persona tiene lo de su rol.',
    motivo: 'Antes se aplicaba aunque estuviera desactivado (`findCustomRoleById` no miraba `active`).',
    explica: ({ persona, antes, despuesSin }) => persona.custom_role && persona.custom_role.active === false && despuesSin('rolAMedidaActivo') === antes,
    aprobadoPor: DIEGO,
  },
  {
    id: 'rol-a-medida-con-roles-de-mas',
    que: 'Quien tiene rol a medida y además roles de más suma lo de esos roles.',
    motivo: 'Los guardias (resolvePermission) ignoraban sus roles de más; /auth/me los sumaba. Ahora las dos cosas dicen lo mismo.',
    explica: ({ persona, antes, despuesSin }) => Boolean(persona.custom_role) && persona.roles_extra.length > 0 && despuesSin('sinRolesDeMas') === antes,
    aprobadoPor: DIEGO,
  },
  {
    id: 'cola-entera',
    que: 'Quien lleva la cola de facturación (antes, la casilla «factura_manager») también cobra proformas, sea cual sea su rol.',
    motivo: 'Antes la casilla abría tres de las cuatro rutas de la cola a cualquier rol, pero «cobrar proforma» además pedía ser admin o gestora. Ahora las cuatro son «Emitir desde la cola».',
    explica: ({ persona, fila, despues }) => persona.factura_manager && fila.id === 'POST /api/invoices/:id/cobrar-proforma' && despues === true,
    aprobadoPor: DIEGO,
  },
  {
    id: 'pantalla-y-servidor',
    que: 'Lo que se le dio o se le quitó a alguien (excepción o rol a medida) sobre una clave que antes solo miraba la pantalla —asignar, crear o editar prospectos, editar ventas, crear, editar o borrar productos, sincronizar WooCommerce— ahora vale también en el servidor.',
    motivo: 'Antes ese valor solo enseñaba o escondía el botón; la ruta miraba el rol. Diego (QA, punto 5): no se archiva ninguna clave en uso. Se quedan, y desde #423 la ruta y el botón dicen lo mismo.',
    explica: ({ antes, despuesSin }) => despuesSin('sinClavesDePantalla') === antes,
    aprobadoPor: DIEGO,
  },
  {
    id: 'soporte-a-superadmin',
    que: 'Quien era soporte y pasa a superadmin con soporte de rol de más (la cuenta de Diego, decisión del 26/10) lo puede todo, como cualquier superadmin.',
    motivo: 'Diego: «literalmente como superadmin, con soporte». Es un cambio de datos del día de producción; la simulación lo pasa con `--guion`.',
    explica: ({ persona, personaAntes, despues }) => persona.role === 'superadmin' && personaAntes?.role === 'soporte'
      && persona.roles_extra.includes('soporte') && despues === true,
    aprobadoPor: DIEGO,
  },
  {
    id: 'tutores-tablero',
    que: 'El tutor tiene tablero de tareas: «Ver su tablero» y «Editar tareas» de serie. Ve sus tareas y las de su equipo de TUTORES; el de desarrollo, no. Quien es tutor además de otro rol (una gestora que también da clase) también lo gana.',
    motivo: 'Diego (04/11): «un tablero de tutores separado del de colaboradores», para quien lleva las colaboraciones de los profesores y sus tutores. Las tareas que ve las decide el servicio (sus equipos); mover y comentar siguen siendo de quien la lleva o la supervisa.',
    explica: ({ persona, fila, despues }) => despues === true && fila.modulo === 'tasks'
      && [persona.role, ...persona.roles_extra].includes('tutor'),
    aprobadoPor: 'Diego, 04/11',
  },
  {
    id: 'superadmin-todo',
    que: 'El superadmin lo puede todo, también lo que una casilla o una regla suelta le quitaba (su WhatsApp apagado, el correo de «Mi perfil»).',
    motivo: 'En el catálogo el superadmin no tiene excepciones.',
    explica: ({ persona, despues }) => persona.role === 'superadmin' && despues === true,
    aprobadoPor: DIEGO,
  },
];

/**
 * Lo que cambia en el MENÚ, por perfil (QA de Diego, punto 6: «soporte pierde
 * 10 entradas del menú; el admin con factura_manager gana Facturación»). Ningún
 * cambio de acceso: lo que sale llevaba a una página que ya respondía, y lo que
 * se va llevaba a una que daba 403. `rutas` dice, por entrada, la ruta que lo
 * demuestra; `menuSinCambioDeAcceso423.test.js` lo comprueba con las reglas de
 * antes y las de ahora, y la foto del menú (`menuPorPerfil423.test.jsx`) solo
 * deja pasar estas diferencias. `+` aparece, `-` desaparece.
 */
export const CAMBIOS_DE_MENU = [
  {
    id: 'menu-sin-403',
    que: 'El menú deja de enseñar lo que daba 403: 10 entradas a soporte y 3 al project manager.',
    motivo: 'Soporte lo veía todo por un atajo del menú («ve todo»), y el project manager las pantallas de la gestora; al entrar, el servidor les respondía 403. Ninguno pierde nada que pudiera usar.',
    perfiles: {
      soporte: [
        '- Clientes › Diplomas', '- Conexión › Conectores', '- Conexión › Webhook de transferencias',
        '- Equipo de Desarrollo › Mi factura', '- Equipo de Desarrollo › Tablero', '- Finanzas › Facturas de colaboradores',
        '- Tutores › Comisiones', '- Tutores › Mis cursos', '- Tutores › Sin tutor', '- Tutores › Tutores',
      ],
      project_manager: ['- Clientes › Solicitud de admisión', '- Principal › WhatsApp › Chat', '- Principal › WhatsApp › Conexión'],
    },
    rutas: {
      'Clientes › Diplomas': 'GET /api/certifex/diplomas/solicitudes',
      'Conexión › Conectores': 'GET /api/connectors/',
      'Conexión › Webhook de transferencias': 'GET /api/webhooks-salientes/',
      'Equipo de Desarrollo › Mi factura': 'GET /api/facturas-colaborador/mias',
      'Equipo de Desarrollo › Tablero': 'GET /api/tasks/',
      'Finanzas › Facturas de colaboradores': 'GET /api/facturas-colaborador/facturas',
      'Tutores › Comisiones': 'GET /api/tutores/comisiones',
      'Tutores › Mis cursos': 'GET /api/tutores/colaboraciones',
      'Tutores › Sin tutor': 'GET /api/tutores/formaciones-sin-tutor',
      'Tutores › Tutores': 'GET /api/tutores/',
      'Clientes › Solicitud de admisión': 'GET /api/matriculas/',
      'Principal › WhatsApp › Chat': 'GET /api/whatsapp/chats',
      'Principal › WhatsApp › Conexión': 'GET /api/whatsapp/conexion',
    },
    aprobadoPor: DIEGO,
  },
  {
    id: 'tutores-tablero',
    que: '«Mi tablero» la ve también el tutor: su tablero de tutores.',
    motivo: 'Va con el cambio `tutores-tablero`: el tutor gana «Ver su tablero» y la ruta del tablero (Diego, 04/11).',
    perfiles: {
      tutor: ['+ Equipo de Desarrollo › Mi tablero'],
      'gestora+tutor': ['+ Equipo de Desarrollo › Mi tablero'],
    },
    rutas: { 'Equipo de Desarrollo › Mi tablero': 'GET /api/tasks/' },
    aprobadoPor: 'Diego, 04/11',
  },
  {
    id: 'historial-de-tareas',
    que: '«Equipo de Desarrollo › Por revisar» desaparece y en su sitio sale «Historial de tareas» a quien tiene tablero (CRM#707).',
    motivo: 'Diego y Carlos (10/11): quien hace la tarea la pasa a «Hecha» él mismo; las de programación las cierra Diego. Ya no hay una bandeja de «por aprobar» ni su contador (tampoco para Carlos): la pantalla y su ruta (`/api/tasks/review`) se quitan enteras. El historial enseña lo hecho con el alcance del tablero: no abre nada que no se viera ya en «Mi tablero».',
    perfiles: {
      superadmin: ['- Equipo de Desarrollo › Por revisar', '+ Equipo de Desarrollo › Historial de tareas'],
      admin: ['- Equipo de Desarrollo › Por revisar', '+ Equipo de Desarrollo › Historial de tareas'],
      'gestora+admin': ['- Equipo de Desarrollo › Por revisar', '+ Equipo de Desarrollo › Historial de tareas'],
      // Quien tiene tablero sin «Aprobar y cerrar»: no tenía «Por revisar» y gana el historial de lo suyo.
      colaborador: ['+ Equipo de Desarrollo › Historial de tareas'],
      tutor: ['+ Equipo de Desarrollo › Historial de tareas'],
      'gestora+tutor': ['+ Equipo de Desarrollo › Historial de tareas'],
    },
    rutas: {
      'Equipo de Desarrollo › Por revisar': 'GET /api/tasks/review',
      'Equipo de Desarrollo › Historial de tareas': 'GET /api/tasks/historial',
    },
    // La pantalla se va con su ruta: no es que se le cierre a alguien, es que ya no existe.
    quitadas: ['Equipo de Desarrollo › Por revisar'],
    aprobadoPor: 'Diego, 10/11',
  },
];

/** `{ perfil: ['+ …', '- …'] }`, todos los cambios de menú juntos. */
export function cambiosDeMenuPorPerfil() {
  const out = {};
  for (const c of CAMBIOS_DE_MENU) {
    for (const [perfil, lineas] of Object.entries(c.perfiles)) out[perfil] = [...(out[perfil] || []), ...lineas];
  }
  return out;
}

/**
 * Reglas nuevas que dependen de lo que se MANDA, no de quién entra a la ruta:
 * la comparación no las ve (la ruta sigue abierta), pero cambian lo que se
 * puede hacer. Van en la misma lista para Diego.
 */
export const CAMBIOS_DE_REGLA = [
  {
    id: 'nadie-da-lo-que-no-tiene',
    que: 'Dar de alta a alguien o cambiarle el rol o los roles de más, y ponerle permisos a un rol: solo si quien lo hace tiene todo lo que se gana (salvo lo que es solo sobre lo suyo: sus cursos, su correo, su factura, su WhatsApp). Un admin ya no hace soporte a nadie. Soporte SÍ sigue dando de alta admins, gestoras y colaboradores (Diego, 26/10).',
    motivo: 'QA de Diego, punto 7: al cambiar el rol se podía dar más de lo que tenía quien lo cambiaba. «Nadie puede dar un rol o permiso que no tenga», como ya pasaba con las excepciones y el rol a medida. El alta de soporte, como hasta hoy (decisión 3).',
    roles: ['admin', 'soporte'],
    sentido: 'pierde',
    aprobadoPor: DIEGO,
  },
  {
    id: 'tutores-tablero',
    que: 'El tutor puede pedir `/api/tasks`: su tablero de tutores. Ve sus tareas y las de su equipo de TUTORES (un equipo de tipo «tutores»); el de desarrollo, no. Solo tiene tablero de verdad —sale como responsable, en las cifras y en los resúmenes— mientras esté en un equipo de tutores.',
    motivo: 'Diego (04/11): «un tablero de tutores separado del de colaboradores». Es una ruta más que deja pasar el corte del tutor (`RUTAS_DEL_TUTOR`); el resto del tablero lo recorta el servicio.',
    roles: ['tutor'],
    sentido: 'gana',
    aprobadoPor: 'Diego, 04/11',
  },
  {
    id: 'historial-de-tareas',
    que: 'El tutor puede pedir `/api/tasks/historial`: lo hecho de su tablero de tutores (lo suyo y lo de su equipo), con quién y cuándo.',
    motivo: 'CRM#707 (Diego y Carlos, 10/11): «Por revisar» pasa a «Historial de tareas». Ya entraba por `/api/tasks` en el corte del tutor (`tutores-tablero`); el historial no enseña nada que no viera ya en su tablero.',
    roles: ['tutor'],
    sentido: 'gana',
    aprobadoPor: 'Diego, 10/11',
  },
];
