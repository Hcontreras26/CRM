import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// R2 simulado: aquí no se sube nada de verdad.
vi.mock('../src/shared/services/r2.service.js', () => ({
  uploadToR2: vi.fn(async (key) => key),
  getFromR2: vi.fn(),
  deleteFromR2: vi.fn(),
}));

import supertest from 'supertest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { uploadToR2 } from '../src/shared/services/r2.service.js';
import { prepararMes } from '../src/modules/facturas-colaborador/facturas.service.js';
import { calcularDesglose } from '../src/modules/facturas-colaborador/desglose.js';

/**
 * Facturas de colaboradores (#202, segunda parte) · el desglose al subir la
 * factura: fijo, por hora y por proyecto, con IVA e IRPF, y «No cuadra».
 * Desde la corrección de Diego del 13/10, cuadra si el total del PDF es lo
 * escrito (el desglose ya no decide): los PDF se hacen aquí con pdf-lib.
 *
 * Su mes es junio de 2026 y sus colaboradores solo están activos ese mes: los
 * otros ficheros (julio, agosto, septiembre) corren a la vez y no se cruzan.
 */

// R2 «configurado» con valores de prueba: así almacen.js (revisión del 10/10) usa el
// R2 simulado de arriba también en la CI, que no tiene R2. El camino del disco lo
// prueba facturasColaboradorRevision.test.js.
process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'cuenta-de-prueba';
process.env.CLOUDFLARE_R2_ACCESS_KEY = 'clave-de-prueba';
process.env.CLOUDFLARE_R2_BUCKET = 'cubo-de-prueba';

const request = supertest(app);
const API = '/api/facturas-colaborador';
const MARCA = `FCDES_${Date.now().toString(36)}`;
const PERIODO = '2026-06-01';
const PDF = Buffer.from('%PDF-1.4\n% factura de prueba\n');

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

let empresa;
let campus;
let otra;           // otra empresa del grupo, con su campus: no se ofrece ni se acepta
let campusDeOtra;
const C = {};       // colaboradores por clave
const enlace = {};  // clave → token en claro

/** Un PDF de verdad con este texto, para que el servidor lea su total. */
async function pdfCon(...lineas) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage();
  const letra = await doc.embedFont(StandardFonts.Helvetica);
  lineas.forEach((l, i) => pagina.drawText(l, { x: 50, y: 760 - i * 20, size: 11, font: letra }));
  return Buffer.from(await doc.save());
}

const subir = (clave, campos, archivo = PDF) => {
  const r = request.post(`${API}/enlace/${enlace[clave]}`).attach('archivo', archivo, 'factura.pdf');
  for (const [k, v] of Object.entries(campos)) r.field(k, v);
  return r;
};
const fila = (clave) => one(
  `SELECT base::float, iva::float, irpf::float, total::float, horas::float, cuadra, importe_pdf::float, subida_at
     FROM facturas_colaborador WHERE colaborador_id = $1 AND periodo = $2`, [C[clave].id, PERIODO]);

