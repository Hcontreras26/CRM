import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import supertest from 'supertest';
import sharp from 'sharp';

/**
 * El webhook de admisión (#198), contra la base de verdad.
 *
 * Diego (WhatsApp, 20/10): «un webhook abierto que reciba [los datos de admisión]
 * y luego se pueda mapear, por campus», y que se una a la persona por el correo.
 * Lo que pide la #198: archivos (multipart, URL o base64; JPG, PNG, WEBP, PDF;
 * 10 MB; tipo real), campos propios, vincular por email y luego teléfono (si no
 * existe se crea) y con la venta, e idempotente.
 *
 *   docker compose -f docker-compose.dev.yml up -d && npm run db:preparar
 *   npx vitest run tests/webhookAdmision.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { default: webhookTokens } = await import('../src/modules/webhook-tokens/index.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const tokenModel = await import('../src/modules/webhook-tokens/token.model.js');
const matriculaModel = await import('../src/modules/matriculas/matricula.model.js');
const { obtenerArchivo, desdeUrl, ipPrivada, tipoReal } = await import('../src/modules/matriculas/admision.archivos.js');
const { fechaDeNacimiento } = await import('../src/modules/matriculas/admision.service.js');
const certifexModel = await import('../src/modules/certifex/certifex.model.js');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(webhookTokens.prefix, webhookTokens.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `ADM${Date.now().toString(36)}`;
const correo = (n) => `${n}@${MARCA.toLowerCase()}.test`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
let PROYECTO; let TOKEN; let GESTORA;

// ── Archivos de prueba ──────────────────────────────────────────────────────
let JPG; let PNG; let FIRMA_BLANCA; const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const FALSO = Buffer.from('esto no es una imagen, aunque se llame dni.jpg');

/** Una firma: un trazo negro sobre fondo blanco, como una foto o un escaneo. */
async function firmaSobreBlanco() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="#fff"/><path d="M30 120 C90 20 160 140 230 60 S330 110 370 40" stroke="#111" stroke-width="7" fill="none"/></svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const recibir = (token = TOKEN.token) => request.post(`/api/webhook-tokens/receive/${token}`);
const matricula = async (id) => (await q('SELECT * FROM matriculas WHERE id = $1', [id]))[0];
const historial = async (id) => (await q('SELECT evento, documento FROM matriculas_eventos WHERE matricula_id = $1 ORDER BY id', [id]));

