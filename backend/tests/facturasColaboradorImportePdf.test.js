import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/*
  Facturas de colaboradores (#202) · el total que pone el PDF. Corrección de
  Diego del 13/10: «el monto es que coincida el PDF y lo que se escribió de
  factura ahí». Cuadra si el total del PDF es el importe escrito; si no se
  puede leer, null («No se pudo leer el PDF»), que no es «No cuadra».

  Los PDF se hacen aquí mismo con pdf-lib. La base está simulada: esto corre
  sin Postgres (la subida contra la base de verdad está en
  facturasColaboradorDesglose.test.js).
*/

// ── La base, simulada: lo justo para que pase una subida por el enlace ──
const estado = { fila: null, update: null, registro: null };
const consulta = vi.fn(async (sql) => {
  if (sql.includes('WHERE f.token_hash = $1')) return { rows: estado.fila ? [{ ...estado.fila }] : [] };
  if (sql.includes('INSERT INTO facturas_colaborador_registro')) return { rows: [] };
  return { rows: [] };
});
const cliente = {
  query: vi.fn(async (sql, params) => {
    if (sql.includes('FOR UPDATE')) {
      return { rows: [{ id: estado.fila.id, token_hash: estado.fila.token_hash, subida_at: null, anulada_at: null }] };
    }
    if (sql.includes('COUNT(*)')) return { rows: [{ n: 0 }] };
    if (sql.includes('UPDATE facturas_colaborador') && sql.includes('importe_pdf')) {
      estado.update = params;
      const [, numeroRecepcion, importe, numeroFactura, , nombreOriginal, mime, , , base, iva, irpf, total, horas, cuadra, importePdf] = params;
      Object.assign(estado.fila, {
        estado: 'recibida', subida_at: new Date().toISOString(), numero_recepcion: numeroRecepcion, importe,
        numero_factura: numeroFactura, nombre_original: nombreOriginal, mime, base, iva, irpf, total, horas,
        cuadra, importe_pdf: importePdf,
      });
    }
    if (sql.includes('INSERT INTO facturas_colaborador_registro')) estado.registro = JSON.parse(params[5]);
    return { rows: [] };
  }),
  release: vi.fn(),
};
vi.mock('../src/shared/config/db.js', () => ({
  default: { query: (...a) => consulta(...a) },
  query: (...a) => consulta(...a),
  getClient: vi.fn(async () => cliente),
}));
vi.mock('../src/shared/services/localStorage.service.js', () => ({
  saveLocal: vi.fn(async (k) => k),
  getLocal: vi.fn(),
}));
vi.mock('../src/shared/services/r2.service.js', () => ({ uploadToR2: vi.fn(), getFromR2: vi.fn() }));
vi.mock('../src/shared/utils/presignedUrl.js', () => ({ generatePresignedUrl: vi.fn() }));
vi.mock('../src/shared/services/brevo.service.js', () => ({ sendEmail: vi.fn(async () => ({ sent: false, simulated: true })) }));
vi.mock('../src/modules/notifications/notifications.service.js', () => ({ notifyUsers: vi.fn() }));
vi.mock('../src/modules/whatsapp/media.service.js', () => ({ enUtf8: (s) => s }));

const { importesDelTexto, totalDelPdf, cuadraConElPdf, leerImporteDelPdf } =
  await import('../src/modules/facturas-colaborador/importePdf.js');
const { subir } = await import('../src/modules/facturas-colaborador/facturas.service.js');

/** Un PDF con estas líneas; una línea [etiqueta, cifra] lleva la cifra a la derecha, en otro trozo. */
async function pdfCon(lineas) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage();
  const letra = await doc.embedFont(StandardFonts.Helvetica);
  lineas.forEach((l, i) => {
    const y = 760 - i * 20;
    if (Array.isArray(l)) {
      pagina.drawText(l[0], { x: 50, y, size: 11, font: letra });
      pagina.drawText(l[1], { x: 380, y, size: 11, font: letra });
    } else {
      pagina.drawText(l, { x: 50, y, size: 11, font: letra });
    }
  });
  return Buffer.from(await doc.save());
}
async function pdfEnBlanco() {
  const doc = await PDFDocument.create();
  doc.addPage();
  return Buffer.from(await doc.save());
}

describe('los importes de un texto', () => {
  it('en formato español e inglés, con y sin «€» o «EUR»', () => {
    expect(importesDelTexto('1.234,56 · 1,234.56 · 636,00 € · €636.00 · 636.00 EUR · 636 € · EUR 50 · 12.345.678,90'))
      .toEqual([1234.56, 1234.56, 636, 636, 636, 636, 50, 12345678.9]);
  });

  it('ni fechas, ni NIF, ni números de factura, ni porcentajes, ni cifras enteras sueltas', () => {
    const texto = [
      'Fecha: 12/10/2026 · Vence 2026-11-12 · 12.10.2026',
      'NIF B12345678 · DNI 12345678Z · CIF B-87654321',
      'Factura F-2026-09 · n.º 2026/001 · REC-2026-09-0001',
      'IVA 21 % · IRPF 15% · 21,00 % · 15,00%',
      'Horas 18 · CP 28001 · Tel. 600 123 456',
    ].join('\n');
    expect(importesDelTexto(texto)).toEqual([]);
  });
});

