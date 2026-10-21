// Qué puede hacer cada persona activa, acción por acción (#423).
//
//   node scripts/comparar-permisos.mjs --solo-antes [--guardar foto.json]
//       Lo que puede cada una con las reglas de antes (inventario/legado.js).
//
// Solo lee. La conexión va en modo de solo lectura: se puede pasar contra
// producción sin miedo a tocar nada. Usa DATABASE_URL.
import fs from 'fs';
import pg from 'pg';
import 'dotenv/config';

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] || true) : null; };

const { construirInventario, puedeAntes } = await import('../src/modules/permissions/inventario/index.js');
const { perfilDesdeFilas } = await import('../src/modules/permissions/inventario/legado.js');

/** Todas las personas activas, con lo que hace falta para decidir. */
export async function leerPersonas(client) {
  const { rows: users } = await client.query(`
    SELECT u.id, u.nombre, u.email, u.role::text AS role, COALESCE(u.roles_extra::text[], '{}') AS roles_extra,
           u.active, u.custom_role_id,
           COALESCE(u.factura_manager, false) AS factura_manager,
           COALESCE(u.editar_fechas_factura, false) AS editar_fechas_factura,
           COALESCE(u.gestor_colaboraciones, false) AS gestor_colaboraciones,
           COALESCE((to_jsonb(u) ->> 'usa_mcp')::boolean, false) AS usa_mcp,
           (to_jsonb(u) ->> 'usa_whatsapp')::boolean AS usa_whatsapp
      FROM users u WHERE u.active = true ORDER BY u.id`);
  const { rows: roles } = await client.query('SELECT id, label, base_role, permissions, active FROM custom_roles');
  const { rows: exc } = await client.query('SELECT user_id, resource, action, allowed FROM user_permission_overrides');
  let ajustes = [];
  const hay197 = await client.query(`SELECT to_regclass('public.role_permission_overrides') AS t`);
  if (hay197.rows[0].t) ajustes = (await client.query('SELECT role, resource, action, allowed FROM role_permission_overrides')).rows;
  return users.map((u) => perfilDesdeFilas(u, {
    customRole: roles.find((r) => r.id === u.custom_role_id) || null,
    excepciones: exc.filter((e) => e.user_id === u.id),
    ajustesRol: ajustes,
  }));
}

/** { personaId: { filaId: true|false|null } } */
export function matrizAntes(personas, filas) {
  const m = {};
  for (const p of personas) {
    m[p.id] = {};
    for (const f of filas) m[p.id][f.id] = puedeAntes(p, f);
  }
  return m;
}

const esPrincipal = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('comparar-permisos.mjs');

if (esPrincipal) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN TRANSACTION READ ONLY');
  try {
    const filas = await construirInventario();
    const personas = await leerPersonas(client);
    if (opcion('--solo-antes')) {
      const m = matrizAntes(personas, filas);
      console.log(`${personas.length} personas activas · ${filas.length} acciones\n`);
      console.log('id    rol             puede   no   ?   persona');
      for (const p of personas) {
        const v = Object.values(m[p.id]);
        const rol = [p.role, ...p.roles_extra].join('+') + (p.custom_role ? `/${p.custom_role.label}` : '');
        console.log(`${String(p.id).padEnd(5)} ${rol.padEnd(15)} ${String(v.filter((x) => x === true).length).padStart(5)} ${String(v.filter((x) => x === false).length).padStart(5)} ${String(v.filter((x) => x === null).length).padStart(3)}   ${p.email}`);
      }
      const guardar = opcion('--guardar');
      if (typeof guardar === 'string') {
        fs.writeFileSync(guardar, JSON.stringify({ cuando: new Date().toISOString(), personas: personas.map((p) => ({ id: p.id, email: p.email })), matriz: m }, null, 1));
        console.log(`\nGuardado en ${guardar}`);
      }
    } else {
      console.log('Uso: --solo-antes [--guardar foto.json]');
    }
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
  process.exit(0);
}