beforeAll(async () => {
  [PROYECTO] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Campus`, MARCA.toLowerCase(), `${MARCA}-key`]);
  // Una gestora en el campus: si el prospecto nuevo entrara en el reparto, se lo llevaría ella.
  [GESTORA] = await q(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'gestor') RETURNING id`,
    [`${MARCA} Gestora`, correo('gestora')]);
  await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [GESTORA.id, PROYECTO.id]);
  TOKEN = await tokenModel.create({ project_id: PROYECTO.id, kind: 'matriculas', field_mapping: {} });
  JPG = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c00' } }).jpeg().toBuffer();
  PNG = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#0c0' } }).png().toBuffer();
  FIRMA_BLANCA = await firmaSobreBlanco();
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM matriculas WHERE project_id = $1`, [PROYECTO.id]);
  await q(`DELETE FROM conversions WHERE project_id = $1`, [PROYECTO.id]);
  await q(`DELETE FROM leads WHERE project_id = $1`, [PROYECTO.id]);
  await q(`DELETE FROM project_webhook_tokens WHERE project_id = $1`, [PROYECTO.id]);
  await q(`DELETE FROM user_projects WHERE project_id = $1`, [PROYECTO.id]);
  await q(`DELETE FROM users WHERE id = $1`, [GESTORA.id]);
  await q(`DELETE FROM projects WHERE id = $1`, [PROYECTO.id]);
  await pool.end();
}, 60000);

describe('el modo escucha enseña también los archivos, para mapearlos', () => {
  it('un multipart con campos y un archivo: el archivo sale como marca, no como bytes', async () => {
    const t = await tokenModel.create({ project_id: PROYECTO.id, kind: 'matriculas', field_mapping: {} });
    await tokenModel.setListenMode(t.id, true);
    const r = await recibir(t.token).field('your-name', 'Ana').attach('dni-front', JPG, 'dni.jpg');
    expect(r.status).toBe(200);
    expect(r.body.data.mode).toBe('listen');
    const { sample_payload: s } = await tokenModel.findById(t.id);
    expect(s['your-name']).toBe('Ana');
    expect(s['dni-front']).toMatchObject({ __archivo: 'dni-front', nombre: 'dni.jpg', tamano: JPG.length });
  });
});

describe('los datos de la persona, en campos propios', () => {
  it('sin mapeo, con los nombres del contrato de la #198', async () => {
    const r = await recibir().send({
      nombre: 'Laura Sanz', email: correo('Laura'), telefono: '+34 600 111 222', documento_tipo: 'DNI', dni: '12345678Z',
      fecha_nacimiento: '17/05/1990', direccion: 'C/ Mayor 1', pais: 'España', estudios: 'Grado en Psicología',
      curso_solicitado: 'Máster en Neuropsicología',
    });
    expect(r.status).toBe(201);
    expect(r.body.data.action).toBe('created');
    const m = await matricula(r.body.data.matricula_id);
    expect(m).toMatchObject({
      nombre: 'Laura Sanz', email: correo('laura'), telefono: '+34 600 111 222', documento_tipo: 'DNI', dni: '12345678Z',
      direccion: 'C/ Mayor 1', pais: 'España', estudios: 'Grado en Psicología', curso_solicitado: 'Máster en Neuropsicología',
      estado: 'solicitud_admision', source: 'webhook',
    });
    // La base la devuelve como texto o como fecha, según el tipo: se mira el día.
    const dia = m.fecha_nacimiento instanceof Date ? m.fecha_nacimiento.toISOString() : String(m.fecha_nacimiento);
    expect(dia.slice(0, 10)).toBe('1990-05-17');
    // El envío se conserva tal cual llegó.
    expect(m.datos_admision.estudios).toBe('Grado en Psicología');
    expect((await historial(m.id)).map((e) => e.evento)).toEqual(['recibida']);
  });

  it('con mapeo: cada formulario manda sus propios nombres (Elementor, Gravity…)', async () => {
    const t = await tokenModel.create({ project_id: PROYECTO.id, kind: 'matriculas', field_mapping: {
      nombre: 'your-name', email: 'fields.correo', dni: 'fields.documento', curso_solicitado: 'form.curso',
    } });
    const r = await recibir(t.token).send({ 'your-name': 'Pedro Gil', fields: { correo: correo('pedro'), documento: 'X1234567L' }, form: { curso: 'Curso de Duelo' } });
    expect(r.status).toBe(201);
    const m = await matricula(r.body.data.matricula_id);
    expect(m).toMatchObject({ nombre: 'Pedro Gil', email: correo('pedro'), dni: 'X1234567L', curso_solicitado: 'Curso de Duelo' });
  });

  it('una fecha que no es fecha no se inventa: queda vacía (y en el envío original)', () => {
    expect(fechaDeNacimiento('1990-05-17')).toBe('1990-05-17');
    expect(fechaDeNacimiento('17-05-1990')).toBe('1990-05-17');
    expect(fechaDeNacimiento('31/02/1990')).toBeNull();
    expect(fechaDeNacimiento('mañana')).toBeNull();
  });

  it('la lista de Matrículas enseña a la persona aunque aún no tenga prospecto', async () => {
    const r = await recibir().send({ nombre: 'Sin Correo Ni Tel', dni: '00000001R' });
    const { matriculas } = await matriculaModel.findAll({ projectId: PROYECTO.id, search: 'Sin Correo' });
    expect(matriculas.find((x) => x.id === r.body.data.matricula_id)?.lead_nombre).toBe('Sin Correo Ni Tel');
  });
});

describe('los documentos: archivo, imagen en texto o URL', () => {
  it('multipart: el DNI por las dos caras, el título en PDF y la firma; cada uno con su línea en el historial', async () => {
    const r = await recibir()
      .field('nombre', 'Marta Ruiz').field('email', correo('marta'))
      .attach('dni_frente', JPG, 'frente.jpg').attach('dni_dorso', PNG, 'dorso.png')
      .attach('titulo_doc', PDF, 'titulo.pdf').attach('firma', FIRMA_BLANCA, 'firma.png');
    expect(r.status).toBe(201);
    expect(r.body.data.documentos).toEqual({ guardados: ['dni_frente', 'dni_dorso', 'titulo_doc', 'firma'], rechazados: [] });
    const m = await matricula(r.body.data.matricula_id);
    expect(m.dni_doc_key).toMatch(/\.jpg$/);
    expect(m.dni_dorso_key).toMatch(/\.png$/);
    expect(m.titulo_doc_key).toMatch(/\.pdf$/);
    expect(m.firma_key).toMatch(/\.png$/);
    const docs = (await historial(m.id)).filter((e) => e.evento === 'documento').map((e) => e.documento);
    expect(docs.sort()).toEqual(['dni', 'dni_dorso', 'firma', 'titulo']);
  });

  it('la firma se guarda transparente y recortada al trazo (Diego: «que la firma llegue en fondo transparente»)', async () => {
    const r = await recibir().field('email', correo('firma')).attach('firma', FIRMA_BLANCA, 'firma.png');
    const m = await matricula(r.body.data.matricula_id);
    const { getLocal } = await import('../src/shared/services/localStorage.service.js');
    const { buffer } = await getLocal(m.firma_key);
    const meta = await sharp(buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBeLessThan(400); // recortada
    const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // la esquina, transparente
  });

  it('imagen en texto (data:image/png;base64): se guarda y no se copia entera en datos_admision', async () => {
    const dataUri = `data:image/png;base64,${FIRMA_BLANCA.toString('base64')}`;
    const r = await recibir().send({ email: correo('base64'), firma: dataUri });
    expect(r.body.data.documentos.guardados).toEqual(['firma']);
    const m = await matricula(r.body.data.matricula_id);
    expect(m.firma_key).toBeTruthy();
    expect(m.datos_admision.firma).toMatch(/^\[imagen en texto, \d+ KB\]$/);
  });

  it('un archivo que no es lo que dice (texto llamado dni.jpg) se rechaza, y la solicitud se guarda igual', async () => {
    const r = await recibir().field('email', correo('falso')).attach('dni_frente', FALSO, 'dni.jpg');
    expect(r.status).toBe(201);
    expect(r.body.data.documentos.rechazados).toEqual([{ documento: 'dni_frente', motivo: 'No es un JPG, PNG, WEBP ni PDF.' }]);
    expect((await matricula(r.body.data.matricula_id)).dni_doc_key).toBeNull();
  });

  it('una firma en PDF no vale: tiene que ser una imagen', async () => {
    const r = await recibir().field('email', correo('firmapdf')).attach('firma', PDF, 'firma.pdf');
    expect(r.body.data.documentos.rechazados[0]).toMatchObject({ documento: 'firma', motivo: 'La firma tiene que ser una imagen, no un PDF.' });
  });

  it('una URL de la red interna o del propio servidor NO se descarga', async () => {
    const r = await recibir().send({ email: correo('ssrf'), dni_frente: 'http://127.0.0.1:5432/secreto.jpg', foto: 'http://169.254.169.254/latest/meta-data' });
    expect(r.status).toBe(201);
    expect(r.body.data.documentos.rechazados).toEqual([
      { documento: 'dni_frente', motivo: 'La dirección del archivo no es pública.' },
      { documento: 'foto', motivo: 'La dirección del archivo no es pública.' },
    ]);
  });

  it('una URL pública se descarga (aquí, un servidor de prueba en 127.0.0.1 con el permiso de las pruebas)', async () => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/saltar') { res.writeHead(302, { location: '/dni.jpg' }); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(JPG);
    });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${srv.address().port}`;
    try {
      const a = await obtenerArchivo(`${base}/saltar`, [], { permitirRedLocal: true });
      expect(a).toMatchObject({ ext: 'jpg', mime: 'image/jpeg' });
      expect(a.buffer.equals(JPG)).toBe(true);
      // Sin el permiso de las pruebas, la misma dirección se rechaza.
      await expect(desdeUrl(`${base}/dni.jpg`)).rejects.toThrow('La dirección del archivo no es pública.');
    } finally {
      srv.close();
    }
  });

  it('las direcciones internas y el tipo real, uno a uno', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(ipPrivada(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '104.16.0.1', '2606:4700::1111']) expect(ipPrivada(ip)).toBe(false);
    expect(tipoReal(JPG).ext).toBe('jpg');
    expect(tipoReal(PNG).ext).toBe('png');
    expect(tipoReal(PDF).ext).toBe('pdf');
    expect(tipoReal(FALSO)).toBeNull();
  });
});

