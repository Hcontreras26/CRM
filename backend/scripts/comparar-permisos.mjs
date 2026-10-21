// Qué puede hacer cada persona activa, acción por acción: antes y después de
// #423. Diego: «tiene que salir idéntico; lo que cambie a propósito, en una
// lista aparte para que yo lo apruebe uno a uno».
//
//   node scripts/comparar-permisos.mjs                 compara (base ya migrada)
//   node scripts/comparar-permisos.mjs --simular       pasa la 221 y la 222 dentro de
//                                                      una transacción, compara y
//                                                      DESHACE: no cambia nada
//   node scripts/comparar-permisos.mjs --solo-antes [--guardar foto.json]
//                                                      lo de antes, sin comparar
//   --detalle                                          cada diferencia, una a una
//
// «Antes» son las reglas de antes, congeladas (inventario/legado.js) sobre el
// inventario congelado (inventario/antes-423.json). «Después», el resolver de
// verdad (resolver.js) con lo que hay en la base. Una diferencia o la explica
// un cambio de `inventario/cambios-aprobados.js` o es un fallo: el script sale
// con código 1.
//
// Sin --simular abre la conexión en solo lectura. Usa DATABASE_URL.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };

const inv = await import('../src/modules/permissions/inventario/index.js');
const { perfilDesdeFilas } = await import('../src/modules/permissions/inventario/legado.js');
const { cambioPrevisto, CAMBIOS, CAMBIOS_POR_DATOS } = await import('../src/modules/permissions/inventario/cambios-aprobados.js');
const { resolverPermisos } = await import('../src/modules/permissions/resolver.js');

/** Todas las personas activas, con lo de antes (casillas, excepciones) y lo de ahora. */
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
  const hay197 = (await client.query(`SELECT to_regclass('public.role_permission_overrides') AS t`)).rows[0].t;
  const ajustes = hay197 ? (await client.query('SELECT role, resource, action, allowed FROM role_permission_overrides')).rows : [];
  return users.map((u) => perfilDesdeFilas(u, {
    customRole: roles.find((r) => r.id === u.custom_role_id) || null,
    excepciones: exc.filter((e) => e.user_id === u.id),
    ajustesRol: ajustes,
  }));
}

/** El mapa de ahora de una persona, con alguna parte deshecha para explicar diferencias. */
function mapaDeAhora(p, variante = null) {
  const custom = p.custom_role && variante === 'rolAMedidaActivo' ? { ...p.custom_role, active: true } : p.custom_role;
  return resolverPermisos({
    role: p.role,
    roles_extra: variante === 'sinRolesDeMas' ? [] : p.roles_extra,
    customRole: custom,
    excepciones: p.excepciones,
    ajustesRol: p.ajustesRol,
  }).mapa;
}

/**
 * Compara a todas las personas. Devuelve las diferencias, cada una con el
 * cambio aprobado que la explica (o ninguno).
 */
export async function comparar(client) {
  const filas = (await inv.construirInventario()).filter((f) => inv.ANTES.has(f.id));
  const personas = await leerPersonas(client);
  const diferencias = [];
  for (const p of personas) {
    const mapa = mapaDeAhora(p);
    const variantes = {};
    const despuesSin = (fila) => (v) => inv.puedeDespues(p, fila, (variantes[v] ||= mapaDeAhora(p, v)));
    for (const fila of filas) {
      const antes = inv.puedeAntes(p, fila);
      const despues = inv.puedeDespues(p, fila, mapa);
      if (antes === despues) continue;
      const porRol = [p.role, ...p.roles_extra].map((r) => cambioPrevisto(fila.id, r)).find(Boolean);
      const porDatos = porRol ? null : CAMBIOS_POR_DATOS.find((c) => c.explica({ persona: p, fila, antes, despues, despuesSin: despuesSin(fila) }));
      diferencias.push({ persona: p, fila, antes, despues, cambio: porRol || porDatos || null });
    }
  }
  return { personas, filas, diferencias, sinExplicar: diferencias.filter((d) => !d.cambio) };
}

function informe({ personas, filas, diferencias, sinExplicar }, detalle) {
  const L = [];
  L.push(`${personas.length} personas activas · ${filas.length} acciones · ${personas.length * filas.length} comprobaciones`);
  L.push(`${diferencias.length} diferencias · ${diferencias.length - sinExplicar.length} explicadas por un cambio aprobado · ${sinExplicar.length} SIN EXPLICAR`);
  L.push('');
  const porCambio = new Map();
  for (const d of diferencias) {
    const k = d.cambio?.id || '(sin explicar)';
    if (!porCambio.has(k)) porCambio.set(k, { gana: 0, pierde: 0, personas: new Set() });
    const x = porCambio.get(k);
    x[d.despues ? 'gana' : 'pierde'] += 1;
    x.personas.add(d.persona.email);
  }
  L.push('Por cambio:');
  for (const [k, x] of porCambio) {
    const c = [...CAMBIOS, ...CAMBIOS_POR_DATOS].find((y) => y.id === k);
    L.push(`  ${k}: ${x.personas.size} personas · ${x.gana} acciones de más · ${x.pierde} de menos${c ? ` — ${c.que}` : ''}`);
  }
  if (detalle || sinExplicar.length) {
    L.push('');
    L.push(detalle ? 'Cada diferencia:' : 'Las que no explica ningún cambio:');
    for (const d of detalle ? diferencias : sinExplicar) {
      L.push(`  ${d.persona.email} (${[d.persona.role, ...d.persona.roles_extra].join('+')}) · ${d.fila.id}: ${d.antes ? 'podía' : 'no podía'} → ${d.despues ? 'puede' : 'no puede'}${d.cambio ? `  [${d.cambio.id}]` : ''}`);
    }
  }
  return L.join('\n');
}

const sinTransaccion = (sql) => sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '');

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let codigo = 0;
  try {
    if (opcion('--simular')) {
      await client.query('BEGIN');
      for (const m of ['221_permisos_registro.sql', '222_permisos_casillas_a_excepciones.sql']) {
        await client.query(sinTransaccion(fs.readFileSync(path.resolve(aqui, '../migrations', m), 'utf8')));
      }
      console.log('(simulación: la 221 y la 222 aplicadas dentro de una transacción que se deshace al acabar)\n');
    } else {
      await client.query('BEGIN TRANSACTION READ ONLY');
    }
    if (opcion('--solo-antes')) {
      const filas = (await inv.construirInventario()).filter((f) => inv.ANTES.has(f.id));
      const personas = await leerPersonas(client);
      const m = {};
      console.log(`${personas.length} personas activas · ${filas.length} acciones\n`);
      for (const p of personas) {
        m[p.id] = Object.fromEntries(filas.map((f) => [f.id, inv.puedeAntes(p, f)]));
        console.log(`${String(p.id).padEnd(5)} ${[p.role, ...p.roles_extra].join('+').padEnd(16)} ${String(Object.values(m[p.id]).filter(Boolean).length).padStart(4)} acciones   ${p.email}`);
      }
      const guardar = opcion('--guardar');
      if (typeof guardar === 'string') fs.writeFileSync(guardar, JSON.stringify({ cuando: new Date().toISOString(), matriz: m }, null, 1));
    } else {
      const r = await comparar(client);
      console.log(informe(r, Boolean(opcion('--detalle'))));
      codigo = r.sinExplicar.length ? 1 : 0;
    }
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
  process.exit(codigo);
}
