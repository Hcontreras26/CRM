import client from '@/shared/api/client';

/**
 * Los conectores de un proyecto (#6).
 *
 * El backend ya estaba entero. Lo unico que no expone por su cuenta es el
 * catalogo de tipos y destinos —vive en constantes del controlador— asi que se
 * repite abajo. Hay una prueba que compara las dos listas leyendo los ficheros:
 * si alguien anade un tipo alli y no aqui, se cae.
 */

/** Lo que el conector puede traer. Espejo de VALID_TYPES del controlador. */
export const TIPOS = [
  { id: 'woocommerce_products', label: 'WooCommerce · productos' },
  { id: 'woocommerce_orders', label: 'WooCommerce · pedidos' },
  { id: 'wp_rest', label: 'WordPress (REST)' },
  { id: 'acf', label: 'WordPress + ACF' },
  { id: 'custom_api', label: 'API propia' },
  { id: 'mcp', label: 'Servidor MCP' },
] as const;

/** Donde acaba lo que trae. Espejo de VALID_DESTINATIONS. */
export const DESTINOS = [
  { id: 'product', label: 'Productos' },
  { id: 'lead', label: 'Prospectos' },
  { id: 'matricula', label: 'Matrículas' },
  { id: 'category', label: 'Categorías' },
] as const;

export type TipoConector = typeof TIPOS[number]['id'];
export type DestinoConector = typeof DESTINOS[number]['id'];

/**
 * Que campos pide cada tipo, y cuales son secretos.
 *
 * Los marcados `secreto` no vuelven nunca del servidor: se envian al guardar y
 * despues solo se sabe SI hay uno puesto, por `secretos_guardados`. Por eso el
 * formulario los trata como «escribe para cambiarlo», no como un campo normal
 * que se rellena con lo que habia.
 */
export const CAMPOS_POR_TIPO: Record<TipoConector, Array<{
  clave: string; label: string; ayuda?: string; secreto?: boolean; requerido?: boolean;
}>> = {
  woocommerce_products: [
    { clave: 'base_url', label: 'Dirección de la tienda', ayuda: 'https://mitienda.com', requerido: true },
    { clave: 'consumer_key', label: 'Consumer key', ayuda: 'Empieza por ck_', requerido: true },
    { clave: 'consumer_secret', label: 'Consumer secret', ayuda: 'Empieza por cs_', secreto: true, requerido: true },
  ],
  woocommerce_orders: [
    { clave: 'base_url', label: 'Dirección de la tienda', ayuda: 'https://mitienda.com', requerido: true },
    { clave: 'consumer_key', label: 'Consumer key', requerido: true },
    { clave: 'consumer_secret', label: 'Consumer secret', secreto: true, requerido: true },
  ],
  wp_rest: [
    { clave: 'base_url', label: 'Dirección del sitio', ayuda: 'https://misitio.com', requerido: true },
    { clave: 'endpoint', label: 'Ruta', ayuda: 'Por defecto wp/v2/posts' },
    { clave: 'wp_user', label: 'Usuario', ayuda: 'Solo si el contenido es privado' },
    { clave: 'wp_app_password', label: 'Contraseña de aplicación', secreto: true },
  ],
  acf: [
    { clave: 'base_url', label: 'Dirección del sitio', requerido: true },
    { clave: 'endpoint', label: 'Ruta', ayuda: 'Por defecto acf/v3/posts' },
    { clave: 'wp_user', label: 'Usuario' },
    { clave: 'wp_app_password', label: 'Contraseña de aplicación', secreto: true },
  ],
  custom_api: [
    // `url`, no `base_url`: es lo que lee `customRequest` en el adaptador. Los
    // demas tipos si usan `base_url`. Puse `base_url` de memoria y el conector
    // contestaba «config.url requerida» — por eso las claves salen de leer el
    // adaptador y no del ticket.
    { clave: 'url', label: 'Dirección completa', ayuda: 'La URL que devuelve el JSON', requerido: true },
    { clave: 'items_path', label: 'Dónde está la lista', ayuda: 'Por ejemplo data — vacío si el JSON ya es la lista' },
    { clave: 'bearer_token', label: 'Token', ayuda: 'Se manda como Authorization: Bearer', secreto: true },
  ],
  // Un servidor MCP de fuera, como los que usa Claude (Diego, 29/09). Solo se
  // llama a herramientas de consulta: ver connectors.mcp.js en el servidor.
  mcp: [
    { clave: 'url', label: 'Dirección del servidor MCP', ayuda: 'https://… — la misma que se pondría en Claude', requerido: true },
    { clave: 'bearer_token', label: 'Token', ayuda: 'Si el servidor lo pide. Se manda como Authorization: Bearer', secreto: true },
    { clave: 'herramienta', label: 'Herramienta', ayuda: 'La que trae los datos. Búscala con «Ver herramientas»', requerido: true },
    { clave: 'argumentos', label: 'Argumentos (JSON)', ayuda: 'Lo que se le pasa a la herramienta, por ejemplo {"limite": 100}' },
    { clave: 'items_path', label: 'Dónde está la lista', ayuda: 'Por ejemplo prospectos — vacío si ya es la lista' },
  ],
};