describe('el contrato de Diego (01/10), tal cual, y formularios de verdad', () => {
  it('sin mapeo, el ARCHIVO «titulo» va como documento y «documento» como número', async () => {
    const r = await recibir().field('email', correo('contrato')).field('documento', 'Y7654321G')
      .attach('dni_frente', JPG, 'f.jpg').attach('titulo', PDF, 'titulo.pdf');
    expect(r.body.data.documentos.guardados).toEqual(['dni_frente', 'titulo_doc']);
    const m = await matricula(r.body.data.matricula_id);
    expect(m.titulo_doc_key).toMatch(/\.pdf$/);
    expect(m.titulo).toBeNull(); // el texto «Título / Programa» no se llena con un archivo
    expect(m.dni).toBe('Y7654321G');
  });

  it('el «titulo» que es texto sigue siendo el texto «Título / Programa»', async () => {
    const r = await recibir().send({ email: correo('titulotexto'), titulo: 'Máster en Duelo' });
    expect((await matricula(r.body.data.matricula_id)).titulo).toBe('Máster en Duelo');
  });

  it('Gravity: el nombre por partes ({ first, last }) se junta', async () => {
    const t = await tokenModel.create({ project_id: PROYECTO.id, kind: 'matriculas', field_mapping: { nombre: 'name', email: 'mail' } });
    const r = await recibir(t.token).send({ name: { first: 'Ana', last: 'Pérez Gil' }, mail: correo('gravity') });
    expect((await matricula(r.body.data.matricula_id)).nombre).toBe('Ana Pérez Gil');
  });

  it('varios archivos con el mismo nombre (fotos[]): se pueden mapear y vale el primero', async () => {
    const t = await tokenModel.create({ project_id: PROYECTO.id, kind: 'matriculas', field_mapping: { email: 'e', dni_frente: 'docs.0', dni_dorso: 'docs.1' } });
    const r = await recibir(t.token).field('e', correo('varios')).attach('docs', JPG, 'frente.jpg').attach('docs', PNG, 'dorso.png');
    expect(r.body.data.documentos.guardados).toEqual(['dni_frente', 'dni_dorso']);
    const m = await matricula(r.body.data.matricula_id);
    expect(m.dni_doc_key).toMatch(/\.jpg$/);
    expect(m.dni_dorso_key).toMatch(/\.png$/);
  });

  it('un JSON con las imágenes en texto de más de 5 MB entra (el tope general de la API es 5 MB)', async () => {
    const grande = await sharp({ create: { width: 1400, height: 1400, channels: 3, background: '#888' } })
      .composite([{ input: Buffer.from(Array.from({ length: 1400 * 1400 * 3 }, (_, i) => (i * 7919) % 256)), raw: { width: 1400, height: 1400, channels: 3 } }])
      .png({ compressionLevel: 0 }).toBuffer();
    expect(grande.length).toBeGreaterThan(4 * 1024 * 1024);
    const uri = `data:image/png;base64,${grande.toString('base64')}`;
    // La app de verdad, con su tope por ruta (app.js).
    const { default: appReal } = await import('../src/app.js');
    const r = await supertest(appReal).post(`/api/webhook-tokens/receive/${TOKEN.token}`)
      .send({ email: correo('json-grande'), dni_frente: uri, dni_dorso: uri });
    expect(r.status).toBe(201);
    expect(r.body.data.documentos.guardados).toEqual(['dni_frente', 'dni_dorso']);
  }, 60000);
});

