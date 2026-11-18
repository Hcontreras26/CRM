// Los avisos de Certifex que entraron en el CRM equivocado (#630).
//
// Del 19/10 al 01/11/2026 Certifex mandaba TODOS sus avisos al 360, también los de
// ISEIE (solicitudes de diploma y «ha terminado la formación»): 27 de «terminado»
// quedaron en certifex_solicitudes del 360. Desde Certifex#103 (migración 0037) cada
// CRM recibe los de sus centros, y el 360 ya rechaza los de un campus que no es suyo.
// Certifex no los va a reenviar (el 360 contestó 2xx y los dio por avisados), así
// que se copian a mano. Los alumnos ya salen en «Terminaron sin pedir» de ISEIE (esa
// lista la da Certifex); lo que falta allí es el aviso: cuándo terminó, la nota y
// cuándo llegó.
//
// Tres pasos, cada uno contra SU base (DATABASE_URL):
//
//   1. En el 360, sacarlos a un fichero (SIEMPRE solo lectura):
//        node --env-file=.env scripts/avisos-de-otro-crm-630.mjs sacar --a-fichero avisos-630.json
//   2. En ISEIE, meterlos (ensayo; para escribir, --aplicar y el fichero de lo hecho):
//        DATABASE_URL=<la de ISEIE> node scripts/avisos-de-otro-crm-630.mjs meter --desde-fichero avisos-630.json
//        DATABASE_URL=<la de ISEIE> node scripts/avisos-de-otro-crm-630.mjs meter --desde-fichero avisos-630.json --aplicar --a-fichero metidos-630.json
//   3. En el 360, quitar SOLO lo que ya está en ISEIE (ensayo; para escribir, --aplicar):
//        DATABASE_URL_DESTINO=<la de ISEIE> node --env-file=.env scripts/avisos-de-otro-crm-630.mjs borrar --desde-fichero metidos-630.json
//
// «borrar» solo acepta el fichero que deja «meter --aplicar» (las matrículas que han
// quedado en la base de destino) y solo en la base de donde se sacaron: lo que «meter»
// saltó (un campus de prueba del 360, por ejemplo) o dio error, no se borra. Y no se fía
// del fichero: abre la base de destino (DATABASE_URL_DESTINO, en solo lectura), comprueba
// que es la que dice el fichero y solo borra una matrícula si está allí con el mismo
// campus. Quita la fila y también las campanas que dejó ese aviso en el 360 («Terminó
// sin pedir el diploma: …»), que es lo que se veía desde el admin.
// Los ficheros llevan nombres y correos de alumnos (están en .gitignore): bórralos al acabar.
//
// Qué se copia: lo que dijo Certifex (matrícula, campus, curso, nombres, correo,
// solicitud y «terminado»). Qué NO: lo que es propio del 360 (lead_id y producto_id
// son ids de SU base; la firma vive en SU almacenamiento; la edición y el aviso de
// rechazo los hizo su equipo). Si una fila trae algo de eso, sale marcada
// «tocada en esta base» y «borrar» NO la quita (ni sus campanas): alguien tiene que
// mirarla antes. Para borrarla igual, --tambien-tocadas.
//
// «meter» no pisa nada: si la matrícula ya está en ese CRM, solo rellena lo que allí
// está vacío. La ficha del alumno se busca por su correo en ESA base.
//
// La campana en ISEIE la decide Diego: por defecto NO suena (son avisos de hace días y
// los alumnos ya están en su lista). Con --con-campana, cada aviso que entra nuevo
// suena a quien le habría sonado si hubiera llegado bien (super admin y los admin de
// ese campus), con el texto de siempre y una nota con la fecha en que llegó al otro
// CRM. Sale con la fecha de hoy para que se vea arriba en la campana. Si el alumno ya
// pidió el diploma, solo suena la solicitud (Certifex tampoco avisa de «terminado» a
// quien ya lo pidió). El enlace es el de ISEIE si la base es crm_iseie; si no, el del
// 360 (o el que se diga con --enlace-diplomas). No repite una campana que ya esté.
//
// Antes de nada, «sacar» comprueba que los campus que Certifex manda al 360 (su
// migración 0037) casan con un proyecto de esta base: uno que no case vería rechazados
// sus avisos desde la #630 aunque no tenga filas aquí. Otra lista: --centros A,B,C.
// Cada paso solo toca campus de su lado: «meter» salta los que no son de ese CRM y
// «borrar» los que sí lo son. Se puede repetir: lo ya hecho no cambia.
//
// El ensayo abre la base en SOLO LECTURA (default_transaction_read_only).
// En producción (crm_prod_db, crm_iseie), --aplicar exige RECUPERAR_EN_PRODUCCION=1
// (lo decide Diego). Qué base es lo dice la propia base (current_database()), no la URL.
// Las filas sin campus son de esta base (avisos de rechazo): «sacar» no las saca.
// Sin correo, «meter» no busca ficha.

