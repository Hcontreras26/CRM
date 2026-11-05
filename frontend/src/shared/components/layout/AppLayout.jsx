import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Toaster from './Toaster';
import CommandPalette from './CommandPalette';
import { List, X } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/hooks/useToast';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { tieneWhatsapp } from '@/shared/lib/roles';
import NeedsProjectBanner from '@/shared/components/ui/NeedsProjectBanner';
import EmptyState from '@/shared/components/ui/EmptyState';
import { LockKey } from '@phosphor-icons/react';
import usePermission from '@/shared/hooks/usePermission';
import { rutaPermitida } from './Sidebar';

// Rutas que SÍ funcionan en modo "Todos los proyectos" (vista global).
// El resto requiere un proyecto concreto (catálogo, settings, finanzas, etc.).
const ALL_PROJECTS_OK = [
  /^\/$/,                          // Dashboard
  // Prospectos (rutas reales en espanol — los regex viejos /leads no se usaban)
  /^\/prospectos$/,                // Lista de prospectos
  /^\/prospectos\/cola$/,          // La cola del dia — el servidor acota por gestora
  // Ventas: la consulta ya sabe hacerlo sin proyecto —cada fila dice de cual
  // es— y el muro tapaba una vista que funcionaba.
  /^\/finanzas\/ventas$/,
  /^\/ventas$/,
  // Tutores: las tres consultas ya aceptan «sin proyecto» y devuelven el
  // nombre del proyecto en cada fila, asi que la vista general se lee sola.
  // Quien lleva las colaboraciones trabaja con los profesores de todas las
  // marcas a la vez: obligarle a elegir una por una era pedirle nueve vueltas.
  /^\/tutores$/,
  /^\/tutores\/sin-tutor$/,
  /^\/tutores\/comisiones$/,
  // Consultas de alumnos (#188, #189): cada fila dice de qué campus es, y el
  // tutor ve lo suyo sin mirar la cabecera.
  /^\/consultas(?:\/.*)?$/,
  // Feedback (#170): sin campus ni empresa, el servidor suma todos los que ve
  // cada uno (sin los de pruebas). Diego, 02/11: «el panel de feedback está
  // fallando»: con «Todos los proyectos» salía «Selecciona un proyecto».
  /^\/informes\/feedback$/,
  /^\/prospectos\/pipeline$/,      // Kanban
  /^\/prospectos\/audiencias$/,    // Audiencias Meta
  /^\/prospectos\/\d+$/,           // Detalle de prospecto
  // Clientes
  /^\/clientes$/,
  /^\/clientes\/matriculas$/,
  /^\/clientes\/\d+$/,
  // Legacy (por si algun link viejo apunta a /leads o /clients)
  /^\/leads$/, /^\/leads\/pipeline$/, /^\/leads\/\d+$/,
  /^\/clients$/, /^\/clients\/\d+$/,
  // Generales (no dependen de proyecto)
  // La sección Conexión (Diego, 29/09: «que funcione por empresa y todos los
  // proyectos»): el servidor enseña a cada uno lo suyo.
  /^\/conexion\/mcp$/,
  /^\/conexion\/conectores$/,
  // El webhook de transferencias SÍ es de empresa (y con «todos», de todas): se diseñó
  // con ámbito «toda la empresa» (migración 206) y la pantalla y el servidor ya lo
  // resuelven. El muro lo dejaba usable solo con un campus elegido. Diego, 19/10: «los
  // webhooks en producción solo se ven por campus y debe ser por empresa».
  /^\/conexion\/webhook-transferencias$/,
  // Asignación de leads: con «todos», todas las configuraciones y decisiones que ve cada uno.
  /^\/conexion\/asignacion-leads$/,
  // El botón de WhatsApp de la web: con una empresa o «Todos», sus pulsaciones
  // sumadas; el botón se sigue configurando en cada campus. Diego, 30/10: «sigue
  // sin tener la vista de empresa».
  /^\/captacion\/whatsapp$/,
  // Actividad en WhatsApp: suma los campus de la empresa o todos (30/10).
  /^\/whatsapp\/actividad$/,
  /^\/profile$/,
  /^\/preferences$/,
  // Las de verdad. Solo estaban las rutas viejas en ingles (/profile,
  // /settings), que ya solo redirigen: con «Todos los proyectos» puesto, «Mi
  // perfil» y «Configuración» enseñaban «selecciona un proyecto» en vez del
  // perfil y la contraseña. Carlos, 01/10.
  /^\/perfil$/,
  /^\/preferencias$/,
  /^\/configuracion$/,
  /^\/notificaciones$/,
  /^\/manual$/,
  /^\/settings$/,
  /^\/soporte$/,
  /^\/certifex\/consultas$/,
  /^\/certifex\/emisiones$/,
  /^\/clientes\/matriculas\/certificaciones$/,
  /^\/clientes\/matriculas\/diplomas$/,
  /^\/status$/,
  /^\/ai-chat$/,
  /^\/tareas(?:\/.*)?$/,
  /^\/prueba_ui(?:_[a-z]+)?$/,
  // Facturas de colaboradores (#202). Diego, 10/10: «son por EMPRESA, no por
  // campus». Con «Todos los proyectos», todas las empresas que ve cada uno; y
  // «Mi factura» son las del propio colaborador, a todas sus empresas.
  /^\/finanzas\/facturas-colaboradores$/,
  /^\/mi-factura$/,

  // ─────────────────────────────────────────────────────────────────────────
  // #218, tanda 1 (03/11). Ya funcionaban con una EMPRESA (están abajo, en
  // `CON_SOCIEDAD_OK`) y su servidor, sin campus, se queda en los de quien pide
  // (`proyectosDelAmbito`; super admin y soporte, todos). Con «Todos» solo les
  // faltaba esta lista. Probado entrando como super admin y como admin.
  //
  // Seguimiento y Reportes, después de cerrar su fuga en el servidor (#620): antes,
  // sin campus, enseñaban los de todas las empresas.
  /^\/finanzas$/,
  /^\/finanzas\/ingresos$/,
  /^\/finanzas\/conversiones$/,
  /^\/finanzas\/egresos$/,
  /^\/finanzas\/por-cobrar$/,
  /^\/finanzas\/por-pagar$/,
  /^\/finanzas\/comisiones$/,
  /^\/finanzas\/pendiente-facturar$/,
  /^\/finanzas\/ventas-analisis$/,
  /^\/informes$/,
  /^\/prospectos\/seguimiento$/,
  // Las que no miran el campus: lo suyo de cada uno.
  /^\/correos$/,
  /^\/mensajes$/,
  /^\/mis-cursos$/,
  /^\/novedades$/,
  /^\/solicitudes-cambio$/,
  /^\/solicitudes-cambio\/\d+$/,
  /^\/configuracion\/claves$/,
  // WhatsApp es de la gestora, no del campus (el mismo motivo que con una empresa).
  /^\/whatsapp$/,
  /^\/whatsapp\/chat$/,
  /^\/whatsapp\/banco$/,
  /^\/whatsapp\/conexion$/,
  /^\/whatsapp\/ayuda$/,

  // #218, tanda 2: su servidor no entendía «Todos» (pedía un campus) y ahora,
  // sin campus, se queda en los de quien pide. Facturas: la lista, las cifras y
  // las ventas sin factura (emitir una sigue pidiendo su campus).
  /^\/finanzas\/facturas$/,
  // Pagos Stripe y Nóminas (leer): a super admin y soporte, sin campus, todos los
  // campus menos los de pruebas. Sincronizar Stripe o crear una nómina sigue
  // pidiendo UN campus: cada uno tiene su cuenta y sus nóminas.
  /^\/finanzas\/pagos-stripe$/,
  /^\/finanzas\/nominas$/,
  // #218, tanda 3: pantallas de UN campus que, con una empresa o «Todos», ya no
  // se tapian: piden el campus DENTRO (Proceso comercial, Buscar duplicados,
  // Meta Ads, Chat IA; `useCampusDeLaPantalla`), suman los campus de quien mira
  // (Revisión de duplicados, #620) o listan sus campus (Moodle).
  /^\/prospectos\/proceso$/,
  /^\/prospectos\/duplicados$/,
  /^\/prospectos\/revision-duplicados$/,
  /^\/meta-ads$/,
  /^\/chat-ia$/,
  /^\/conexion\/moodle(?:\/\d+)?$/,
  // CRM#632 (auditoría del 03/11): el admin con varios campus se quedaba en el
  // muro en Configuración › Documentos y › Plantillas de email. Numeración de
  // documentos lista los campus del ámbito, cada uno con lo suyo; las plantillas
  // piden el campus dentro (`useCampusDeLaPantalla`).
  /^\/configuracion\/documentos$/,
  /^\/configuracion\/plantillas-email$/,
  // #218, tanda 4 (Diego, 04/11): Convocatorias con todos sus campus juntos, cada
  // una con su campus. El embudo y los pendientes ya recortaban por campus
  // (#620); crear una convocatoria sigue pidiendo un campus.
  /^\/prospectos\/convocatorias$/,
  // #218, tanda 4 (Diego, 04/11): el catálogo de todos los campus juntos, cada
  // producto con su campus; el Árbol de categorías y WooCommerce, el de cada
  // campus solo para ver. Crear, sincronizar o configurar sigue pidiendo un
  // campus. Cursos pendientes ya tenía su pestaña «Todos los campus» (#336).
  /^\/productos(?:\/(?:arbol|categorias|pendientes|woocommerce))?$/,
  // #218, tanda 4 (Diego, 04/11): Integraciones enseña el estado de cada campus
  // en una lista, solo para ver. Conectar o cambiar una clave sigue pidiendo
  // elegir el campus.
  /^\/finanzas\/integraciones$/,
  // #218, tanda 4 (Diego, 04/11): Análisis IA con los informes de todos sus campus
  // (generar uno pide su campus dentro) y Pregunta a tus datos, que ya contestaba
  // con los campus de la empresa o de quien pregunta (#245).
  /^\/informes\/(?:ia|preguntar)$/,
];