beforeAll(async () => {
  empresa = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id',
    [`${MARCA} Empresa`, `B${Date.now().toString().slice(-8)}`]);
  campus = await one(
    `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${MARCA} Campus`, `${MARCA.toLowerCase()}-c`, `${MARCA}-key`, empresa.id]);
  otra = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id',
    [`${MARCA} Otra`, `C${Date.now().toString().slice(-8)}`]);
  campusDeOtra = await one(
    `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${MARCA} Campus de otra`, `${MARCA.toLowerCase()}-o`, `${MARCA}-key-o`, otra.id]);

  const fichas = {
    horas: { modalidad: 'hora', tarifa_hora: 22, iva_pct: 21, irpf_pct: 15 },
    fijo: { modalidad: 'fijo', importe_fijo: 600, iva_pct: 21, irpf_pct: 15 },
    proyecto: { modalidad: 'proyecto', tarifa_hora: 30, iva_pct: 0, irpf_pct: 0 },
    sin: { modalidad: null },
  };
  for (const [clave, cobro] of Object.entries(fichas)) {
    C[clave] = await one(
      `INSERT INTO colaboradores (nombre, email, area, alta_desde, baja_desde)
       VALUES ($1, $2, 'seo', '2026-06-01', '2026-07-01') RETURNING id`,
      [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`]);
    await q(
      `INSERT INTO colaborador_empresas (colaborador_id, issuer_id, importe_acordado, modalidad, importe_fijo, tarifa_hora, iva_pct, irpf_pct)
       VALUES ($1, $2, 600, $3, $4, $5, $6, $7)`,
      [C[clave].id, empresa.id, cobro.modalidad, cobro.importe_fijo ?? null, cobro.tarifa_hora ?? null,
        cobro.iva_pct ?? null, cobro.irpf_pct ?? null]);
  }
  const ids = Object.values(C).map((c) => c.id);
  for (const p of await prepararMes(PERIODO)) {
    if (!ids.includes(p.colaboradorId)) continue;
    const [clave] = Object.entries(C).find(([, c]) => c.id === p.colaboradorId);
    enlace[clave] = p.token;
  }
});

afterAll(async () => {
  const cs = Object.values(C).map((c) => c.id);
  await q(`DELETE FROM facturas_colaborador_registro
            WHERE colaborador_id = ANY($1::int[])
               OR factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [cs]);
  await q(`DELETE FROM admin_notifications WHERE type = 'factura_colaborador'
            AND (metadata->>'factura_id')::int IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [cs]);
  await q('DELETE FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[])', [cs]);
  await q('DELETE FROM colaboradores WHERE id = ANY($1::int[])', [cs]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [[campus.id, campusDeOtra.id]]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [[empresa.id, otra.id]]);
  await pool.end();
});

describe('el cálculo del desglose', () => {
  const desglose = (cobro, entrada, campusIds = []) =>
    calcularDesglose({ cobro, area: 'seo', periodo: PERIODO, entrada, campus: campusIds });

  it('fijo: una línea, ya rellena; 600 + 21 % − 15 % = 636,00 (el ejemplo del aviso de pago)', () => {
    const d = desglose({ modalidad: 'fijo', importe_fijo: 600, iva_pct: 21, irpf_pct: 15 }, {});
    expect(d.lineas).toEqual([expect.objectContaining({ concepto: 'Servicios de SEO · junio 2026', importe: 600, horas: null })]);
    expect(d).toMatchObject({ base: 600, iva: 126, irpf: 90, total: 636, horas: null });
  });

  it('por hora: 18 h × 22 €/h = 396 € de base (el ejemplo de la definición)', () => {
    const d = desglose({ modalidad: 'hora', tarifa_hora: 22, iva_pct: 21, irpf_pct: 15 }, { horas: '18' });
    expect(d).toMatchObject({ base: 396, iva: 83.16, irpf: 59.4, total: 419.76, horas: 18 });
    expect(d.lineas[0]).toMatchObject({ horas: 18, tarifa: 22, importe: 396 });
  });

  it('por proyecto: la suma de las líneas da la base; las horas «7,5» valen', () => {
    const d = desglose({ modalidad: 'proyecto', tarifa_hora: 30, iva_pct: 0, irpf_pct: 0 }, {
      lineas: JSON.stringify([
        { concepto: 'Landing de la feria', project_id: 7, horas: '7,5' },
        { concepto: 'SEO del blog', horas: 4 },
      ]),
    }, [7]);
    expect(d.lineas.map((l) => [l.concepto, l.project_id, l.horas, l.importe])).toEqual([
      ['Landing de la feria', 7, 7.5, 225], ['SEO del blog', null, 4, 120],
    ]);
    expect(d).toMatchObject({ base: 345, total: 345, horas: 11.5 });
  });

  it('lo que no vale se rechaza con un mensaje claro', () => {
    const p = { modalidad: 'proyecto', tarifa_hora: 30, iva_pct: 0, irpf_pct: 0 };
    const casos = [
      [{ modalidad: 'hora', tarifa_hora: 22, iva_pct: 0, irpf_pct: 0 }, {}, 'Escribe las horas'],
      [{ modalidad: 'hora', tarifa_hora: 22, iva_pct: 0, irpf_pct: 0 }, { horas: '-3' }, 'Horas inválidas'],
      [p, { lineas: '[]' }, 'al menos un encargo'],
      [p, { lineas: 'no es json' }, 'no se pudo leer'],
      [p, { lineas: JSON.stringify([{ concepto: '', horas: 2 }]) }, 'Escribe qué hiciste en el encargo 1'],
      [p, { lineas: JSON.stringify([{ concepto: 'x', horas: 2, project_id: 999 }]) }, 'Ese campus no es de esta empresa en el encargo 1'],
    ];
    for (const [cobro, entrada, texto] of casos) {
      expect(() => desglose(cobro, entrada, [7]), texto).toThrow(texto);
    }
  });

  it('sin modalidad no hay desglose (como en la primera parte)', () => {
    expect(desglose({ modalidad: null }, {})).toBeNull();
  });

  it('el medio céntimo, hacia arriba: el total sugerido es el de una factura bien hecha', () => {
    // 5 h × 21,70 = 108,50; IRPF 15 % = 16,275 → 16,28 (con decimales salía 16,27 y el total, 115,02, no era el de su factura).
    const h = desglose({ modalidad: 'hora', tarifa_hora: 21.7, iva_pct: 21, irpf_pct: 15 }, { horas: '5' });
    expect(h).toMatchObject({ base: 108.5, iva: 22.79, irpf: 16.28, total: 115.01 });
    expect(desglose({ modalidad: 'fijo', importe_fijo: 158.5, iva_pct: 21, irpf_pct: 0 }, {}).iva).toBe(33.29);
    expect(desglose({ modalidad: 'proyecto', tarifa_hora: 22.33, iva_pct: 0, irpf_pct: 0 },
      { lineas: JSON.stringify([{ concepto: 'x', horas: '1,5' }]) }).lineas[0].importe).toBe(33.5);
  });

  it('las horas, con dos decimales como mucho y sin punto de miles: «0.500» no son 500 horas', () => {
    const h = { modalidad: 'hora', tarifa_hora: 22, iva_pct: 0, irpf_pct: 0 };
    expect(desglose(h, { horas: '7.25' })).toMatchObject({ horas: 7.25, base: 159.5 });
    // Antes «7,333» se quedaba en 7,33 sin avisar, y «0.500» se leía como 500 horas (el punto de miles del importe).
    for (const horas of ['7,333', '0.500', '1.000', '7,5,1', '1e2']) {
      expect(() => desglose(h, { horas }), horas).toThrow('Horas inválidas');
    }
  });

  it('un desglose que no cabe en la base se rechaza antes de guardar', () => {
    // La tarifa más alta que admite la ficha por 744 h: más de lo que cabe en NUMERIC(12, 2).
    expect(() => desglose({ modalidad: 'hora', tarifa_hora: 99999999.99, iva_pct: 21, irpf_pct: 0 }, { horas: '744' }))
      .toThrow('demasiado grande');
  });

  it('el total, al céntimo: base + IVA − IRPF', () => {
    const d = desglose({ modalidad: 'hora', tarifa_hora: 22, iva_pct: 21, irpf_pct: 15 }, { horas: '18' });
    expect(d.total).toBe(419.76);
    expect(d.total).toBe(Math.round((d.base + d.iva - d.irpf) * 100) / 100);
  });
});

describe('facturas de colaboradores (#202) · el desglose al subir', () => {
  it('el enlace le dice cómo cobra; si es por proyecto, con los campus para elegir', async () => {
    const h = (await request.get(`${API}/enlace/${enlace.horas}`)).body.data;
    expect(h.cobro).toMatchObject({ modalidad: 'hora', tarifa_hora: 22, iva_pct: 21, irpf_pct: 15, concepto: 'Servicios de SEO · junio 2026' });
    expect(h.campus).toBeUndefined();
    const p = (await request.get(`${API}/enlace/${enlace.proyecto}`)).body.data;
    expect(p.cobro.modalidad).toBe('proyecto');
    expect(p.campus).toEqual(expect.arrayContaining([{ id: campus.id, nombre: `${MARCA} Campus` }]));
    expect((await request.get(`${API}/enlace/${enlace.sin}`)).body.data.cobro).toBeNull();
  });

  it('solo los campus de la empresa de la factura (Diego, 10/10: «son por EMPRESA, no por campus»)', async () => {
    const p = (await request.get(`${API}/enlace/${enlace.proyecto}`)).body.data;
    expect(p.campus).toEqual([{ id: campus.id, nombre: `${MARCA} Campus` }]);
    // Y si llega uno de otra empresa, se rechaza antes de subir nada.
    uploadToR2.mockClear();
    const res = await subir('proyecto', {
      importe: '60', numero_factura: 'F-P-06', lineas: JSON.stringify([{ concepto: 'x', horas: 2, project_id: campusDeOtra.id }]),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Ese campus no es de esta empresa');
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it('por hora y cuadra con el PDF: se guardan la base, el IVA, el IRPF, el total, su línea y lo que dice el PDF', async () => {
    const res = await subir('horas', { importe: '419,76', numero_factura: 'F-H-06', horas: '18' },
      await pdfCon('Factura F-H-06', 'Base imponible 396,00 €', 'Total IVA 83,16 €', 'Total factura: 419,76 €'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.recibida).toMatchObject({ total: 419.76, importe_pdf: 419.76, cuadra: true });
    expect(await fila('horas')).toMatchObject({
      base: 396, iva: 83.16, irpf: 59.4, total: 419.76, horas: 18, importe_pdf: 419.76, cuadra: true,
    });
    const lineas = await q(
      `SELECT concepto, horas::float, tarifa::float, importe::float FROM facturas_colaborador_lineas
        WHERE factura_id = (SELECT id FROM facturas_colaborador WHERE colaborador_id = $1 AND periodo = $2)`,
      [C.horas.id, PERIODO]);
    expect(lineas).toEqual([{ concepto: 'Servicios de SEO · junio 2026', horas: 18, tarifa: 22, importe: 396 }]);
  });

  it('si el PDF dice otra cifra, se deja enviar y queda marcada «No cuadra» (y en el registro)', async () => {
    // Fijo 600 con 21 % y 15 %: escribe 636, que es el total del desglose, pero su PDF dice 650.
    // Antes eso cuadraba (se comparaba con el desglose); desde el 13/10 manda el PDF.
    const res = await subir('fijo', { importe: '636', numero_factura: 'F-F-06' }, await pdfCon('Total a pagar 650,00 €'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.recibida).toMatchObject({ total: 636, importe_pdf: 650, cuadra: false });
    expect(await fila('fijo')).toMatchObject({ base: 600, total: 636, importe_pdf: 650, cuadra: false });
    const reg = await one(
      `SELECT detalle FROM facturas_colaborador_registro
        WHERE evento = 'recibida' AND factura_id = (SELECT id FROM facturas_colaborador WHERE colaborador_id = $1 AND periodo = $2)`,
      [C.fijo.id, PERIODO]);
    expect(reg.detalle).toMatchObject({ modalidad: 'fijo', base: 600, total: 636, importe_pdf: 650, cuadra: false, importe: 636 });
  });

  it('un desglose demasiado largo da un mensaje claro (no «no se pudo leer el archivo») y no sube nada', async () => {
    uploadToR2.mockClear();
    // 30 encargos de 200 eñes: unos 12 000 bytes (la eñe ocupa dos), más que el tope de la subida.
    const larga = { concepto: 'ñ'.repeat(200), horas: '1' };
    const res = await subir('proyecto', { importe: '60', numero_factura: 'F-P-06', lineas: JSON.stringify(Array(30).fill(larga)) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('El desglose es demasiado largo');
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it('un desglose mal escrito da 400 y no sube nada a R2', async () => {
    uploadToR2.mockClear();
    const res = await subir('proyecto', {
      importe: '60', numero_factura: 'F-P-06', lineas: JSON.stringify([{ concepto: 'x', horas: 2, project_id: 2147483 }]),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Ese campus no es de esta empresa');
    expect(uploadToR2).not.toHaveBeenCalled();
    expect((await fila('proyecto')).subida_at).toBeNull();
  });

  it('por proyecto: cada línea con su encargo, su campus y sus horas', async () => {
    const res = await subir('proyecto', {
      importe: '345', numero_factura: 'F-P-06',
      lineas: JSON.stringify([
        { concepto: 'Landing de la feria', project_id: campus.id, horas: '7,5' },
        { concepto: 'SEO del blog', project_id: null, horas: '4' },
      ]),
    }, await pdfCon('Subtotal 345,00 EUR', 'TOTAL 345,00 EUR'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await fila('proyecto')).toMatchObject({ base: 345, total: 345, horas: 11.5, importe_pdf: 345, cuadra: true });
    const lineas = await q(
      `SELECT orden, concepto, project_id, horas::float, importe::float FROM facturas_colaborador_lineas
        WHERE factura_id = (SELECT id FROM facturas_colaborador WHERE colaborador_id = $1 AND periodo = $2) ORDER BY orden`,
      [C.proyecto.id, PERIODO]);
    expect(lineas).toEqual([
      { orden: 1, concepto: 'Landing de la feria', project_id: campus.id, horas: 7.5, importe: 225 },
      { orden: 2, concepto: 'SEO del blog', project_id: null, horas: 4, importe: 120 },
    ]);
  });

  it('sin modalidad se sube como en la primera parte, sin desglose; y el PDF se lee igual', async () => {
    const res = await subir('sin', { importe: '600', numero_factura: 'F-S-06' }, await pdfCon('Importe total 600.00 EUR'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.recibida).toMatchObject({ total: null, importe_pdf: 600, cuadra: true });
    expect(await fila('sin')).toMatchObject({ base: null, total: null, importe_pdf: 600, cuadra: true });
  });
});