/** De quién es un conector (migración 183). */
export type AlcanceConector = 'campus' | 'empresa' | 'sistema';

/** Una herramienta de un servidor MCP, dicha por el propio servidor. */
export interface HerramientaMcp {
  nombre: string; titulo: string | null; descripcion: string;
  /** Solo estas se pueden usar: el CRM solo consulta. */
  soloLectura: boolean;
}

export interface Conector {
  id: number;
  project_id: number;
  /** El nombre de su campus (en uno de empresa o de sistema, el campus por defecto). */
  proyecto?: string | null;
  alcance?: AlcanceConector;
  issuer_id?: number | null;
  /** Nombre de su empresa, si es de empresa. */
  empresa?: string | null;
  type: TipoConector;
  label: string;
  destination: DestinoConector;
  config: Record<string, string>;
  /** Que secretos hay puestos. El valor nunca viaja. */
  secretos_guardados?: Record<string, boolean>;
  field_mapping: Record<string, unknown>;
  active: boolean;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | 'partial' | null;
  last_sync_count: number | null;
  sample_received_at: string | null;
}

/** Un campo del JSON externo, tal y como lo describe el servidor. */
export interface CampoDelOrigen { path: string; type: string; sample?: unknown }

/** Un campo del CRM al que se puede apuntar. */
export interface CampoDestino {
  key: string; label: string; type: string; required?: boolean; group?: string;
}

export interface VistaPrevia {
  type: string;
  destination: string;
  items_count_total: number;
  samples: Array<Record<string, unknown>>;
  schema: CampoDelOrigen[];
  targets: CampoDestino[];
  transforms: Array<{ id: string; label: string }>;
  field_mapping_actual: Record<string, unknown>;
  sugeridos: Record<string, string>;
  mapped_preview: Record<string, unknown> | null;
}

export const conectoresApi = {
  /** `projectId` o `issuerId` (una empresa: los de todos sus campus), de `ponerAmbito`. */
  listar: (ambito: URLSearchParams) => client.get(`/connectors?${ambito.toString()}`),
  uno: (id: number) => client.get(`/connectors/${id}`),
  crear: (datos: Partial<Conector>) => client.post('/connectors', datos),
  cambiar: (id: number, datos: Partial<Conector>) => client.patch(`/connectors/${id}`, datos),
  borrar: (id: number) => client.delete(`/connectors/${id}`),
  /** Trae hasta 3 elementos de verdad del origen, con el catálogo de campos. */
  vistaPrevia: (id: number) => client.post(`/connectors/${id}/preview`, {}),
  /** Lanza la importación. Contesta en seguida; el estado se mira releyendo. */
  importar: (id: number) => client.post(`/connectors/${id}/import`, {}),
  /** Las herramientas de un servidor MCP. Al editar, sin token usa el guardado. */
  herramientasMcp: (datos: { url: string; bearer_token?: string; connector_id?: number }) =>
    client.post('/connectors/mcp/herramientas', datos),
};
