// Recupera los prospectos que Make mandó y el CRM rechazó por «field_mapping
// vacío en modo active» (#627).
//
//   node --env-file=.env scripts/recuperar-make-627.mjs              ENSAYO: no escribe nada
//   node --env-file=.env scripts/recuperar-make-627.mjs --aplicar    crea y vincula
//
// Opciones:
//   --desde-fichero <ruta.json>   las entregas de un fichero en vez de la tabla
//                                 (para ensayar en otra base las de producción):
//                                 [{ id, webhook_id, project_id, received_at, payload, field_mapping }]
//   --entregas 801,802            solo esas entregas
//   --desde 2026-10-01            solo las recibidas desde ese día (por defecto
//                                 el 01/10/2026: las del #627; la única anterior,
//                                 de mayo, ya tiene ficha)
//
// Qué hace con cada entrega rechazada, de la más antigua a la más nueva:
//   · Saca los datos con el mapeo del webhook o, si sigue sin él, con los
//     nombres habituales de los campos (make.campos-habituales.js).
//   · Si ese correo ya tiene ficha en el campus desde ese día (desde 24 h antes
//     del envío en adelante), NO crea otra: deja una nota en esa ficha
//     («llegó también por Make el…») y la entrega queda apuntando a ella. Así se
//     tratan también los reenvíos de Make del mismo formulario minutos después.
//   · Si no, crea el prospecto por el ALTA NORMAL de Make
//     (createFromExternalWebhook): duplicados de antes vinculados con
//     lead_duplicado_de y a la cola de revisión, spam recurrente, producto, canal
//     por UTM y asignación —la asesora que mande Make o el turno del campus—.
//     Después le pone la fecha del envío original (created_at y
//     fecha_solicitud), la marca `custom_fields.recuperado_make` y una nota.
//   · Si la ficha de ese día existió pero alguien la BORRÓ (test, spam…), no la
//     recrea: la salta y lo dice.
//   · Una entrega ya recuperada (otra pasada del script) se salta.
//
// El ensayo abre la base en SOLO LECTURA (default_transaction_read_only): si
// algo intentara escribir, fallaría. La asignación del ensayo se calcula
// simulando el turno del campus; al aplicar la decide el alta normal, así que
// puede cambiar si entre medias entra otro prospecto o cambia el reparto.
//
// En producción, --aplicar exige RECUPERAR_EN_PRODUCCION=1 (lo decide Diego).

import fs from 'node:fs';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const valor = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const fichero = valor('--desde-fichero');
const soloEntregas = (valor('--entregas') || '').split(',').map((s) => parseInt(s, 10)).filter(Number.isFinite);
const desde = new Date(`${valor('--desde') || '2026-10-01'}T00:00:00+02:00`);
if (Number.isNaN(desde.getTime())) { console.error('--desde no es una fecha (AAAA-MM-DD)'); process.exit(1); }

const URL_BD = process.env.DATABASE_URL || '';
if (!URL_BD) { console.error('Falta DATABASE_URL (node --env-file=.env …)'); process.exit(1); }
if (aplicar && /crm_prod_db/.test(URL_BD) && process.env.RECUPERAR_EN_PRODUCCION !== '1') {
  console.error('\n  Es la base de PRODUCCIÓN. Para aplicar hace falta RECUPERAR_EN_PRODUCCION=1.\n');
  process.exit(1);
}
if (!aplicar) {
  // Antes de importar nada que abra el pool: la conexión entera, de solo lectura.
  const u = new URL(URL_BD);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  process.env.DATABASE_URL = u.toString();
}

const { query, default: pool } = await import('../src/shared/config/db.js');
const { applyMapping } = await import('../src/modules/make/make.service.js');
const { deducirMapeo, alcanzaParaCrear } = await import('../src/modules/make/make.campos-habituales.js');
const leadService = await import('../src/modules/leads/lead.service.js');
const leadModel = await import('../src/modules/leads/lead.model.js');
const { gestoresDelReparto } = await import('../src/modules/leads/reparto.js');
const { normalizePhone } = await import('../src/shared/utils/normalizePhone.js');