import fs from 'node:fs';

const args = process.argv.slice(2);
const paso = args[0];
const aplicar = args.includes('--aplicar') && paso !== 'sacar';
const valor = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const aFichero = valor('--a-fichero');
const desdeFichero = valor('--desde-fichero');
const conCampana = args.includes('--con-campana') && paso === 'meter';
const tambienTocadas = args.includes('--tambien-tocadas') && paso === 'borrar';
// Los campus que Certifex manda al 360 (Certifex, migración 0037_avisos_por_integracion).
const CENTROS_DEL_360 = (valor('--centros') || 'PSIKO,ISEIH,FONO,ISAEG,ISSLOGG,ISECD,ISEF,ACADEMIAIA')
  .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

if (!['sacar', 'meter', 'borrar'].includes(paso)) {
  console.error('Uso: sacar --a-fichero <ruta.json> [--centros A,B] | meter --desde-fichero <ruta.json> [--aplicar --a-fichero <metidos.json>] [--con-campana] [--enlace-diplomas <ruta>] | borrar --desde-fichero <metidos.json> [--aplicar] [--tambien-tocadas]');
  process.exit(1);
}
if (paso === 'sacar' && !aFichero) { console.error('sacar: falta --a-fichero <ruta.json>'); process.exit(1); }
if (paso !== 'sacar' && !desdeFichero) { console.error(`${paso}: falta --desde-fichero <ruta.json>`); process.exit(1); }
if (paso === 'meter' && aplicar && !aFichero) {
  console.error('meter --aplicar: falta --a-fichero <metidos.json> (lo que quede en esta base; es lo único que «borrar» quitará del origen)');
  process.exit(1);
}
if (aFichero && desdeFichero && aFichero === desdeFichero) {
  console.error('--a-fichero y --desde-fichero no pueden ser el mismo fichero: se perdería el de entrada');
  process.exit(1);
}

const URL_BD = process.env.DATABASE_URL || '';
if (!URL_BD) { console.error('Falta DATABASE_URL (node --env-file=.env …)'); process.exit(1); }
const PRODUCCION = ['crm_prod_db', 'crm_iseie'];
const candado = (nombre) => {
  if (!(aplicar && PRODUCCION.includes(nombre) && process.env.RECUPERAR_EN_PRODUCCION !== '1')) return null;
  return `\n  ${nombre} es PRODUCCIÓN. Para aplicar hace falta RECUPERAR_EN_PRODUCCION=1.\n`;
};
// Primero por el nombre que trae la URL, para parar sin conectar. No basta (la URL
// puede escribir la base de otra forma: %5F, barra final, ?db=, PGDATABASE…): la
// palabra final la tiene current_database(), ya conectados y antes de leer nada.
const enUrl = (() => {
  try { return decodeURIComponent(new URL(URL_BD).pathname.replace(/^\/+|\/+$/g, '')).toLowerCase(); } catch { return ''; }
})();
if (candado(enUrl)) { console.error(candado(enUrl)); process.exit(1); }
if (!aplicar) {
  // Antes de importar nada que abra el pool: la conexión entera, de solo lectura.
  const u = new URL(URL_BD);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  process.env.DATABASE_URL = u.toString();
}

