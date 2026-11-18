/**
 * Las pantallas de IA del propio CRM (#30): «Análisis IA», «Pregunta a tus
 * datos» y «Chat IA».
 *
 * Diego, 10/11/2026: el chatbot de IA del CRM ya no va, porque se usa Claude
 * por el MCP. Las tres salen del menú, del buscador (Ctrl+K, que lee el menú)
 * y de los accesos directos, y su dirección lleva al inicio. El código se
 * queda —pantallas, rutas del servidor y pruebas— por si un día se recupera.
 * El MCP de Claude no depende de esto.
 *
 * Para volver a encenderlas, en un solo sitio: `VITE_PANTALLAS_IA=1` en el
 * `.env` del frontal y volver a construir. «Pregunta a tus datos» sigue
 * además detrás de `SOLO_EN_PRUEBAS`, como antes.
 */
export const PANTALLAS_IA = import.meta.env.VITE_PANTALLAS_IA === '1';

/** Las direcciones de esas pantallas (y las de antes que llevaban a ellas). */
export const RUTAS_IA = ['/informes/ia', '/informes/preguntar', '/chat-ia', '/reports/ia', '/ai-chat'];