describe('el total del PDF', () => {
  it('la línea «Total factura», aunque antes vengan la base, el IVA y el IRPF', () => {
    const texto = 'Base imponible: 600,00 €\nIVA 21 %: 126,00 €\nIRPF 15 %: -90,00 €\nTotal factura: 636,00 €';
    expect(totalDelPdf(texto)).toBe(636);
  });

  it('«Subtotal», «Base imponible», «Total IVA», «Total IRPF» y «Total retención» no son el total', () => {
    const texto = 'Subtotal 600,00 €\nBase imponible 600,00 €\nTotal IVA 126,00 €\nTotal IRPF 90,00 €\nTotal retención 90,00 €';
    // Sin línea de total: el mayor importe (no cuadra con lo escrito)…
    expect(totalDelPdf(texto, 636)).toBe(600);
    // …o lo escrito, si está entre los importes del documento.
    expect(totalDelPdf(texto, 126)).toBe(126);
  });

  it('todas las etiquetas de total, y vale la ÚLTIMA línea', () => {
    expect(totalDelPdf('Total a pagar 636,00 €')).toBe(636);
    expect(totalDelPdf('Cantidad a pagar: €636.00')).toBe(636);
    expect(totalDelPdf('Importe total 1.234,56')).toBe(1234.56);
    expect(totalDelPdf('Total (EUR): 1,234.56')).toBe(1234.56);
    expect(totalDelPdf('TOTAL 636 €')).toBe(636);
    expect(totalDelPdf('Total de la factura: 636.00 EUR')).toBe(636);
    // La de las horas (600) y luego la de la factura (636): la última.
    expect(totalDelPdf('Total 600,00 €\nIVA 126,00 €\nIRPF 90,00 €\nTotal a pagar 636,00 €')).toBe(636);
  });

  it('en la misma línea, el último importe detrás de la etiqueta', () => {
    expect(totalDelPdf('Base 600,00  IVA 126,00  IRPF 90,00  TOTAL 636,00')).toBe(636);
  });

  it('si la cifra viene debajo, el último importe de la línea de debajo', () => {
    expect(totalDelPdf('TOTAL\n636,00 €')).toBe(636);
    expect(totalDelPdf('Base       IVA      IRPF     Total\n600,00   126,00   90,00   636,00')).toBe(636);
    // Debajo está otra suma: eso no es el total.
    expect(totalDelPdf('Total\nBase imponible 600,00', 999)).toBe(600);
  });

  it('sin ningún importe, null', () => {
    expect(totalDelPdf('Gracias por su confianza', 636)).toBeNull();
    expect(totalDelPdf('')).toBeNull();
  });
});

describe('cuadra', () => {
  it('igual al céntimo: sí; distinto: no; sin leer: null (no es «No cuadra»)', () => {
    expect(cuadraConElPdf(636, 636)).toBe(true);
    expect(cuadraConElPdf(636.004, 636)).toBe(true);
    expect(cuadraConElPdf(636, 636.01)).toBe(false);
    expect(cuadraConElPdf(636, 650)).toBe(false);
    expect(cuadraConElPdf(636, null)).toBeNull();
  });
});

describe('leer el PDF', () => {
  it('el total de un PDF de verdad, con la cifra en otro trozo de la misma línea', async () => {
    const pdf = await pdfCon(['Factura F-2026-09 · 12/10/2026', 'NIF B12345678', 'Base imponible: 600,00 €',
      ['Total IVA (21 %)', '126,00 €'], ['Total factura:', '636,00 €']]);
    expect(await leerImporteDelPdf(pdf, 636)).toBe(636);
  });

  it('en inglés, y con «Subtotal» y «Total IVA» antes', async () => {
    const pdf = await pdfCon(['Subtotal 1,100.00', 'Total IVA 231.00', 'Total (EUR) 1,331.00']);
    expect(await leerImporteDelPdf(pdf, 1331)).toBe(1331);
  });

  it('la cifra debajo de «TOTAL»', async () => {
    expect(await leerImporteDelPdf(await pdfCon(['TOTAL', '650,00 €']), 636)).toBe(650);
  });

  it('un PDF sin texto (una página en blanco, como un escaneado) o roto: null, sin lanzar', async () => {
    expect(await leerImporteDelPdf(await pdfEnBlanco(), 636)).toBeNull();
    expect(await leerImporteDelPdf(Buffer.from('%PDF-1.4\n% esto no es un PDF de verdad\n'), 636)).toBeNull();
    expect(await leerImporteDelPdf(Buffer.alloc(0), 636)).toBeNull();
  });

  it('no estropea el archivo que luego se guarda', async () => {
    const pdf = await pdfCon(['Total factura: 636,00 €']);
    const copia = Buffer.from(pdf);
    await leerImporteDelPdf(pdf, 636);
    expect(pdf.equals(copia)).toBe(true);
  });
});