const { query, default: pool } = await import('../src/shared/config/db.js');
const { proyectosDeCentro } = await import('../src/modules/certifex/certifex.programa.js');
const { idsAdministracionDeCentro } = await import('../src/modules/certifex/certifex.model.js');

let destino = null; // la base donde se metieron (solo «borrar»), de solo lectura
const parar = async (msg) => {
  console.error(msg);
  await pool.end();
  if (destino) await destino.end();
  process.exit(1);
};

const { rows: [{ base }] } = await query('SELECT current_database() AS base');
if (candado(base)) await parar(candado(base));
if (!aplicar) {
  const { rows } = await query('SHOW default_transaction_read_only');
  if (rows[0]?.default_transaction_read_only !== 'on') await parar('El ensayo no ha quedado en solo lectura: paro.');
}

// Donde está Diplomas en el frontal de cada CRM (ISEIE no tiene el «/clientes»).
const RUTA_DIPLOMAS = valor('--enlace-diplomas') || (base === 'crm_iseie' ? '/matriculas/diplomas' : '/clientes/matriculas/diplomas');
// Git Bash de Windows convierte «/matriculas/…» en «C:/Program Files/Git/matriculas/…»:
// un enlace así no lleva a ningún sitio, así que se para antes.
if (!/^\/[a-z0-9/_-]+$/i.test(RUTA_DIPLOMAS)) {
  await parar(`--enlace-diplomas tiene que ser una ruta del CRM, como /matriculas/diplomas (llegó «${RUTA_DIPLOMAS}»; en Git Bash usa MSYS_NO_PATHCONV=1).`);
}

// El mismo campus escrito de otra forma («iseih», «ISEIH»): sí; otro campus: no.
const campusCompacto = (c) => String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const mismoCampus = (a, b) => campusCompacto(a) === campusCompacto(b);

// La misma regla que las entradas de Certifex (esCentroDeEsteCrm): un campus es de
// este CRM si casa con algún proyecto que no sea de prueba.
const { rows: proyectos } = await query(`SELECT id, nombre, slug FROM projects WHERE NOT COALESCE(es_prueba, false)`);
const esDeEsteCrm = (centro) => proyectosDeCentro(centro, proyectos).length > 0;

// Lo que dijo Certifex: se copia. El resto es del CRM que lo recibió.
const COPIABLES = ['centro', 'curso_ref', 'curso_nombre', 'nombre_diploma', 'nombre_moodle', 'email',
  'solicitada_en', 'veces', 'recibida_en', 'completado_en', 'completado_nota', 'completado_recibido_en'];
const PROPIOS = ['email_crm', 'producto_id', 'programa_editado', 'editado_en', 'aviso_rechazo_en', 'firma_key'];

const fecha = (d) => (d ? new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) : '');
const tapar = (e) => {
  if (!e) return '—';
  const [u, d] = String(e).split('@');
  return `${u.slice(0, 1)}***@${d || ''}`;
};
const tocadaAqui = (r) => PROPIOS.filter((c) => r[c] != null);
// Cada paso solo acepta el fichero del paso anterior, y en la base que toca.
const leer = () => {
  const d = JSON.parse(fs.readFileSync(desdeFichero, 'utf8'));
  const espera = paso === 'meter' ? 'sacar' : 'meter';
  if (d.paso !== espera || !Array.isArray(d.avisos)) {
    throw new Error(`${desdeFichero} no es el fichero de «${espera}»: «${paso}» va después de «${espera}»`);
  }
  if (paso === 'meter' && d.origen === base) throw new Error(`se sacaron de ${base}: hay que meterlos en la OTRA base`);
  if (paso === 'borrar' && d.origen !== base) throw new Error(`se sacaron de ${d.origen}: «borrar» va en esa base, no en ${base}`);
  if (paso === 'borrar' && (!d.destino || d.destino === base)) throw new Error('el fichero no dice en qué otra base se metieron');
  // En producción, lo del 360 solo se borra si se metió en la de ISEIE de producción.
  if (paso === 'borrar' && base === 'crm_prod_db' && d.destino !== 'crm_iseie') {
    throw new Error(`se metieron en ${d.destino}, no en crm_iseie: no se borra nada de producción`);
  }
  return d;
};

