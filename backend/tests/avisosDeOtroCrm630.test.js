// scripts/avisos-de-otro-crm-630.mjs: los avisos de Certifex que entraron en el CRM
// equivocado (#630). En producción va de una base (el 360) a otra (ISEIE); aquí, con
// una sola base, «el otro CRM» es un campus sin proyecto (ZAJENA630) y «este» uno con
// proyecto creado para la prueba (ZPROPIA630). Los ficheros entre pasos se escriben a
// mano cuando hace falta fingir que vienen de la otra base.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import pool from '../src/shared/config/db.js';
import { proyectosDeCentro } from '../src/modules/certifex/certifex.programa.js';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'avisos-de-otro-crm-630.mjs');
const dir = mkdtempSync(join(tmpdir(), 'avisos630-'));
const base = 630_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
const correo = `alumna.630.${base}@prueba.test`;
const BASE_AQUI = new URL(process.env.DATABASE_URL).pathname.slice(1);
const en = (nombre) => { const u = new URL(process.env.DATABASE_URL); u.pathname = `/${nombre}`; return u.toString(); };
// «borrar» mira cada matrícula en la base donde se metió: aquí, una base aparte con
// solo la tabla de avisos, que hace de «la otra base».
const DESTINO = `crm_630_destino_${base}`;
let poolDestino;

// El script corre como lo correría Diego: un node limpio, sin lo que vitest deja en el
// entorno (NODE_OPTIONS, VITEST_*).
const entorno = (extra = {}) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_OPTIONS' && !k.startsWith('VITEST'))),
  LOG_LEVEL: 'silent',
  ...extra,
});
const correr = (args, extra) => spawnSync(process.execPath, [SCRIPT, ...args], {
  env: entorno(extra), encoding: 'utf8', cwd: resolve(dirname(SCRIPT), '..'),
});
const escribir = (nombre, datos) => { const f = join(dir, nombre); writeFileSync(f, JSON.stringify(datos)); return f; };
const leerJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const fila = async (id) => (await pool.query('SELECT * FROM certifex_solicitudes WHERE matricula_id = $1', [id])).rows[0];
const insertar = (id, centro, extra = {}) => pool.query(
  `INSERT INTO certifex_solicitudes (matricula_id, centro, curso_ref, curso_nombre, nombre_moodle, email,
     completado_en, completado_nota, completado_recibido_en, recibida_en, email_crm, firma_key)
   VALUES ($1, $2, 12, 'Máster en Prueba', 'Alumna 630', $3, '2026-10-20T08:00:00Z', 8.5, '2026-10-20T08:01:00Z',
     '2026-10-20T08:01:00Z', $4, $5)`,
  [id, centro, extra.email ?? correo, extra.email_crm ?? null, extra.firma_key ?? null],
);