const MOTIVO = 'recuperado de Make, rechazado por falta de mapeo (#627)';
const fecha = (d) => new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
const tapar = (e) => {
  if (!e) return '—';
  const [u, d] = String(e).split('@');
  return `${u.slice(0, 1)}***@${d || ''}`;
};

async function entregas() {
  if (fichero) return JSON.parse(fs.readFileSync(fichero, 'utf8'));
  const { rows } = await query(
    `SELECT d.id, d.webhook_id, h.project_id, d.received_at, d.payload, h.field_mapping
       FROM make_webhook_deliveries d
       JOIN make_webhooks h ON h.id = d.webhook_id
      WHERE d.result = 'rejected'
        AND d.error_message = 'field_mapping vacío en modo active'
        AND d.lead_id IS NULL
      ORDER BY d.received_at, d.id`
  );
  return rows;
}

const campus = new Map();
async function campusDe(projectId) {
  if (!campus.has(projectId)) {
    const { rows } = await query(`SELECT id, nombre, active FROM projects WHERE id = $1`, [projectId]);
    campus.set(projectId, rows[0] || null);
  }
  return campus.get(projectId);
}

// El turno simulado del ensayo, por campus: { gestores, indice }.
const turnos = new Map();
async function siguienteDelTurno(projectId) {
  if (!turnos.has(projectId)) {
    const gestores = await gestoresDelReparto((s, p) => query(s, p), projectId);
    const { rows } = await query(`SELECT last_assigned_index FROM project_queue_state WHERE project_id = $1`, [projectId]);
    turnos.set(projectId, { gestores, indice: rows[0] ? Number(rows[0].last_assigned_index) : -1 });
  }
  const t = turnos.get(projectId);
  if (!t.gestores.length) return null;
  t.indice = (((t.indice + 1) % t.gestores.length) + t.gestores.length) % t.gestores.length;
  return t.gestores[t.indice];
}

async function nombreDe(userId) {
  if (!userId) return null;
  const { rows } = await query(`SELECT nombre FROM users WHERE id = $1`, [userId]);
  return rows[0]?.nombre || `#${userId}`;
}

/** La asesora que manda Make, si vale para ese campus (lo mismo que mira el alta). */
async function asesoraForzada(datos, projectId) {
  let u = null;
  if (datos.responsable_email) u = await leadModel.findUserByEmail(datos.responsable_email);
  if (!u && datos.responsable_nombre) u = await leadModel.findProjectUserByName(datos.responsable_nombre, projectId);
  if (!u) return null;
  const { rows } = await query(
    `SELECT u.id, u.nombre FROM users u
       JOIN user_projects up ON up.user_id = u.id AND up.project_id = $1 AND up.active = true
      WHERE u.id = $2 AND u.active = true AND u.role IN ('admin','gestor','superadmin')
        AND NOT COALESCE(u.gestor_colaboraciones, false)`,
    [projectId, u.id]
  );
  return rows[0] || null;
}

async function yaRecuperada(entregaId, projectId) {
  const { rows } = await query(
    `SELECT id FROM leads WHERE project_id = $1 AND custom_fields->'recuperado_make'->>'entrega_id' = $2 LIMIT 1`,
    [projectId, String(entregaId)]
  );
  return rows[0]?.id || null;
}