// Exportadas para la prueba del muro (#208): que «Mi perfil» no vuelva a quedar
// detras de «selecciona un proyecto» con ningun ambito.
export function pathAllowsAll(pathname) {
  return ALL_PROJECTS_OK.some((rx) => rx.test(pathname));
}

// Las pantallas que SI saben acotar a una sociedad (#120, #103, Ventas).
//
// Sumar varios campus tiene que significar algo para que la pantalla entre
// aqui. Reportes y Ventas lo piden con `issuerId`; Prospectos y Clientes con
// la lista de ids de sus campus, que es lo que `/leads` ya sabia recibir.
//
// El resto NO estan aqui a proposito, y son dos casos distintos:
//
//   Las de CIFRAS que aun no saben sumar campus enseñarian los datos de todos
//   los proyectos bajo la etiqueta «CEDIA» —cifras de una cosa con el nombre
//   de otra—, que es peor que no enseñarlas: se leen como buenas.
//
//   Las de CONFIGURACION no entran nunca: un webhook o un formulario se montan
//   PARA UN PROYECTO, y «el webhook de CEDIA» no existe. Ahi el muro de «elige
//   un proyecto» es la respuesta correcta, no un fallo.
const CON_SOCIEDAD_OK = [
  /^\/informes$/,
  // Tareas funciona tanto con todos como con empresa elegida
  /^\/tareas(?:\/.*)?$/,
  // Conexión: MCP y Conectores, con una empresa puesta, lo de esa empresa.
  /^\/conexion\/mcp$/,
  /^\/conexion\/conectores$/,
  // El webhook de transferencias SÍ es de empresa (y con «todos», de todas): se diseñó
  // con ámbito «toda la empresa» (migración 206) y la pantalla y el servidor ya lo
  // resuelven. El muro lo dejaba usable solo con un campus elegido. Diego, 19/10: «los
  // webhooks en producción solo se ven por campus y debe ser por empresa».
  /^\/conexion\/webhook-transferencias$/,
  // Asignación de leads (CRM#513): con una empresa, sus configuraciones y las
  // decisiones de sus campus, con un filtro de campus. Diego, 28/10: «tengo que
  // verlo por empresa y campus».
  /^\/conexion\/asignacion-leads$/,
  // El botón de WhatsApp de la web: con una empresa o «Todos», sus pulsaciones
  // sumadas; el botón se sigue configurando en cada campus. Diego, 30/10: «sigue
  // sin tener la vista de empresa».
  /^\/captacion\/whatsapp$/,
  // Actividad en WhatsApp: suma los campus de la empresa o todos (30/10).
  /^\/whatsapp\/actividad$/,
  // Feedback suma los campus de la empresa (Diego, 28/09: «tiene que ser campus
  // y no empresas… lo hemos dicho»): la pantalla ya manda issuerId y el
  // backend lo resuelve con proyectosDelAmbito. Solo faltaba esta línea.
  /^\/informes\/feedback$/,
  // Las novedades son del CRM entero, no de un campus.
  /^\/novedades$/,
  /^\/ventas$/,
  /^\/finanzas\/ventas$/,
  // Prospectos, su kanban y Clientes. La pantalla y el servidor YA saben sumar
  // varios campus --mandan `projectIds` y el modelo los recibe--: lo unico que
  // faltaba era que el muro les dejara pasar. Diego, 15/09: «en prospectos si
  // elijo empresas deben de salir».
  /^\/prospectos$/,
  /^\/prospectos\/pipeline$/,
  /^\/prospectos\/\d+$/,
  /^\/clientes$/,
  /^\/clientes\/\d+$/,
  // Matrículas (#199): «por empresa y con "Todos los proyectos", como el resto
  // del CRM». El listado manda issuerId y el servidor lo resuelve con
  // proyectosDelAmbito; la pestaña de webhooks pide elegir un campus.
  /^\/clientes\/matriculas$/,
  // Facturas es la pantalla que Diego pone de ejemplo: sabia filtrar por
  // sociedad antes que nadie. Dejarla fuera era mandarle el aviso de «elige un
  // campus» justo a la unica que no lo necesitaba.
  /^\/finanzas\/facturas$/,
  // Y EMITIR UNA, tambien. Diego, 25/09: «como voy a registrar una venta de una
  // empresa y me sale esto, no puede pasar».
  //
  // La pantalla YA sabe: tiene su propio selector de proyecto --y solo ofrece
  // los de la misma sociedad, que no se factura cruzado--. Lo que pasaba es que
  // el muro se levantaba antes de que llegara a pintarlo, asi que ese selector
  // no lo veia nadie. Con el listado ya abierto y la emision cerrada, se podia
  // mirar una factura de CEDIA pero no hacerla.
  /^\/finanzas\/facturas\/nueva$/,
  // Análisis de ventas (#136). Su servidor es el mismo módulo `sales` que ya
  // sabe de sociedades; lo único que le faltaba era que la pantalla mandara
  // `issuerId` y que la ruta no chocara con el muro de aquí.
  /^\/finanzas\/ventas-analisis$/,
  // El proceso comercial (#89 · #90). La cola suma los campus de la empresa —el
  // servidor ya sabia recibir varios proyectos— y la pantalla de los pasos
  // pregunta cual, pero solo entre los de esa empresa. Diego, 14/09: «estos
  // procesos en empresas deben ser por empresa, no por proyecto».
  /^\/prospectos\/cola$/,
  /^\/prospectos\/proceso$/,
  // El repaso de fin de mes suma los campus igual que la cola.
  /^\/prospectos\/seguimiento$/,
  // Tutores, los cuatro. Diego, 15/09: «no me deja elegir la empresa ni los
  // proyectos y no puedo seguir con testeo».
  //
  // Las pantallas ya estaban hechas --mandan `issuerId` y traen su selector de
  // campus-- y el servidor ya lo traducia con `proyectosDelAmbito`. Lo unico
  // que faltaba era esta lista: el muro se levantaba ANTES de que la pantalla
  // llegara a pintarse, asi que el trabajo de por-empresa no se veia nunca.
  // «Sin tutor» era la unica que no mandaba la empresa; ya la manda, asi que
  // entra con las otras.
  /^\/tutores$/,
  /^\/tutores\/comisiones$/,
  /^\/tutores\/sin-tutor$/,
  // Consultas de alumnos (#188, #189): el servidor acota a los campus de la
  // empresa con `proyectosDelAmbito`; sin esto el muro tapaba la bandeja.
  /^\/consultas(?:\/.*)?$/,
  // «Mis cursos» es lo del propio tutor: no filtra por proyecto NI por empresa,
  // asi que pedirle que elija un campus no significaba nada.
  /^\/mis-cursos$/,
  // La bandeja del CRM (#146). Tampoco mira el proyecto: el servidor acota sola.
  /^\/correos$/,
  // El Dashboard. Diego, 15/09: «es por empresa, eso lo sabes» — y el 17 otra
  // vez, viendo el muro con CEDIA puesta: «aqui debo de tener la opcion de
  // verlos todos».
  //
  // Por dentro ya lo era: `useDashboard` llama a `useIdsDelAmbito`, que con una
  // empresa elegida devuelve SUS campus y ninguno mas, y despues suma las
  // estadisticas de cada uno; elegir una empresa deja el proyecto en «Todos»
  // justo para eso. Lo unico que pasaba es que el muro se levantaba antes de
  // que la pantalla llegara a pedir nada.
  /^\/$/,

  // ─────────────────────────────────────────────────────────────────────────
  // WhatsApp (#128, #138). El chat es de la GESTORA, no del proyecto: sus
  // conversaciones son las mismas con CEDIA puesta o con uno de sus campus. Lo
  // unico que miraba el proyecto era buscar un prospecto para empezar una
  // conversacion y la lista de plantillas, y las dos aceptan ya los campus de
  // la empresa. Sin esto, WhatsApp quedaba tapado por el muro justo para quien
  // tiene una sociedad elegida, que es como trabaja Diego.
  /^\/whatsapp$/,
  /^\/whatsapp\/chat$/,
  /^\/whatsapp\/plantillas$/,
  /^\/whatsapp\/banco$/,
  /^\/whatsapp\/conexion$/,
  /^\/whatsapp\/ayuda$/,

  // ─────────────────────────────────────────────────────────────────────────
  // Las que NO MIRAN el proyecto para nada. Estaban detras del muro por no
  // estar en la lista, no porque el muro dijera algo de ellas: pedirle a
  // alguien que elija un campus para ver su propio perfil no significa nada.
  // El muro esta para que una pantalla no ensene cifras de un ambito que no
  // sabe sumar; estas no ensenan cifras de nada.
  /^\/perfil$/,
  /^\/preferencias$/,
  // Configuración: proyectos, usuarios y disponibilidad son de todo el CRM, y
  // la pestaña de APIs elige su proyecto dentro del dialogo.
  /^\/configuracion$/,
  /^\/notificaciones$/,
  /^\/manual$/,
  /^\/soporte$/,
  /^\/certifex\/consultas$/,
  /^\/certifex\/emisiones$/,
  /^\/clientes\/matriculas\/certificaciones$/,
  /^\/clientes\/matriculas\/diplomas$/,
  /^\/status$/,
  /^\/registro$/,
  /^\/mensajes$/,
  /^\/chat-ia$/,
  /^\/documentos$/,
  /^\/solicitudes-cambio$/,
  /^\/solicitudes-cambio\/\d+$/,
  /^\/configuracion\/atajos$/,
  /^\/configuracion\/roles$/,
  /^\/configuracion\/claves$/,
  // Conectores. Diego, 29/09: «no puedo estar con la empresa, tengo que hacer
  // la empresa». Con una empresa puesta salen los de todos sus campus, cada uno
  // con el suyo, y al crear se elige el campus: un conector sigue siendo de uno.
  /^\/captacion\/conectores$/,

  // ─────────────────────────────────────────────────────────────────────────
  // FINANZAS. Diego, 15/09: «catalogo y publicidad individual, pero finanzas es
  // por empresa claramente». Y tiene sentido: el dinero se rinde por sociedad
  // --es la que factura y la que declara--, no por campus.
  //
  // Las consultas de estas nueve aceptan ya la lista de campus: se hizo con el
  // mismo `comoLista` que usan Prospectos y Facturas, para que la regla de
  // «una empresa son sus campus» viva en un solo sitio.
  /^\/finanzas$/,
  // Ingresos. Diego, 22/09: «ventas, ingresos y eso debe ponerse en toda la
  // empresa, no por campus». La pantalla ya mandaba `issuerId` en sus cuatro
  // llamadas y los cuatro endpoints ya lo entendian: lo unico que sobraba era
  // este muro, que se levantaba antes de que la pantalla llegara a pedir nada.
  /^\/finanzas\/ingresos$/,
  /^\/finanzas\/conversiones$/,
  /^\/finanzas\/egresos$/,
  /^\/finanzas\/por-cobrar$/,
  /^\/finanzas\/por-pagar$/,
  /^\/finanzas\/comisiones$/,
  /^\/finanzas\/pagos-stripe$/,
  /^\/finanzas\/pendiente-facturar$/,
  // Nominas. Las paga la SOCIEDAD, asi que verlas campus a campus obligaba a
  // sumar siete pantallas a mano. Leer acepta varios; crear una nomina,
  // apuntar horas o generar un periodo siguen pidiendo un campus concreto,
  // porque cada uno pertenece a un proyecto y «la nomina de CEDIA» no existe.
  /^\/finanzas\/nominas$/,
  /^\/finanzas\/ventas\/\d+$/,
  // Facturas de colaboradores (#202). Diego, 10/10: «las facturas de
  // colaboradores son por EMPRESA, no por campus»: las factura la sociedad
  // (`issuer_id`), y la pantalla sigue a la empresa de la cabecera. «Mi
  // factura» no depende de la cabecera: son las del propio colaborador.
  /^\/finanzas\/facturas-colaboradores$/,
  /^\/mi-factura$/,
  // #218, tanda 3: pantallas de UN campus que, con una empresa o «Todos», ya no
  // se tapian: piden el campus DENTRO (Proceso comercial, Buscar duplicados,
  // Meta Ads, Chat IA; `useCampusDeLaPantalla`), suman los campus de quien mira
  // (Revisión de duplicados, #620) o listan sus campus (Moodle).
  /^\/prospectos\/proceso$/,
  /^\/prospectos\/duplicados$/,
  /^\/prospectos\/revision-duplicados$/,
  /^\/meta-ads$/,
  /^\/chat-ia$/,
  /^\/conexion\/moodle(?:\/\d+)?$/,
  // CRM#632 (auditoría del 03/11): el admin con varios campus se quedaba en el
  // muro en Configuración › Documentos y › Plantillas de email. Numeración de
  // documentos lista los campus del ámbito, cada uno con lo suyo; las plantillas
  // piden el campus dentro (`useCampusDeLaPantalla`).
  /^\/configuracion\/documentos$/,
  /^\/configuracion\/plantillas-email$/,
  // #218, tanda 4 (Diego, 04/11): Convocatorias con todos sus campus juntos, cada
  // una con su campus. El embudo y los pendientes ya recortaban por campus
  // (#620); crear una convocatoria sigue pidiendo un campus.
  /^\/prospectos\/convocatorias$/,
  // #218, tanda 4 (Diego, 04/11): el catálogo de todos los campus juntos, cada
  // producto con su campus; el Árbol de categorías y WooCommerce, el de cada
  // campus solo para ver. Crear, sincronizar o configurar sigue pidiendo un
  // campus. Cursos pendientes ya tenía su pestaña «Todos los campus» (#336).
  /^\/productos(?:\/(?:arbol|categorias|pendientes|woocommerce))?$/,
  // #218, tanda 4 (Diego, 04/11): Integraciones enseña el estado de cada campus
  // en una lista, solo para ver. Conectar o cambiar una clave sigue pidiendo
  // elegir el campus.
  /^\/finanzas\/integraciones$/,
  // #218, tanda 4 (Diego, 04/11): Análisis IA con los informes de todos sus campus
  // (generar uno pide su campus dentro) y Pregunta a tus datos, que ya contestaba
  // con los campus de la empresa o de quien pregunta (#245).
  /^\/informes\/(?:ia|preguntar)$/,
];