// Si el fichero no es el que toca, se para antes de escribir nada.
let entrada = null;
if (paso !== 'sacar') {
  try {
    entrada = leer();
  } catch (e) {
    await parar(`\n  ${e.message}\n`);
  }
}

// «borrar» no se fía del fichero: cada matrícula se mira en la base donde se metió
// (DATABASE_URL_DESTINO, en solo lectura), y solo se borra aquí si está allí, con el
// mismo campus. El fichero solo dice qué mirar.
if (paso === 'borrar') {
  const urlDestino = process.env.DATABASE_URL_DESTINO || '';
  if (!urlDestino) {
    await parar(`\n  borrar: falta DATABASE_URL_DESTINO, la base donde se metieron (${entrada.destino}). Se abre en solo lectura: solo se borra aquí lo que esté allí.\n`);
  }
  let u;
  try { u = new URL(urlDestino); } catch {
    await parar('\n  DATABASE_URL_DESTINO no es una URL de Postgres (postgresql://usuario:clave@servidor:puerto/base): no se borra nada.\n');
  }
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  const { default: pg } = await import('pg');
  destino = new pg.Pool({ connectionString: u.toString(), max: 1 });
  try {
    const { rows: [{ nombre }] } = await destino.query('SELECT current_database() AS nombre');
    if (nombre !== entrada.destino) {
      await parar(`\n  DATABASE_URL_DESTINO es ${nombre}, pero el fichero dice que se metieron en ${entrada.destino}: no se borra nada.\n`);
    }
    if (nombre === base) await parar('\n  DATABASE_URL_DESTINO es esta misma base: no se borra nada.\n');
  } catch (e) {
    await parar(`\n  No se puede leer la base de destino: ${e.message}\n`);
  }
}

const filas = [];
console.log(`\n${paso.toUpperCase()} · ${aplicar ? 'APLICANDO' : 'ENSAYO (solo lectura)'} · base ${base}\n`);

if (paso === 'sacar') {
  // Comprobación previa: los campus que Certifex manda aquí, ¿casan todos?
  const noCasan = CENTROS_DEL_360.filter((c) => !esDeEsteCrm(c));
  console.log(`Campus que Certifex manda a esta base: ${CENTROS_DEL_360.join(', ')}`);
  console.log(noCasan.length
    ? `  ⚠ NO casan con ningún proyecto de esta base: ${noCasan.join(', ')}. Desde la #630 sus avisos se RECHAZARÍAN. Revísalo antes de fusionar.\n`
    : '  ✓ Todos casan con un proyecto de esta base.\n');
  const { rows } = await query(`SELECT * FROM certifex_solicitudes ORDER BY recibida_en, matricula_id`);
  // Sin campus no es «de otro CRM»: son filas de esta base (las crea, por ejemplo, el
  // aviso de rechazo, registrarAvisosRechazo). No se sacan ni viajan en el fichero.
  const sinCampus = rows.filter((r) => !campusCompacto(r.centro));
  if (sinCampus.length) console.log(`${sinCampus.length} filas sin campus: son de esta base y no se sacan.`);
  const ajenos = rows.filter((r) => campusCompacto(r.centro) && !esDeEsteCrm(r.centro));
  const avisos = ajenos.map((r) => ({
    matricula_id: Number(r.matricula_id),
    ...Object.fromEntries(COPIABLES.map((c) => [c, r[c] ?? null])),
    tocada_en_origen: tocadaAqui(r),
  }));
  fs.writeFileSync(aFichero, JSON.stringify({ paso: 'sacar', origen: base, sacado_en: new Date().toISOString(), avisos }, null, 2));
  for (const a of avisos) {
    filas.push({
      matricula: a.matricula_id, campus: a.centro, correo: tapar(a.email),
      terminado: fecha(a.completado_recibido_en), solicitud: fecha(a.solicitada_en),
      campanas: (await campanasAjenas(a.matricula_id)).length,
      nota: a.tocada_en_origen.length ? `tocada en esta base: ${a.tocada_en_origen.join(', ')}` : '',
    });
  }
  console.log(`${avisos.length} avisos de campus que no son de esta base → ${aFichero}`);
}