let proyecto;
let lead;
let leadSinCorreo;
let adminDelCampus;
beforeAll(async () => {
  await pool.query(`CREATE DATABASE ${DESTINO}`);
  poolDestino = new pg.Pool({ connectionString: en(DESTINO), max: 1 });
  await poolDestino.query('CREATE TABLE certifex_solicitudes (matricula_id BIGINT PRIMARY KEY, centro TEXT)');
  proyecto = (await pool.query(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ('Zpropia630', $1, 'whk_test') RETURNING id`, [`zpropia630-${base}`])).rows[0].id;
  // Un admin activo con este campus: la campana de un aviso movido tiene que llegarle.
  adminDelCampus = (await pool.query(`SELECT id FROM users WHERE active AND role = 'admin' ORDER BY id LIMIT 1`)).rows[0].id;
  await pool.query(`INSERT INTO user_projects (user_id, project_id, active) VALUES ($1, $2, true)`, [adminDelCampus, proyecto]);
  lead = (await pool.query(
    `INSERT INTO leads (project_id, nombre, email) VALUES ($1, 'Alumna 630', $2) RETURNING id`, [proyecto, correo.toUpperCase()])).rows[0].id;
  await insertar(base, 'ZAJENA630');
  await insertar(base + 1, 'ZAJENA630', { email_crm: 'otra@prueba.test', firma_key: 'firmas/x.png' });
  await insertar(base + 2, 'ZPROPIA630');
  // Sin campus: una fila de esta base (como las del aviso de rechazo), no de otro CRM.
  await insertar(base + 10, null);
  // Una ficha con el correo vacío: un aviso sin correo no se puede enlazar con ella.
  leadSinCorreo = (await pool.query(
    `INSERT INTO leads (project_id, nombre, email) VALUES ($1, 'Sin correo 630', '') RETURNING id`, [proyecto])).rows[0].id;
});
afterAll(async () => {
  await pool.query('DELETE FROM certifex_solicitudes WHERE matricula_id >= $1 AND matricula_id < $2', [base, base + 20]);
  await pool.query('DELETE FROM leads WHERE id = ANY($1::int[])', [[lead, leadSinCorreo]]);
  await poolDestino?.end();
  await pool.query(`DROP DATABASE IF EXISTS ${DESTINO} WITH (FORCE)`);
  await pool.query('DELETE FROM user_projects WHERE project_id = $1', [proyecto]);
  await pool.query('DELETE FROM projects WHERE id = $1', [proyecto]);
  await pool.end();
});

describe('la regla del campus, con los centros reales (#630)', () => {
  it('los 8 campus que Certifex manda al 360 (migración 0037 de Certifex) casan; ISEIE no', () => {
    // Los nombres y slugs del 360 (seed y migraciones 079 y 179).
    const del360 = [
      { id: 1, nombre: 'Psiko Aprende', slug: 'psiko-aprende' }, { id: 2, nombre: 'ISEIH', slug: 'iseih' },
      { id: 3, nombre: 'Fono Aprende', slug: 'fono-aprende' }, { id: 4, nombre: 'ISAEG', slug: 'isaeg' },
      { id: 5, nombre: 'ISSLOGG', slug: 'isslogg' }, { id: 6, nombre: 'ISECD', slug: 'isecd' },
      { id: 7, nombre: 'ISEF', slug: 'isef' }, { id: 8, nombre: 'Academia IA', slug: 'academia-ia' },
      { id: 9, nombre: 'ICTESS', slug: 'ictess' },
    ];
    for (const c of ['PSIKO', 'ISEIH', 'FONO', 'ISAEG', 'ISSLOGG', 'ISECD', 'ISEF', 'ACADEMIAIA']) {
      expect(proyectosDeCentro(c, del360).length, c).toBeGreaterThan(0);
    }
    expect(proyectosDeCentro('ISEIE', del360)).toEqual([]);
  });
});

describe('avisos-de-otro-crm-630 (#630)', () => {
  const sacados = join(dir, 'sacados.json');

  it('sacar: solo los de campus que no son de esta base, con lo copiable y lo «tocado aquí»', () => {
    const r = correr(['sacar', '--a-fichero', sacados]);
    expect(r.status, r.stderr).toBe(0);
    const d = leerJson(sacados);
    expect(d).toMatchObject({ paso: 'sacar', origen: BASE_AQUI });
    const mios = d.avisos.filter((a) => a.matricula_id >= base && a.matricula_id < base + 20);
    // La fila sin campus (base + 10) es de esta base: ni sale en el fichero ni cuenta.
    expect(mios.map((a) => a.matricula_id).sort()).toEqual([base, base + 1]);
    expect(r.stdout).toMatch(/filas sin campus: son de esta base y no se sacan/);
    const a = mios.find((x) => x.matricula_id === base);
    expect(a).toMatchObject({ centro: 'ZAJENA630', email: correo, curso_nombre: 'Máster en Prueba', tocada_en_origen: [] });
    expect(Number(a.completado_nota)).toBe(8.5);
    // Lo propio de la base de origen no viaja: solo se avisa.
    expect(a).not.toHaveProperty('lead_id');
    expect(a).not.toHaveProperty('firma_key');
    expect(mios.find((x) => x.matricula_id === base + 1).tocada_en_origen).toEqual(['email_crm', 'firma_key']);
    // La comprobación previa: con la lista por defecto (los 8 de Certifex) y con otra.
    expect(r.stdout).toMatch(/Campus que Certifex manda a esta base: PSIKO, ISEIH, FONO, ISAEG, ISSLOGG, ISECD, ISEF, ACADEMIAIA/);
    const otra = correr(['sacar', '--a-fichero', join(dir, 'sacados-b.json'), '--centros', 'zpropia630,ZNOCASA630']);
    expect(otra.stdout).toMatch(/NO casan con ningún proyecto de esta base: ZNOCASA630\./);
    const todos = correr(['sacar', '--a-fichero', join(dir, 'sacados-c.json'), '--centros', 'ZPROPIA630,ISEIH']);
    expect(todos.stdout).toMatch(/Todos casan/);
  });

  it('cada paso solo acepta el fichero del paso anterior, y en su base', () => {
    // meter con lo sacado de ESTA misma base: no.
    const mismo = correr(['meter', '--desde-fichero', sacados]);
    expect(mismo.status).toBe(1);
    expect(mismo.stderr).toMatch(/OTRA base/);
    // borrar con el fichero de sacar (sin pasar por meter): no.
    const sinMeter = correr(['borrar', '--desde-fichero', sacados]);
    expect(sinMeter.status).toBe(1);
    expect(sinMeter.stderr).toMatch(/no es el fichero de «meter»/);
    // borrar en una base que no es la de origen: no.
    const otra = correr(['borrar', '--desde-fichero', escribir('otra.json', { paso: 'meter', origen: 'crm_otra', avisos: [] })]);
    expect(otra.status).toBe(1);
    expect(otra.stderr).toMatch(/va en esa base/);
    // borrar con un fichero que no dice en qué otra base se metió: no.
    const sinDestino = correr(['borrar', '--desde-fichero', escribir('sin-destino.json', { paso: 'meter', origen: BASE_AQUI, avisos: [] })]);
    expect(sinDestino.status).toBe(1);
    expect(sinDestino.stderr).toMatch(/no dice en qué otra base/);
    // meter --aplicar sin decir dónde apuntar lo hecho: no.
    const sinFichero = correr(['meter', '--desde-fichero', sacados, '--aplicar']);
    expect(sinFichero.status).toBe(1);
    expect(sinFichero.stderr).toMatch(/falta --a-fichero/);
    // El mismo fichero de entrada y de salida: no (se perdería el de entrada).
    const mismoFichero = correr(['meter', '--desde-fichero', sacados, '--aplicar', '--a-fichero', sacados]);
    expect(mismoFichero.status).toBe(1);
    expect(mismoFichero.stderr).toMatch(/no pueden ser el mismo fichero/);
    expect(leerJson(sacados).paso).toBe('sacar');
  });

  it('meter: el ensayo no escribe; con --aplicar crea, completa lo vacío sin pisar, salta lo ajeno y apunta lo hecho', async () => {
    const a = leerJson(sacados).avisos.find((x) => x.matricula_id === base);
    // Como si vinieran de la otra base, con el campus de esta.
    const desde = escribir('desde.json', { paso: 'sacar', origen: 'crm_otra', avisos: [
      { ...a, matricula_id: base + 3, centro: 'ZPROPIA630' },
      { ...a, matricula_id: base + 2, centro: 'ZPROPIA630', curso_nombre: 'Otro nombre', completado_nota: '9' },
      { ...a, matricula_id: base + 4 },
      // Sin correo: entra, pero sin ficha (no la de correo vacío).
      { ...a, matricula_id: base + 11, centro: 'ZPROPIA630', email: null },
      // La matrícula ya está aquí con OTRO campus («Zpropia» también es de esta base, por
      // prefijo, pero no es ZPROPIA630): no es el mismo aviso, no se toca.
      { ...a, matricula_id: base + 12, centro: 'Zpropia', completado_nota: '7' },
    ] });
    // base + 2 ya está aquí, pero sin nota ni ficha.
    await pool.query('UPDATE certifex_solicitudes SET completado_nota = NULL, lead_id = NULL WHERE matricula_id = $1', [base + 2]);
    await insertar(base + 12, 'ZPROPIA630');
    await pool.query('UPDATE certifex_solicitudes SET completado_nota = NULL WHERE matricula_id = $1', [base + 12]);

    const ensayo = correr(['meter', '--desde-fichero', desde]);
    expect(ensayo.status, ensayo.stderr).toBe(0);
    expect(ensayo.stdout).toMatch(/ENSAYO/);
    expect(await fila(base + 3)).toBeUndefined();

    const metidos = join(dir, 'metidos.json');
    const r = correr(['meter', '--desde-fichero', desde, '--aplicar', '--a-fichero', metidos]);
    expect(r.status, r.stderr).toBe(0);
    const nueva = await fila(base + 3);
    expect(nueva).toMatchObject({ centro: 'ZPROPIA630', email: correo, lead_id: lead, veces: 1, firma_key: null, email_crm: null });
    expect(nueva.completado_recibido_en.toISOString()).toBe('2026-10-20T08:01:00.000Z');
    const completada = await fila(base + 2);
    expect(completada.curso_nombre).toBe('Máster en Prueba'); // lo que había, no se pisa
    expect(Number(completada.completado_nota)).toBe(9); // lo vacío, se rellena
    expect(completada.lead_id).toBe(lead);
    expect(await fila(base + 4)).toBeUndefined(); // ZAJENA630 tampoco es de esta base
    expect(await fila(base + 11)).toMatchObject({ centro: 'ZPROPIA630', email: null, lead_id: null });
    expect(await fila(base + 12)).toMatchObject({ centro: 'ZPROPIA630', completado_nota: null });
    expect(r.stdout).toMatch(/OTRO CAMPUS: 1/);

    // Lo apuntado: lo que quedó aquí, y nada de lo saltado ni de otro campus.
    const hecho = leerJson(metidos);
    expect(hecho).toMatchObject({ paso: 'meter', origen: 'crm_otra', destino: BASE_AQUI });
    expect(hecho.avisos.map((x) => x.matricula_id).sort()).toEqual([base + 11, base + 2, base + 3].sort());

    // Otra vez: nada que hacer, y lo que ya estaba también cuenta como hecho.
    const metidos2 = join(dir, 'metidos2.json');
    const otra = correr(['meter', '--desde-fichero', desde, '--aplicar', '--a-fichero', metidos2]);
    expect(otra.stdout).toMatch(/YA ESTABA: 3/);
    expect(leerJson(metidos2).avisos).toHaveLength(3);
  });

  it('meter --con-campana: suena una vez por aviso nuevo, con su fecha y la nota; sin la opción, no', async () => {
    const a = leerJson(sacados).avisos.find((x) => x.matricula_id === base);
    const desde = escribir('campana.json', { paso: 'sacar', origen: 'crm_otra', avisos: [
      { ...a, matricula_id: base + 5, centro: 'ZPROPIA630' },
      { ...a, matricula_id: base + 6, centro: 'ZPROPIA630', nombre_diploma: 'Alumna Seis', solicitada_en: '2026-10-21T09:00:00.000Z', recibida_en: '2026-10-21T09:00:05.000Z' },
    ] });
    const campanas = async () => (await pool.query(
      `SELECT type, title, message, link_path, metadata, target_user_ids, created_at FROM admin_notifications
        WHERE metadata->>'matriculaId' IN ($1, $2) ORDER BY metadata->>'matriculaId', type`, [String(base + 5), String(base + 6)])).rows;
    try {
      // Sin la opción: entra el aviso, pero no suena.
      const sin = correr(['meter', '--desde-fichero', escribir('sin.json', { paso: 'sacar', origen: 'crm_otra', avisos: [{ ...a, matricula_id: base + 7, centro: 'ZPROPIA630' }] }),
        '--aplicar', '--a-fichero', join(dir, 'm-sin.json')]);
      expect(sin.status, sin.stderr).toBe(0);
      expect(await fila(base + 7)).toBeDefined();
      expect((await pool.query(`SELECT 1 FROM admin_notifications WHERE metadata->>'matriculaId' = $1`, [String(base + 7)])).rows).toHaveLength(0);

      // El ensayo dice cuántas pondría y no pone ninguna.
      const ensayo = correr(['meter', '--desde-fichero', desde, '--con-campana']);
      expect(ensayo.status, ensayo.stderr).toBe(0);
      expect(ensayo.stdout).toMatch(/campanas/);
      expect(await campanas()).toHaveLength(0);

      // Con el enlace de ISEIE (allí Diplomas no cuelga de «/clientes»).
      const antes = Date.now();
      const r = correr(['meter', '--desde-fichero', desde, '--aplicar', '--a-fichero', join(dir, 'm-campana.json'), '--con-campana',
        '--enlace-diplomas', '/matriculas/diplomas']);
      expect(r.status, r.stderr).toBe(0);
      const c = await campanas();
      // La seis ya pidió el diploma: solo suena la solicitud, no «terminó sin pedir» (como Certifex).
      expect(c.map((x) => x.type)).toEqual(['certifex_completado', 'certifex_solicitud']);
      const [cinco, seisPide] = c;
      expect(cinco).toMatchObject({ title: 'Terminó sin pedir el diploma: Alumna 630', link_path: '/matriculas/diplomas?pestana=terminados' });
      expect(cinco.message).toMatch(/^ZPROPIA630 · Máster en Prueba\. Moodle da la formación por terminada/);
      // La fecha en que llegó al otro CRM va en el texto (hora de Madrid) y en metadata;
      // la campana, con la de hoy, para que se vea arriba.
      expect(cinco.message).toMatch(/Llegó el 20\/10\/26, 10:01 al otro CRM por error; se ha traído aquí \(#630\)/);
      expect(cinco.created_at.getTime()).toBeGreaterThanOrEqual(antes - 5000);
      expect(cinco.metadata).toMatchObject({ matriculaId: base + 5, centro: 'ZPROPIA630', leadId: lead, movidoDeOtroCrm: true, llegoAlOtroCrm: '2026-10-20T08:01:00.000Z' });
      // A quien le habría sonado: los super admin activos y el admin de este campus.
      const { rows: sas } = await pool.query(`SELECT id FROM users WHERE active AND role = 'superadmin'`);
      for (const u of sas) expect(cinco.target_user_ids).toContain(u.id);
      expect(cinco.target_user_ids).toContain(adminDelCampus);
      expect(seisPide).toMatchObject({ title: 'Diploma: Alumna Seis lo pide', link_path: '/matriculas/diplomas' });
      expect(seisPide.message).toMatch(/Nombre para el diploma: «Alumna Seis»\./);
      // La fecha de la SOLICITUD (21/10, 11:00 en Madrid), no la del «terminado».
      expect(seisPide.message).toMatch(/Llegó el 21\/10\/26, 11:00/);
      expect(seisPide.metadata.llegoAlOtroCrm).toBe('2026-10-21T09:00:00.000Z');

      // Otra vez: no repite.
      const otra = correr(['meter', '--desde-fichero', desde, '--aplicar', '--a-fichero', join(dir, 'm-campana2.json'), '--con-campana']);
      expect(otra.status, otra.stderr).toBe(0);
      expect(await campanas()).toHaveLength(2);
    } finally {
      await pool.query(`DELETE FROM admin_notifications WHERE metadata->>'matriculaId' IN ($1, $2, $3)`, [String(base + 5), String(base + 6), String(base + 7)]);
    }
  });

  it('borrar: solo lo que «meter» dejó en la otra base; el ensayo no borra; manda el campus de esta base', async () => {
    // Como si «meter» se hubiera hecho en la otra base con lo sacado de aquí: base sí
    // entró allí; base + 1 NO (se saltó o falló), así que no está en el fichero.
    // base + 8: ajena pero TOCADA aquí (firma, edición): no se borra sin --tambien-tocadas.
    await insertar(base + 8, 'ZAJENA630', { firma_key: 'firmas/ocho.png', email_crm: 'ocho@prueba.test' });
    // base + 13: el fichero dice que se metió, pero en la otra base NO está.
    // base + 14: en la otra base está, pero con otro campus.
    await insertar(base + 13, 'ZAJENA630');
    await insertar(base + 14, 'ZAJENA630');
    await poolDestino.query(
      `INSERT INTO certifex_solicitudes (matricula_id, centro) VALUES ($1, 'ZAJENA630'), ($2, 'zajena630'), ($3, 'ZAJENA630'), ($4, 'OTRO630')`,
      [base, base + 8, base + 9, base + 14]);
    const lista = escribir('metidos-aqui.json', { paso: 'meter', origen: BASE_AQUI, destino: DESTINO, avisos: [
      { matricula_id: base, centro: 'ZAJENA630' },
      { matricula_id: base + 2, centro: 'ZAJENA630' }, // en el fichero dice ajeno, pero aquí es ZPROPIA630
      { matricula_id: base + 8, centro: 'ZAJENA630' },
      { matricula_id: base + 9, centro: 'ZAJENA630' },
      { matricula_id: base + 13, centro: 'ZAJENA630' },
      { matricula_id: base + 14, centro: 'ZAJENA630' },
    ] });
    const conDestino = { DATABASE_URL_DESTINO: en(DESTINO) };

    // Sin decir dónde mirar, o mirando en otra base que la del fichero: no se borra nada.
    const sinDestino = correr(['borrar', '--desde-fichero', lista, '--aplicar']);
    expect(sinDestino.status).toBe(1);
    expect(sinDestino.stderr).toMatch(/falta DATABASE_URL_DESTINO/);
    const otraBase = correr(['borrar', '--desde-fichero', lista, '--aplicar'], { DATABASE_URL_DESTINO: process.env.DATABASE_URL });
    expect(otraBase.status).toBe(1);
    expect(otraBase.stderr).toMatch(/pero el fichero dice que se metieron en/);
    // Una URL mal escrita: un mensaje claro, no un error de Node.
    const malEscrita = correr(['borrar', '--desde-fichero', lista, '--aplicar'], { DATABASE_URL_DESTINO: 'no es una url' });
    expect(malEscrita.status).toBe(1);
    expect(malEscrita.stderr).toMatch(/no es una URL de Postgres/);
    expect(malEscrita.stderr).not.toMatch(/TypeError/);
    // Si una fila falla (aquí, una base de destino sin la tabla), no acaba en «Hecho.» ni
    // con 0: sale con 1 y lo dice. Y no borra nada.
    const VACIA = `${DESTINO}_vacia`;
    await pool.query(`CREATE DATABASE ${VACIA}`);
    try {
      const conErrores = correr(['borrar', '--desde-fichero', escribir('a-vacia.json', { paso: 'meter', origen: BASE_AQUI, destino: VACIA, avisos: [
        { matricula_id: base, centro: 'ZAJENA630' },
      ] }), '--aplicar'], { DATABASE_URL_DESTINO: en(VACIA) });
      expect(conErrores.status).toBe(1);
      expect(conErrores.stdout).toMatch(/ERROR: 1/);
      expect(conErrores.stdout).not.toMatch(/Hecho\./);
      expect(conErrores.stderr).toMatch(/1 con ERROR/);
    } finally {
      await pool.query(`DROP DATABASE IF EXISTS ${VACIA} WITH (FORCE)`);
    }
    expect(await fila(base)).toBeDefined();
    // Las campanas que dejaron esos avisos aquí (lo que se veía desde el admin).
    const campana = async (type, matriculaId, centro) => (await pool.query(
      `INSERT INTO admin_notifications (type, title, metadata) VALUES ($1, 'Prueba 630', $2) RETURNING id`,
      [type, { matriculaId, centro }])).rows[0].id;
    const c = {
      ajena: await campana('certifex_completado', base, 'ZAJENA630'),
      solicitud: await campana('certifex_solicitud', base, 'ZAJENA630'),
      deOtroTipo: await campana('certifex_consulta', base, 'ZAJENA630'),
      sinMeter: await campana('certifex_completado', base + 1, 'ZAJENA630'),
      propia: await campana('certifex_completado', base + 2, 'ZPROPIA630'),
      yaSinFila: await campana('certifex_completado', base + 9, 'ZAJENA630'),
      tocada: await campana('certifex_completado', base + 8, 'ZAJENA630'),
      noEstaAlli: await campana('certifex_completado', base + 13, 'ZAJENA630'),
      otroCampus: await campana('certifex_completado', base + 14, 'ZAJENA630'),
    };
    const quedan = async () => (await pool.query('SELECT id FROM admin_notifications WHERE id = ANY($1::int[])', [Object.values(c)])).rows.map((x) => x.id).sort();
    try {
      const ensayo = correr(['borrar', '--desde-fichero', lista], conDestino);
      expect(ensayo.status, ensayo.stderr).toBe(0);
      expect(await fila(base)).toBeDefined();
      expect(await quedan()).toHaveLength(9);

      const r = correr(['borrar', '--desde-fichero', lista, '--aplicar'], conDestino);
      expect(r.status, r.stderr).toBe(0);
      expect(await fila(base)).toBeUndefined();
      expect(await fila(base + 1)).toBeDefined(); // no la metió nadie: se queda
      expect(await fila(base + 2)).toBeDefined(); // su campus es de esta base: se queda
      expect(await fila(base + 13)).toBeDefined(); // el fichero miente: allí no está
      expect(await fila(base + 14)).toBeDefined(); // allí es de otro campus
      expect(r.stdout).toMatch(/YA NO ESTÁ: 1/);
      expect(r.stdout).toMatch(/SE QUEDA: 1/);
      expect(r.stdout).toMatch(/NO ESTÁ ALLÍ: 1/);
      expect(r.stdout).toMatch(/OTRO CAMPUS: 1/);
      // Se van las campanas de avisos (terminado y solicitud) de lo que se movió, también
      // si la fila ya no estaba; se quedan las de otro tipo, las de lo no movido, las
      // propias, las de la tocada (con su fila: la firma no se pierde) y las de lo que
      // la otra base no confirma.
      expect(await fila(base + 8)).toMatchObject({ firma_key: 'firmas/ocho.png' });
      expect(await quedan()).toEqual([c.deOtroTipo, c.sinMeter, c.propia, c.tocada, c.noEstaAlli, c.otroCampus].sort());

      // Con --tambien-tocadas, sí (alguien la ha mirado y lo decide).
      const igual = correr(['borrar', '--desde-fichero', lista, '--aplicar', '--tambien-tocadas'], conDestino);
      expect(igual.status, igual.stderr).toBe(0);
      expect(await fila(base + 8)).toBeUndefined();
      expect(await quedan()).toEqual([c.deOtroTipo, c.sinMeter, c.propia, c.noEstaAlli, c.otroCampus].sort());
      // La otra base, intacta (se abre en solo lectura).
      expect((await poolDestino.query('SELECT COUNT(*)::int AS n FROM certifex_solicitudes')).rows[0].n).toBe(4);
    } finally {
      await pool.query('DELETE FROM admin_notifications WHERE id = ANY($1::int[])', [Object.values(c)]);
    }
  });

  it('en producción, --aplicar necesita RECUPERAR_EN_PRODUCCION=1 (en las dos bases)', () => {
    const meter = correr(['meter', '--desde-fichero', join(dir, 'desde.json'), '--aplicar', '--a-fichero', join(dir, 'x.json')],
      { DATABASE_URL: en('crm_iseie'), RECUPERAR_EN_PRODUCCION: '' });
    expect(meter.status).toBe(1);
    expect(meter.stderr).toMatch(/PRODUCCIÓN/);
    const borrar = correr(['borrar', '--desde-fichero', join(dir, 'metidos-aqui.json'), '--aplicar'],
      { DATABASE_URL: en('crm_prod_db'), RECUPERAR_EN_PRODUCCION: '' });
    expect(borrar.status).toBe(1);
    expect(borrar.stderr).toMatch(/PRODUCCIÓN/);
    expect(existsSync(join(dir, 'x.json'))).toBe(false);
  });

  it('el candado no se salta escribiendo la base de otra forma, ni sin escribirla', async () => {
    // Hace falta una base que se llame crm_iseie: se crea vacía si no está, y solo se
    // quita si se creó.
    const { rows } = await pool.query(`SELECT 1 FROM pg_database WHERE datname = 'crm_iseie'`);
    const creada = rows.length === 0;
    if (creada) await pool.query('CREATE DATABASE crm_iseie');
    const meter = (extra) => correr(['meter', '--desde-fichero', join(dir, 'desde.json'), '--aplicar', '--a-fichero', join(dir, 'y.json')],
      { RECUPERAR_EN_PRODUCCION: '', ...extra });
    try {
      // «crm%5Fiseie» es crm_iseie para pg: lo para ya la lectura de la URL.
      const r = meter({ DATABASE_URL: en('crm%5Fiseie') });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/crm_iseie es PRODUCCIÓN/);
      // Sin base en la URL, pg tira de PGDATABASE: la URL no dice nada y solo
      // current_database(), ya conectados, sabe que es producción.
      const sinBase = meter({ DATABASE_URL: en(''), PGDATABASE: 'crm_iseie' });
      expect(sinBase.status).toBe(1);
      expect(sinBase.stderr).toMatch(/crm_iseie es PRODUCCIÓN/);
      expect(existsSync(join(dir, 'y.json'))).toBe(false);
    } finally {
      if (creada) await pool.query('DROP DATABASE IF EXISTS crm_iseie WITH (FORCE)');
    }
  });
});