export function rutaAceptaSociedad(pathname) {
  return CON_SOCIEDAD_OK.some((rx) => rx.test(pathname));
}

/**
 * Una pantalla que el menú no le enseña —le falta su permiso— tampoco se abre
 * escribiendo la dirección (#631): dice «No tienes acceso» en vez de abrirse a
 * medias y llenarse de 403.
 */
function PantallaConPermiso({ pathname, children }) {
  const { can } = usePermission();
  const { permissions } = useAuth();
  // Sin el mapa de permisos todavía (al entrar), `can` dice que no a todo: no se
  // decide nada hasta que llegue, o saldría un «No tienes acceso» falso.
  if (!permissions || rutaPermitida(pathname, can)) return children;
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <EmptyState
        icon={LockKey}
        title="No tienes acceso a esta pantalla"
        description="Si crees que deberías verla, pídeselo a un administrador."
      />
    </div>
  );
}

function AllProjectsGuard({ pathname, children }) {
  const { isAllProjects, activeIssuer } = useProjectContext();
  if (activeIssuer) {
    if (rutaAceptaSociedad(pathname)) return children;
    // El aviso decia «tienes activa la vista Todos los proyectos» con CEDIA
    // puesta. No era verdad, y mandaba a tocar el selector equivocado.
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <NeedsProjectBanner sociedad={activeIssuer.nombre} />
      </div>
    );
  }
  if (isAllProjects && !pathAllowsAll(pathname)) {
    return <div className="p-6 max-w-2xl mx-auto"><NeedsProjectBanner /></div>;
  }
  return children;
}

