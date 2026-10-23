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
 */

export const CAMBIOS = [
  {
    id: 'roles-solo-superadmin',
    que: 'Cambiar lo que trae un rol fijo, crear o cambiar roles a medida y la vista de cada rol: solo el superadmin.',
    motivo: 'Un rol vale para todas las empresas (#423: «los roles fijos y lo que aplica a todas las empresas, solo superadmin»). Hoy lo hacían el admin y soporte (este por el atajo de roleGuard).',
    filas: [
      'POST /api/permissions/custom-roles', 'PUT /api/permissions/custom-roles/:id',
      'DELETE /api/permissions/custom-roles/:id', 'PUT /api/permissions/role-views/:roleKey',
      'PUT /api/permissions/role-permissions/:roleKey',
    ],
    roles: ['admin', 'soporte'],
    sentido: 'pierde',
    aprobadoPor: null,
  },
  {
    id: 'roles-a-medida-sin-soporte',
    que: 'Ver los roles a medida: admin y superadmin. Soporte, no.',
    motivo: 'Soporte los veía por el atajo de roleGuard; no administra permisos.',
    filas: ['GET /api/permissions/custom-roles', 'GET /api/permissions/custom-roles/:id'],
    roles: ['soporte'],
    sentido: 'pierde',
    aprobadoPor: null,
  },
  {
    id: 'excepciones-sin-soporte',
    que: 'Dar o quitar permisos a una persona: el admin (solo a gente de sus campus) y el superadmin. Soporte, no.',
    motivo: 'Soporte entraba por el atajo de roleGuard a `/users/:id/permissions`, sin límite de campus. Es una puerta para darse a sí mismo o a otros lo que no tienen.',
    filas: ['GET /api/permissions/users/:userId/permissions', 'PUT /api/permissions/users/:userId/permissions'],
    roles: ['soporte'],
    sentido: 'pierde',
    aprobadoPor: null,
  },
  {
    id: 'rol-de-otros-con-permiso',
    que: 'Cambiar el rol, los roles de más o «se dedica a colaboraciones» de alguien: quien da permisos («Permisos de cada persona»), y el admin solo a gente de sus campus y que no sea admin. Soporte, no.',
    motivo: 'Desde Usuarios, admin y soporte cambiaban el rol de cualquiera, de cualquier empresa: es la manera más corta de darle a alguien todo un rol. Ahora sigue las reglas de la ficha.',
    filas: ['PATCH /api/users/:id · users.cambiar_rol'],
    roles: ['soporte'],
    sentido: 'pierde',
    aprobadoPor: null,
  },
  {
    id: 'superadmin-su-correo',
    que: 'El superadmin también puede cambiar su propio correo desde «Mi perfil».',
    motivo: 'Hoy esa ruta es solo del tutor. En el catálogo el superadmin lo tiene todo, sin excepciones; el resto de roles sigue igual.',
    filas: ['PATCH /api/auth/me/email'],
    roles: ['superadmin'],
    sentido: 'gana',
    aprobadoPor: null,
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
    aprobadoPor: null,
  },
  {
    id: 'rol-a-medida-desactivado',
    que: 'Un rol a medida desactivado deja de aplicarse: la persona tiene lo de su rol.',
    motivo: 'Antes se aplicaba aunque estuviera desactivado (`findCustomRoleById` no miraba `active`).',
    explica: ({ persona, antes, despuesSin }) => persona.custom_role && persona.custom_role.active === false && despuesSin('rolAMedidaActivo') === antes,
    aprobadoPor: null,
  },
  {
    id: 'rol-a-medida-con-roles-de-mas',
    que: 'Quien tiene rol a medida y además roles de más suma lo de esos roles.',
    motivo: 'Los guardias (resolvePermission) ignoraban sus roles de más; /auth/me los sumaba. Ahora las dos cosas dicen lo mismo.',
    explica: ({ persona, antes, despuesSin }) => Boolean(persona.custom_role) && persona.roles_extra.length > 0 && despuesSin('sinRolesDeMas') === antes,
    aprobadoPor: null,
  },
  {
    id: 'cola-entera',
    que: 'Quien lleva la cola de facturación (antes, la casilla «factura_manager») también cobra proformas, sea cual sea su rol.',
    motivo: 'Antes la casilla abría tres de las cuatro rutas de la cola a cualquier rol, pero «cobrar proforma» además pedía ser admin o gestora. Ahora las cuatro son «Emitir desde la cola».',
    explica: ({ persona, fila, despues }) => persona.factura_manager && fila.id === 'POST /api/invoices/:id/cobrar-proforma' && despues === true,
    aprobadoPor: null,
  },
  {
    id: 'pantalla-y-servidor',
    que: 'Lo que se le dio o se le quitó a alguien (excepción o rol a medida) sobre una clave que antes solo miraba la pantalla —asignar, crear o editar prospectos, editar ventas, crear, editar o borrar productos, sincronizar WooCommerce— ahora vale también en el servidor.',
    motivo: 'Antes ese valor solo enseñaba o escondía el botón; la ruta miraba el rol. Diego (QA, punto 5): no se archiva ninguna clave en uso. Se quedan, y desde #423 la ruta y el botón dicen lo mismo.',
    explica: ({ antes, despuesSin }) => despuesSin('sinClavesDePantalla') === antes,
    aprobadoPor: null,
  },
  {
    id: 'superadmin-todo',
    que: 'El superadmin lo puede todo, también lo que una casilla o una regla suelta le quitaba (su WhatsApp apagado, el correo de «Mi perfil»).',
    motivo: 'En el catálogo el superadmin no tiene excepciones.',
    explica: ({ persona, despues }) => persona.role === 'superadmin' && despues === true,
    aprobadoPor: null,
  },
];