describe('la subida guarda lo que dice el PDF y si cuadra', () => {
  beforeEach(() => {
    delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY;
    delete process.env.CLOUDFLARE_R2_BUCKET;
    estado.update = null;
    estado.registro = null;
    // Cobra un fijo de 600 con 21 % de IVA y 15 % de IRPF: su desglose da 636.
    estado.fila = {
      id: 41, colaborador_id: 7, issuer_id: 3, periodo: '2026-09-01', estado: 'abierto',
      token_hash: crypto.createHash('sha256').update('enlace').digest('hex'),
      importe_esperado: '600', importe: null, numero_factura: null, numero_recepcion: null, subida_at: null,
      caduca_at: null, anulada_at: null, nombre_original: null, mime: null,
      colaborador_nombre: 'Laura Pérez', colaborador_email: 'laura@test.local', area: 'seo',
      razon_social: 'Empresa de Prueba SL', empresa_nif: 'B00000000',
      modalidad: 'fijo', importe_fijo: '600', tarifa_hora: null, iva_pct: '21', irpf_pct: '15',
      base: null, iva: null, irpf: null, total: null, horas: null, cuadra: null, importe_pdf: null,
    };
  });

  const archivo = (buffer, nombre = 'factura.pdf') => ({ buffer, size: buffer.length, originalname: nombre });

  it('el PDF dice lo escrito: cuadra (en la base, en la respuesta y en el registro)', async () => {
    const r = await subir('enlace', { archivo: archivo(await pdfCon([['Total factura:', '636,00 €']])), importe: 636, numeroFactura: 'F-1' });
    // $15 cuadra, $16 importe_pdf
    expect(estado.update[14]).toBe(true);
    expect(estado.update[15]).toBe(636);
    // El desglose se sigue guardando: base, IVA, IRPF y total.
    expect(estado.update.slice(9, 13)).toEqual([600, 126, 90, 636]);
    expect(r.recibida).toMatchObject({ importe: 636, importe_pdf: 636, cuadra: true, total: 636, es_pdf: true });
    expect(estado.registro).toMatchObject({ importe: 636, importe_pdf: 636, cuadra: true, modalidad: 'fijo', total: 636 });
  });

  it('el PDF dice otra cosa: no cuadra, aunque lo escrito sea el total del desglose', async () => {
    const r = await subir('enlace', { archivo: archivo(await pdfCon(['Total a pagar 650,00 €'])), importe: 636, numeroFactura: 'F-1' });
    expect(estado.update[14]).toBe(false);
    expect(estado.update[15]).toBe(650);
    expect(r.recibida).toMatchObject({ importe: 636, importe_pdf: 650, cuadra: false, total: 636 });
    expect(estado.registro).toMatchObject({ importe_pdf: 650, cuadra: false });
  });

  it('el PDF dice el total del desglose y lo escrito es otra cifra: tampoco cuadra (manda el PDF)', async () => {
    const r = await subir('enlace', { archivo: archivo(await pdfCon(['TOTAL 636,00 €'])), importe: 600, numeroFactura: 'F-1' });
    expect(r.recibida).toMatchObject({ importe: 600, importe_pdf: 636, cuadra: false });
  });

  it('un PDF sin texto: se guarda igual, con importe_pdf y cuadra a null (y así en el registro)', async () => {
    const r = await subir('enlace', { archivo: archivo(await pdfEnBlanco()), importe: 636, numeroFactura: 'F-1' });
    expect(estado.update[14]).toBeNull();
    expect(estado.update[15]).toBeNull();
    expect(r.recibida).toMatchObject({ importe: 636, importe_pdf: null, cuadra: null, es_pdf: true });
    expect(estado.registro).toHaveProperty('importe_pdf', null);
    expect(estado.registro).toHaveProperty('cuadra', null);
  });

  it('una foto: no se lee (null), y se guarda igual', async () => {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('foto de la factura')]);
    const r = await subir('enlace', { archivo: archivo(jpg, 'factura.jpg'), importe: 636, numeroFactura: 'F-1' });
    expect(estado.update[14]).toBeNull();
    expect(estado.update[15]).toBeNull();
    expect(r.recibida).toMatchObject({ importe_pdf: null, cuadra: null, es_pdf: false });
  });
});