import Topbar from './Topbar';
import { CabeceraProvider } from './CabeceraContext';

const FloatingDock = lazy(() => import('./FloatingDock'));
const ShortcutsFAB = lazy(() => import('./ShortcutsFAB'));
const PWAInstallPrompt = lazy(() => import('./PWAInstallPrompt'));
const PWAUpdatePrompt = lazy(() => import('./PWAUpdatePrompt'));
const KeyboardShortcutsModal = lazy(() => import('./KeyboardShortcutsModal'));
const OfflineBanner = lazy(() => import('./OfflineBanner'));
// Avisa de una llamada de WhatsApp desde cualquier pantalla del CRM. Va aqui
// y no en el modulo de WhatsApp a proposito: la llamada se pierde justo
// cuando la gestora esta en otra parte y el movil no lo tiene delante.
const AvisoDeLlamada = lazy(() => import('./AvisoDeLlamada'));
// Avisa de un mensaje entrante desde cualquier pantalla. Antes de esto el CRM
// no avisaba de nada cuando entraba un WhatsApp.
const AvisoDeMensaje = lazy(() => import('./AvisoDeMensaje'));

const COLLAPSED_KEY = 'crm.sidebar.collapsed';

// Mapa de "n" (nuevo) según ruta actual
const NEW_ACTIONS = {
  '/prospectos': { url: '/prospectos?new=1', label: 'prospecto' },
  '/clientes': { url: '/prospectos?new=1', label: 'prospecto' },
  '/productos': { url: '/productos?new=1', label: 'producto' },
  '/captacion': { url: '/captacion?new=1', label: 'formulario' },
  '/captacion/webhooks': { url: '/captacion/webhooks?new=1', label: 'webhook' },
  '/secuencias-email': { url: '/secuencias-email?new=1', label: 'secuencia' },
  // Egresos vive en /finanzas/egresos: /accounting/expenses no existe en este CRM (#227).
  '/finanzas/egresos': { url: '/finanzas/egresos?new=1', label: 'egreso' },
  // Las rutas en inglés (/accounting/…) no existen en este CRM: llevaban a «no encontrada».
  '/finanzas/por-pagar': { url: '/finanzas/por-pagar?new=1', label: 'cuenta por pagar' },
};

