import { query } from '../../shared/config/db.js';
import { tienePermiso } from '../../shared/middleware/permissions.js';
import { alcanceComercial, enElAlcance } from '../../shared/utils/roles.js';

/*
  ¿Puede eliminar ESTE prospecto quien pide la lista? (CRM#1220)

  Raquel, líder de equipo con `leads.delete`, no veía «Eliminar» en los
  prospectos de las gestoras de su equipo (el 22553, de Christine). La pantalla
  lo decidía por su cuenta: admin o superadmin por ROL, y si no, solo si el
  responsable era ella. No conoce el equipo, así que nunca acertaba.

  Lo decide el servidor, con la MISMA regla que `softDelete`:
    · sin `leads.delete`, ninguno;
    · con `leads.delete_cualquiera`, todos;
    · si no, los de su alcance (`alcanceComercial`: los suyos y, si lleva un
      equipo, los de su equipo; null = todo su campus) que no tengan venta.
  Y la pantalla pinta el botón con `puede_eliminar`. Si un día cambia la regla
  del borrado, cambia aquí también (lo vigila la prueba de este fichero).
  Mismo fichero en CRM-ISEIE (paridad).
*/
export async function marcarPuedeEliminar(req, leads) {
  if (!Array.isArray(leads) || !leads.length) return leads;
  const marcar = (regla) => {
    for (const l of leads) l.puede_eliminar = regla(l);
    return leads;
  };
  if (!(await tienePermiso(req, 'leads.delete'))) return marcar(() => false);
  if (await tienePermiso(req, 'leads.delete_cualquiera')) return marcar(() => true);

  const alcance = await alcanceComercial(req.user);
  const ids = leads.map((l) => Number(l.id)).filter(Number.isFinite);
  const { rows } = await query(
    'SELECT DISTINCT lead_id FROM conversions WHERE lead_id = ANY($1::int[])', [ids]);
  const conVenta = new Set(rows.map((r) => Number(r.lead_id)));
  return marcar((l) => enElAlcance(alcance, l.responsable_id) && !conVenta.has(Number(l.id)));
}