describe('se une a la persona («que se sincronicen con el mail»)', () => {
  it('por el correo: con su prospecto de siempre y su gestora, sin crear otro', async () => {
    const [l] = await q(`INSERT INTO leads (project_id, nombre, email, telefono, responsable_id) VALUES ($1, 'Rosa Prospecto', $2, '600999888', $3) RETURNING id`,
      [PROYECTO.id, correo('rosa'), GESTORA.id]);
    const r = await recibir().send({ nombre: 'Rosa en el formulario', email: correo('ROSA') });
    expect(r.body.data).toMatchObject({ lead_id: l.id, lead_creado: false });
    expect((await q('SELECT count(*)::int AS n FROM leads WHERE project_id = $1 AND lower(email) = $2', [PROYECTO.id, correo('rosa')]))[0].n).toBe(1);
  });

  it('si no hay correo que coincida, por el teléfono', async () => {
    const [l] = await q(`INSERT INTO leads (project_id, nombre, email, telefono) VALUES ($1, 'Telmo', $2, '+34 611 222 333') RETURNING id`,
      [PROYECTO.id, correo('telmo-viejo')]);
    // El CRM compara los teléfonos con su prefijo (claveTelefono de lead.model.js): «+34 611 222 333» = «0034611222333».
    const r = await recibir().send({ nombre: 'Telmo', email: correo('telmo-nuevo'), telefono: '0034611222333' });
    expect(r.body.data.lead_id).toBe(l.id);
  });

  it('si no existe, se crea el prospecto SIN GESTORA (fuera del reparto; decidido el 20/10)', async () => {
    const r = await recibir().send({ nombre: 'Nuevo Alumno', email: correo('nuevo') });
    expect(r.body.data.lead_creado).toBe(true);
    const [l] = await q('SELECT responsable_id, notas FROM leads WHERE id = $1', [r.body.data.lead_id]);
    expect(l.responsable_id).toBeNull();
    expect(l.notas).toBe('Creado por la solicitud de admisión');
    expect((await matricula(r.body.data.matricula_id)).lead_id).toBe(r.body.data.lead_id);
  });

  it('sin correo no se crea prospecto (es obligatorio en la ficha): la solicitud queda sin vincular', async () => {
    const r = await recibir().send({ nombre: 'Solo Teléfono', telefono: '699000111' });
    expect(r.body.data).toMatchObject({ lead_id: null, lead_creado: false });
  });

  it('y con su venta, si la tiene y aún no tiene matrícula', async () => {
    const [l] = await q(`INSERT INTO leads (project_id, nombre, email) VALUES ($1, 'Con Venta', $2) RETURNING id`, [PROYECTO.id, correo('venta')]);
    const [c] = await q(`INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total) VALUES ($1, $2, 'Máster X', 2400) RETURNING id`, [l.id, PROYECTO.id]);
    const r = await recibir().send({ nombre: 'Con Venta', email: correo('venta') });
    expect(r.body.data.conversion_id).toBe(c.id);
    expect((await matricula(r.body.data.matricula_id)).conversion_id).toBe(c.id);
  });

  it('y si la venta llega DESPUÉS de la solicitud («cuando la haya»), se une al registrarla', async () => {
    const r = await recibir().send({ nombre: 'Venta Tardía', email: correo('tardia') });
    expect(r.body.data.conversion_id).toBeNull();
    // La venta, como la registra el CRM (conversion.model.create: todas pasan por ahí).
    const { create: crearVenta } = await import('../src/modules/conversions/conversion.model.js');
    const c = await crearVenta({
      lead_id: r.body.data.lead_id, project_id: PROYECTO.id, producto_contratado: 'Curso Tardío', importe_total: 300, importe_pagado: 0,
    });
    expect((await matricula(r.body.data.matricula_id)).conversion_id).toBe(c.id);
  });

  it('Certifex encuentra su firma por el correo mapeado (aunque el formulario no lo llame «email»)', async () => {
    const t = await tokenModel.create({ project_id: PROYECTO.id, kind: 'matriculas', field_mapping: { email: 'your-email', firma: 'your-signature' } });
    const r = await recibir(t.token).field('your-email', correo('diploma')).attach('your-signature', FIRMA_BLANCA, 'f.png');
    const firmas = await certifexModel.firmasDeAdmision([{ matriculaId: 999001, projectId: PROYECTO.id, email: correo('diploma') }]);
    expect(firmas.get(999001)?.matriculaCrm).toBe(r.body.data.matricula_id);
  });
});