// Navegación rápida G + tecla
const G_TARGETS = {
  d: '/',
  l: '/prospectos',
  c: '/clientes',
  p: '/productos',
  r: '/informes',
  a: '/finanzas',
  s: '/configuracion',
};

export default function AppLayout() {
  const { permissions } = useAuth();
  // Quien no tiene WhatsApp —el colaborador (QA del 07/10), el tutor (QA del
  // 22/10)…— recibe un 403 del servidor, y estos avisos preguntaban cada pocos
  // segundos. Se decide con el mismo criterio que el servidor: su permiso (#423).
  const sinWhatsapp = !tieneWhatsapp(permissions);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const hideFloating = pathname.startsWith('/documentos');

  // Estado del prefijo "g" para navegación rápida (g + d/l/c/p/r/a/s)
  const gPendingRef = useRef(false);
  const gTimerRef = useRef(null);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  // Atajos globales de teclado
  useEffect(() => {
    function isTyping() {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (document.activeElement?.isContentEditable) return true;
      return false;
    }

    function clearGPending() {
      gPendingRef.current = false;
      if (gTimerRef.current) {
        clearTimeout(gTimerRef.current);
        gTimerRef.current = null;
      }
    }

    function onKey(e) {
      // Cmd/Ctrl + B → toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !e.shiftKey && !e.altKey) {
        if (isTyping()) return;
        e.preventDefault();
        toggleCollapsed();
        return;
      }

      // Si el usuario está escribiendo, no procesamos atajos sin modificadores
      if (isTyping()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // ? → modal de atajos (Shift+/ en teclados ES y US)
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        clearGPending();
        return;
      }

      // Secuencia "g" + tecla
      if (gPendingRef.current) {
        const target = G_TARGETS[e.key.toLowerCase()];
        clearGPending();
        if (target) {
          e.preventDefault();
          navigate(target);
        }
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        gPendingRef.current = true;
        gTimerRef.current = setTimeout(clearGPending, 1500);
        return;
      }

      // n → nuevo (según ruta actual)
      if (e.key === 'n' || e.key === 'N') {
        const action = NEW_ACTIONS[pathname] || NEW_ACTIONS[Object.keys(NEW_ACTIONS).find((p) => pathname.startsWith(p)) || ''];
        if (action) {
          e.preventDefault();
          navigate(action.url);
          toast({ title: `Nuevo ${action.label}`, duration: 1500 });
        }
        return;
      }
    }

    function onOpenShortcuts() { setShortcutsOpen(true); }

    window.addEventListener('keydown', onKey);
    window.addEventListener('crm:open-shortcuts', onOpenShortcuts);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crm:open-shortcuts', onOpenShortcuts);
      clearGPending();
    };
  }, [navigate, pathname]);

  return (
    <CabeceraProvider>
    <div className="min-h-screen bg-background">
      {/* Skip-to-content (a11y) — visible solo con foco por teclado */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-3 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:font-semibold focus:text-sm"
      >
        Saltar al contenido
      </a>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-60 h-full">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menu"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      {/* Main content - Suspense interno para que el sidebar no se desmonte al lazy-cargar paginas */}
      {/*
        La cabecera, por fin montada.

        Estaba escrita --Topbar, CabeceraContext y el hueco que rellena
        `PageHeader`-- pero no la pintaba nadie, y en el menu lateral YA se
        habia quitado el selector de proyecto contando con ella (#79, punto 2).
        Resultado en /testeo: no habia forma de cambiar de empresa. Diego,
        15/09: «no puedo elegir las sociedades como en produccion».

        Va dentro del margen del menu y es `sticky`, asi que al bajar por una
        tabla larga sigues sabiendo donde estas y en que marca.
      */}
      <div className={cn('transition-[margin] duration-200', collapsed ? 'lg:ml-16' : 'lg:ml-64')}>
        <Topbar onAbrirMenu={() => setMobileOpen(true)} />
        <main
          id="main-content"
          role="main"
          aria-label="Contenido principal"
          tabIndex={-1}
          className="p-4 lg:p-6 xl:p-8 focus:outline-none"
        >
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        }>
          {/* Fade-in suave en cada cambio de ruta — key={pathname} fuerza remount */}
          <div key={pathname} className="animate-in fade-in duration-200">
            <PantallaConPermiso pathname={pathname}>
              <AllProjectsGuard pathname={pathname}>
                <Outlet />
              </AllProjectsGuard>
            </PantallaConPermiso>
          </div>
          </Suspense>
        </main>
      </div>

      <Toaster />
      <CommandPalette />
      {(pathname.startsWith('/manual') || pathname === '/soporte') && !mobileOpen && (
        <Suspense fallback={null}>
          <FloatingDock />
        </Suspense>
      )}
      {!hideFloating && !mobileOpen && (
        <Suspense fallback={null}>
          <ShortcutsFAB />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <PWAInstallPrompt />
      </Suspense>
      <Suspense fallback={null}>
        <PWAUpdatePrompt />
      </Suspense>
      <Suspense fallback={null}>
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <OfflineBanner />
      </Suspense>
      {!sinWhatsapp && (
        <Suspense fallback={null}>
          <AvisoDeLlamada />
          <AvisoDeMensaje />
        </Suspense>
      )}
    </div>
    </CabeceraProvider>
  );
}
