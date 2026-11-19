import { alcanceComercial } from '../../shared/utils/roles.js';

/**
 * Qué facturas ve cada persona: el recorte POR PERSONA (el de campus va aparte).
 *
 * Diego, 19/11/2026: «las gestoras y admin que tienen acceso a facturación tienen
 * que ver TODAS las facturas, no solo las suyas». Acceso a facturación es «Poner
 * número al cobrar» (`facturas.emitir`), lo que abre la entrada Facturación del
 * menú: con él, ninguna persona fuera (null). Sin él, el alcance comercial de
 * siempre: una gestora, las suyas; quien lleva un equipo, las de su equipo.
 */
export async function alcanceDeFacturas(user) {
  const id = Number(user?.userId ?? user?.id);
  if (Number.isInteger(id) && id > 0) {
    try {
      const { explicarPermisos } = await import('../permissions/permissions.service.js');
      const e = await explicarPermisos(id);
      if (e?.mapa?.['facturas.emitir'] === true) return null;
    } catch { /* sin poder leer los permisos, el recorte de siempre */ }
  }
  return alcanceComercial(user);
}