describe('idempotente y con su llave', () => {
  it('el mismo envío dos veces no crea dos matrículas', async () => {
    const envio = { nombre: 'Doble', email: correo('doble'), curso_solicitado: 'Curso A' };
    const a = await recibir().send(envio);
    const b = await recibir().send(envio);
    expect(b.status).toBe(200);
    expect(b.body.data).toEqual({ matricula_id: a.body.data.matricula_id, action: 'duplicate_skipped' });
    expect((await q('SELECT count(*)::int AS n FROM matriculas WHERE project_id = $1 AND email = $2', [PROYECTO.id, correo('doble')]))[0].n).toBe(1);
  });

  it('el mismo envío con los mismos archivos, tampoco', async () => {
    const enviar = () => recibir().field('email', correo('docdoble')).attach('dni_frente', JPG, 'd.jpg');
    const a = await enviar();
    const b = await enviar();
    expect(b.body.data).toEqual({ matricula_id: a.body.data.matricula_id, action: 'duplicate_skipped' });
  });

  it('un token apagado o inventado: 404', async () => {
    const t = await tokenModel.create({ project_id: PROYECTO.id, kind: 'matriculas', field_mapping: {} });
    await tokenModel.update(t.id, { active: false });
    expect((await recibir(t.token).send({ email: correo('apagado') })).status).toBe(404);
    expect((await recibir('matriculas_noexiste').send({})).status).toBe(404);
  });

  it('un archivo de más de 10 MB se corta antes de leerlo entero', async () => {
    const grande = Buffer.alloc(10 * 1024 * 1024 + 10, 0xff);
    const r = await recibir().field('email', correo('grande')).attach('dni_frente', grande, 'grande.jpg');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/10 MB/);
  });
});