// También mira las BORRADAS: en producción, de las 27 entregas, la ficha de tres
// se había creado por el formulario directo y alguien la borró a propósito
// («test», «spam»). Recuperarlas sería resucitar lo que el equipo ya descartó.
async function fichaDesdeEseDia(email, projectId, recibido) {
  if (!email) return null;
  const { rows } = await query(
    `SELECT l.id, l.responsable_id, COALESCE(l.fecha_solicitud, l.created_at) AS desde,
            l.deleted_at, l.deleted_reason
       FROM leads l
      WHERE l.project_id = $1
        AND lower(l.email) = lower($2)
        AND COALESCE(l.fecha_solicitud, l.created_at) >= $3::timestamptz - INTERVAL '24 hours'
      ORDER BY (l.deleted_at IS NOT NULL), COALESCE(l.fecha_solicitud, l.created_at), l.id
      LIMIT 1`,
    [projectId, String(email).trim(), recibido]
  );
  return rows[0] || null;
}

async function productoDe(datos, projectId) {
  let p = null;
  if (datos.producto_interes) p = await leadModel.findProductByName(datos.producto_interes, projectId);
  if (!p && datos.landing_url) p = await leadModel.findProductByLandingSlug(datos.landing_url, projectId);
  return p || null;
}

const filas = [];
// En el ensayo no se escribe: las fichas que «crearía» se recuerdan aquí para
// que el reenvío del mismo formulario minutos después salga como VINCULA.
const creadasEnEnsayo = new Map();
const lista = (await entregas())
  .filter((e) => new Date(e.received_at) >= desde)
  .filter((e) => !soloEntregas.length || soloEntregas.includes(Number(e.id)))
  .sort((a, b) => new Date(a.received_at) - new Date(b.received_at) || a.id - b.id);

if (!aplicar) {
  const { rows } = await query('SHOW default_transaction_read_only');
  if (rows[0]?.default_transaction_read_only !== 'on') { console.error('El ensayo no ha quedado en solo lectura: paro.'); process.exit(1); }
}

console.log(`\n${aplicar ? 'APLICANDO' : 'ENSAYO (solo lectura)'} · ${lista.length} entregas · base ${new URL(URL_BD).pathname.slice(1)}\n`);