// La campana de un aviso movido (--con-campana): la misma que habría puesto la entrada
// de Certifex al llegar (certifex.controller.js), con su fecha y una nota. Devuelve
// cuántas pone (o pondría, en el ensayo). No repite una que ya esté en esta base.
async function sonarAqui(a, nuevos, leadId) {
  const curso = a.curso_nombre ? ` · ${a.curso_nombre}` : '';
  const sinFicha = leadId ? '' : ' Su correo no está en el CRM.';
  const tipos = [];
  if (nuevos.terminado) {
    tipos.push({
      type: 'certifex_completado', llego: a.completado_recibido_en,
      title: `Terminó sin pedir el diploma: ${a.nombre_moodle || a.email || 'Un alumno'}`,
      cuerpo: `${a.centro}${curso}. Moodle da la formación por terminada y aún no ha pedido su diploma.${sinFicha}`,
      link_path: `${RUTA_DIPLOMAS}?pestana=terminados`,
    });
  }
  if (nuevos.solicitud) {
    const quien = a.nombre_diploma || a.nombre_moodle || 'Un alumno';
    const nombre = a.nombre_diploma ? `Nombre para el diploma: «${a.nombre_diploma}».` : 'Sin nombre para el diploma: revísalo antes de aprobar.';
    tipos.push({
      type: 'certifex_solicitud', llego: a.solicitada_en,
      title: `Diploma: ${quien} lo pide`,
      cuerpo: `${a.centro}${curso}. ${nombre}${sinFicha}`,
      link_path: RUTA_DIPLOMAS,
    });
  }
  let n = 0;
  for (const t of tipos) {
    const { rows: [hay] } = await query(
      `SELECT 1 FROM admin_notifications WHERE type = $1 AND metadata->>'matriculaId' = $2 LIMIT 1`, [t.type, String(a.matricula_id)]);
    if (hay) continue;
    // Sin destinatarios sería una campana para todos: no.
    const ids = await idsAdministracionDeCentro(a.centro);
    if (!ids.length) continue;
    n++;
    if (!aplicar) continue;
    // Con la fecha de hoy, para que se vea arriba; la del aviso, en el texto.
    const nota = ` Llegó el ${fecha(t.llego)} al otro CRM por error; se ha traído aquí (#630).`;
    await query(
      `INSERT INTO admin_notifications (type, title, message, link_path, metadata, target_user_ids)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [t.type, t.title.slice(0, 255), `${t.cuerpo}${nota}`.slice(0, 300), t.link_path,
        { matriculaId: Number(a.matricula_id), centro: a.centro, leadId, movidoDeOtroCrm: true, llegoAlOtroCrm: t.llego ?? null }, ids],
    );
  }
  return n;
}

if (paso === 'meter') {
  // Lo que queda en esta base (creado, completado o que ya estaba): lo único que
  // «borrar» podrá quitar del origen.
  const metidos = [];
  for (const a of entrada.avisos) {
    const fila = { matricula: a.matricula_id, campus: a.centro, correo: tapar(a.email), accion: null, rellena: '', ficha: '', ...(conCampana ? { campanas: 0 } : {}) };
    filas.push(fila);
    try {
      if (!esDeEsteCrm(a.centro)) { fila.accion = 'SALTA'; fila.rellena = 'el campus tampoco es de esta base'; continue; }
      const { rows: [ya] } = await query(`SELECT * FROM certifex_solicitudes WHERE matricula_id = $1`, [a.matricula_id]);
      // La misma matrícula con otro campus aquí: no es el mismo aviso. No se toca, y
      // como no queda en el fichero de lo hecho, «borrar» tampoco quita el original.
      if (ya && campusCompacto(ya.centro) && !mismoCampus(ya.centro, a.centro)) {
        fila.accion = 'OTRO CAMPUS';
        fila.rellena = `aquí la matrícula es de ${ya.centro}: no se toca`;
        continue;
      }
      // Sin correo no hay a quién buscar: con '' casaría con cualquier ficha sin correo.
      const email = String(a.email || '').trim();
      const lead = email ? (await query(
        `SELECT l.id FROM leads l
          WHERE l.deleted_at IS NULL AND lower(l.email) = lower($1)
            AND l.project_id NOT IN (SELECT id FROM projects WHERE es_prueba)
          ORDER BY l.id DESC LIMIT 1`,
        [email],
      )).rows[0] : null;
      // Lo que este aviso trae de nuevo a esta base (para la campana, si se pide).
      const nuevos = conCampana ? {
        // Como Certifex: no se avisa de «terminado» a quien ya pidió el diploma.
        terminado: !ya?.completado_recibido_en && !!a.completado_recibido_en && !a.solicitada_en && !ya?.solicitada_en,
        solicitud: !ya?.solicitada_en && !!a.solicitada_en,
      } : null;
      const sonar = async () => { if (nuevos) fila.campanas = await sonarAqui(a, nuevos, lead?.id ?? ya?.lead_id ?? null); };
      if (!ya) {
        fila.accion = 'CREA';
        fila.ficha = lead ? `#${lead.id}` : 'sin ficha';
        if (aplicar) {
          await query(
            `INSERT INTO certifex_solicitudes (matricula_id, ${COPIABLES.join(', ')}, lead_id)
             VALUES ($1, ${COPIABLES.map((_, i) => `$${i + 2}`).join(', ')}, $${COPIABLES.length + 2})
             ON CONFLICT (matricula_id) DO NOTHING`,
            [a.matricula_id, ...COPIABLES.map((c) => (c === 'veces' ? (a.veces ?? 1) : c === 'recibida_en' ? (a.recibida_en ?? new Date().toISOString()) : a[c])), lead?.id ?? null],
          );
        }
        metidos.push(a);
        await sonar();
        continue;
      }
      // Ya está: solo lo vacío. veces y recibida_en nunca están vacíos (NOT NULL).
      const vacias = COPIABLES.filter((c) => !['veces', 'recibida_en'].includes(c) && ya[c] == null && a[c] != null);
      const sinFicha = ya.lead_id == null && lead;
      if (!vacias.length && !sinFicha) { fila.accion = 'YA ESTABA'; metidos.push(a); continue; }
      fila.accion = 'COMPLETA';
      fila.rellena = [...vacias, ...(sinFicha ? ['lead_id'] : [])].join(', ');
      fila.ficha = ya.lead_id ? `#${ya.lead_id}` : lead ? `#${lead.id}` : 'sin ficha';
      if (aplicar) {
        await query(
          `UPDATE certifex_solicitudes SET
             ${vacias.map((c, i) => `${c} = COALESCE(${c}, $${i + 2})`).join(', ')}${vacias.length ? ',' : ''}
             lead_id = COALESCE(lead_id, $${vacias.length + 2}),
             updated_at = NOW()
           WHERE matricula_id = $1`,
          [a.matricula_id, ...vacias.map((c) => a[c]), lead?.id ?? null],
        );
      }
      metidos.push(a);
      await sonar();
    } catch (err) {
      fila.accion = 'ERROR';
      fila.rellena = err.message;
    }
  }
  if (aplicar) {
    fs.writeFileSync(aFichero, JSON.stringify({
      paso: 'meter', origen: entrada.origen, destino: base, metido_en: new Date().toISOString(),
      avisos: metidos.map((a) => ({ matricula_id: a.matricula_id, centro: a.centro, email: a.email })),
    }, null, 2));
    console.log(`${metidos.length} quedan en ${base} → ${aFichero} (para «borrar» en ${entrada.origen})`);
  }
}