for (const e of lista) {
  const fila = { entrega: e.id, webhook: e.webhook_id, campus: null, fecha: fecha(e.received_at), correo: null, accion: null, lead: null, producto: null, asignada: null, nota: '' };
  filas.push(fila);
  try {
    const c = await campusDe(e.project_id);
    fila.campus = c ? `${c.nombre} (${c.id})` : `#${e.project_id}`;
    if (!c || !c.active) { fila.accion = 'SALTA'; fila.nota = 'el campus no existe o está inactivo en esta base'; continue; }

    const mapeo = e.field_mapping && Object.keys(e.field_mapping).length ? e.field_mapping : deducirMapeo(e.payload);
    const datos = applyMapping(e.payload, alcanzaParaCrear(mapeo) ? mapeo : deducirMapeo(e.payload));
    fila.correo = tapar(datos.email);
    if (!datos.email && !datos.nombre) { fila.accion = 'SALTA'; fila.nota = 'sin correo ni nombre'; continue; }

    const prod = await productoDe(datos, e.project_id);
    fila.producto = prod ? `#${prod.id}` : 'sin producto';

    const hecha = await yaRecuperada(e.id, e.project_id);
    if (hecha) { fila.accion = 'YA HECHA'; fila.lead = hecha; continue; }

    const clave = `${e.project_id}|${String(datos.email || '').trim().toLowerCase()}`;
    const previa = !aplicar && datos.email ? creadasEnEnsayo.get(clave) : null;
    // La misma ventana que fichaDesdeEseDia: desde 24 h antes del envío.
    const simulada = previa && new Date(e.received_at) - new Date(previa.desde) <= 24 * 3600 * 1000 ? previa : null;
    const existente = simulada || await fichaDesdeEseDia(datos.email, e.project_id, e.received_at);
    if (existente?.deleted_at) {
      fila.accion = 'SALTA';
      fila.lead = existente.id;
      fila.nota = `su ficha de ese día se borró el ${fecha(existente.deleted_at)} (${existente.deleted_reason || 'sin motivo'}): no se recrea`;
      continue;
    }
    if (existente) {
      fila.accion = 'VINCULA';
      fila.lead = existente.id;
      fila.asignada = existente.fila ? existente.fila.asignada : await nombreDe(existente.responsable_id);
      fila.nota = `ficha desde ${fecha(existente.desde)}`;
      if (aplicar) {
        await leadModel.createInteraction(existente.id, 'nota',
          `📥 Llegó también por Make el ${fecha(e.received_at)}${datos.producto_interes ? ` («${String(datos.producto_interes).slice(0, 150)}»)` : ''} y se rechazó por falta de mapeo; ${MOTIVO}. No se crea otra ficha.`,
          null, null);
        if (!fichero) await query(`UPDATE make_webhook_deliveries SET lead_id = $1 WHERE id = $2 AND lead_id IS NULL`, [existente.id, e.id]);
      }
      continue;
    }

    if (!aplicar) {
      fila.accion = 'CREA';
      if (datos.email) creadasEnEnsayo.set(clave, { id: `nueva (entrega ${e.id})`, responsable_id: null, desde: e.received_at, fila });
      const dup = await leadModel.findDuplicateByEmailOrPhone(datos.email, normalizePhone(datos.telefono), e.project_id, null);
      if (dup) fila.nota = `duplicado de #${dup.id} (anterior)`;
      const forzada = await asesoraForzada(datos, e.project_id);
      if (forzada) { fila.asignada = `${forzada.nombre} (la manda Make)`; continue; }
      const g = await siguienteDelTurno(e.project_id);
      fila.asignada = g ? `${g.nombre} (turno)` : 'nadie (sin gestoras en el reparto)';
      continue;
    }

    const r = await leadService.createFromExternalWebhook(e.project_id, {
      ...datos,
      custom_fields: {
        ...(datos.custom_fields || {}),
        recuperado_make: { entrega_id: e.id, webhook_id: e.webhook_id, recibido: e.received_at, motivo: MOTIVO },
      },
    }, { source: `make-recuperado:${e.webhook_id}` });
    fila.accion = r.burst_merged ? 'VINCULA' : 'CREA';
    fila.lead = r.lead_id;
    fila.asignada = await nombreDe(r.responsable_id);
    if (r.duplicado) fila.nota = `duplicado de #${r.duplicado_de}`;
    if (!r.burst_merged) {
      await query(
        `UPDATE leads SET created_at = $2::timestamptz, fecha_solicitud = $2::timestamptz WHERE id = $1`,
        [r.lead_id, e.received_at]
      );
      await leadModel.createInteraction(r.lead_id, 'nota',
        `📥 Prospecto ${MOTIVO}. El formulario llegó el ${fecha(e.received_at)} y no entró; se ha dado de alta el ${fecha(new Date())} con su fecha original.`,
        null, null);
    }
    if (!fichero) await query(`UPDATE make_webhook_deliveries SET lead_id = $1 WHERE id = $2 AND lead_id IS NULL`, [r.lead_id, e.id]);
  } catch (err) {
    fila.accion = 'ERROR';
    fila.nota = err.message;
  }
}

console.table(filas.map((f) => ({
  entrega: f.entrega, webhook: f.webhook, campus: f.campus, fecha: f.fecha, correo: f.correo,
  accion: f.accion, lead: f.lead ?? '', producto: f.producto ?? '', asignada: f.asignada ?? '', nota: f.nota,
})));

const resumen = {};
for (const f of filas) {
  const k = `${f.campus} · ${f.accion}`;
  resumen[k] = (resumen[k] || 0) + 1;
}
console.log('\nResumen:');
for (const [k, n] of Object.entries(resumen)) console.log(`  ${k}: ${n}`);
console.log(aplicar ? '\nHecho.' : '\nEnsayo: no se ha escrito nada. Para aplicar: --aplicar');

// Las notas, avisos y secuencias del alta van sin esperar: margen antes de cerrar.
await new Promise((r) => setTimeout(r, aplicar ? 3000 : 0));
await pool.end();
process.exit(0);