// Las campanas que dejó cada aviso aquí («Terminó sin pedir el diploma: …», «Diploma:
// … lo pide»): es lo que se veía desde el admin. Solo las de un campus que no es de
// esta base, por el campus que guardó la propia campana.
async function campanasAjenas(matriculaId) {
  const { rows } = await query(
    `SELECT id, metadata->>'centro' AS centro FROM admin_notifications
      WHERE type IN ('certifex_completado', 'certifex_solicitud') AND metadata->>'matriculaId' = $1`,
    [String(matriculaId)],
  );
  return rows.filter((n) => !esDeEsteCrm(n.centro)).map((n) => n.id);
}

if (paso === 'borrar') {
  for (const a of entrada.avisos) {
    const fila = { matricula: a.matricula_id, campus: a.centro, correo: tapar(a.email), accion: null, campanas: 0, nota: '' };
    filas.push(fila);
    try {
      const { rows: [r] } = await query(`SELECT * FROM certifex_solicitudes WHERE matricula_id = $1`, [a.matricula_id]);
      // Lo que manda es el campus que hay EN ESTA BASE, no el del fichero.
      if (r && esDeEsteCrm(r.centro)) { fila.accion = 'SALTA'; fila.nota = `el campus ${r.centro} es de esta base`; continue; }
      // Que esté de verdad en la otra base, y con el mismo campus.
      const { rows: [alli] } = await destino.query(`SELECT centro FROM certifex_solicitudes WHERE matricula_id = $1`, [a.matricula_id]);
      if (!alli) { fila.accion = 'NO ESTÁ ALLÍ'; fila.nota = `no está en ${entrada.destino}: no se borra`; continue; }
      if (!mismoCampus(alli.centro, r?.centro ?? a.centro)) {
        fila.accion = 'OTRO CAMPUS';
        fila.nota = `en ${entrada.destino} es de ${alli.centro || 'ningún campus'}: no se borra`;
        continue;
      }
      // Tocada aquí (firma, edición, aviso de rechazo): no se pierde sin que alguien la mire.
      const tocada = r ? tocadaAqui(r) : [];
      if (tocada.length && !tambienTocadas) {
        fila.accion = 'SE QUEDA';
        fila.nota = `tocada en esta base: ${tocada.join(', ')} (mírala; para borrarla igual, --tambien-tocadas)`;
        continue;
      }
      const campanas = await campanasAjenas(a.matricula_id);
      fila.campanas = campanas.length;
      if (aplicar && campanas.length) await query(`DELETE FROM admin_notifications WHERE id = ANY($1::int[])`, [campanas]);
      if (!r) { fila.accion = 'YA NO ESTÁ'; continue; }
      fila.accion = 'BORRA';
      if (tocada.length) fila.nota = `tocada en esta base: ${tocada.join(', ')} (--tambien-tocadas)`;
      if (aplicar) await query(`DELETE FROM certifex_solicitudes WHERE matricula_id = $1`, [a.matricula_id]);
    } catch (err) {
      fila.accion = 'ERROR';
      fila.nota = err.message;
    }
  }
}

if (filas.length) console.table(filas);
if (paso !== 'sacar') {
  const resumen = {};
  for (const f of filas) resumen[f.accion] = (resumen[f.accion] || 0) + 1;
  console.log('\nResumen:');
  for (const [k, n] of Object.entries(resumen)) console.log(`  ${k}: ${n}`);
  if (resumen.ERROR) {
    // No se da por terminado: quien lo lance tiene que ver que algo falló (sale con 1).
    console.error(`\n  ${resumen.ERROR} con ERROR (mira la tabla). ${aplicar ? 'El resto sí se ha aplicado; se puede repetir.' : 'Ensayo: no se ha escrito nada.'}\n`);
  } else {
    console.log(aplicar ? '\nHecho.' : '\nEnsayo: no se ha escrito nada. Para aplicar: --aplicar');
  }
}

await pool.end();
if (destino) await destino.end();
process.exit(filas.some((f) => f.accion === 'ERROR') ? 1 : 0);
