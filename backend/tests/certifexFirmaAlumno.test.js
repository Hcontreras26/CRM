import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

// La firma del alumno en el diploma (Diego, 19/10/2026; CRM #349): «todo tiene que tener
// la firma del alumno para cargar, y si no la tiene debe salir para cargarla», siempre con
// el fondo transparente. Aquí, sin base: el procesado de la imagen y que la firma viaje a
// Certifex al emitir.
//
// Desde el 20/10/2026 la firma NO va en el diploma (Diego: «las firmas no van en los
// diplomas, solo el DNI»): con FIRMA_EN_DIPLOMA apagado no se manda nunca a Certifex, aunque
// quien emite la traiga. La subida y el procesado siguen, por si se vuelve a encender.

const llamadas = [];
vi.mock('../src/modules/certifex/certifex.cliente.js', () => ({
  certifex: vi.fn(async (metodo, ruta, cuerpo) => {
    llamadas.push({ metodo, ruta, cuerpo });
    return { resultados: cuerpo.items.map((it) => ({ matriculaId: it.matriculaId, ok: true, nexpediente: `CEDIA-2026-00000${it.matriculaId}-AAAA` })) };
  }),
  recorrer: vi.fn(),
}));
vi.mock('../src/shared/config/db.js', () => ({ query: vi.fn(async () => ({ rows: [] })), getClient: vi.fn() }));

const { firmaTransparente } = await import('../src/modules/certifex/certifex.firma.js');
const { emitirConPrograma, FIRMA_EN_DIPLOMA } = await import('../src/modules/certifex/certifex.emision.js');

beforeEach(() => { llamadas.length = 0; });

/** Una «foto» de firma: un trazo oscuro sobre fondo blanco (o casi blanco), como JPG. */
async function fotoDeFirma({ fondo = '#ffffff', tinta = '#1a2a6c', formato = 'jpeg' } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300">
    <rect width="600" height="300" fill="${fondo}"/>
    <path d="M120 200 C 180 80, 260 80, 300 170 S 420 260, 480 120" stroke="${tinta}" stroke-width="9" fill="none"/>
  </svg>`;
  const img = sharp(Buffer.from(svg));
  return formato === 'jpeg' ? img.jpeg({ quality: 90 }).toBuffer() : img.png().toBuffer();
}

async function pixel(png, x, y) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3], ancho: info.width, alto: info.height };
}

describe('la firma con el fondo transparente', () => {
  it('una foto con fondo blanco sale como PNG transparente, recortada al trazo y con su tinta', async () => {
    const png = await firmaTransparente(await fotoDeFirma());
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);
    // Recortada: mucho más estrecha y baja que la foto (600×300), con el trazo dentro.
    expect(meta.width).toBeLessThan(420);
    expect(meta.height).toBeLessThan(220);
    // Las esquinas son fondo: transparentes.
    expect((await pixel(png, 0, 0)).a).toBe(0);
    expect((await pixel(png, meta.width - 1, meta.height - 1)).a).toBe(0);
    // Y hay tinta opaca, del color del trazo (azul oscuro), no gris.
    const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let opacos = 0, azules = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) { opacos++; if (data[i + 2] > data[i]) azules++; }
    }
    expect(opacos).toBeGreaterThan(200);
    expect(azules / opacos).toBeGreaterThan(0.8);
  });

  it('un papel escaneado (fondo grisáceo) también queda transparente', async () => {
    const png = await firmaTransparente(await fotoDeFirma({ fondo: '#e6e2da' }));
    expect((await pixel(png, 0, 0)).a).toBe(0);
  });

  it('un PNG que ya era transparente sale igual de bien', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><path d="M40 150 L 200 40 L 360 150" stroke="#000" stroke-width="8" fill="none"/></svg>';
    const png = await firmaTransparente(await sharp(Buffer.from(svg)).png().toBuffer());
    expect((await pixel(png, 0, 0)).a).toBe(0);
    expect((await sharp(png).metadata()).width).toBeLessThan(400);
  });

  it('una imagen grande se reduce (no viaja a Certifex una foto de 4000 px)', async () => {
    const grande = await sharp(await fotoDeFirma({ formato: 'png' })).resize(4000, 2000).png().toBuffer();
    const meta = await sharp(await firmaTransparente(grande)).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(900);
  });

  it('sin trazo (una hoja en blanco) no es una firma: 400', async () => {
    const blanco = await sharp({ create: { width: 500, height: 200, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    await expect(firmaTransparente(blanco)).rejects.toMatchObject({ statusCode: 400, code: 'FIRMA_VACIA' });
  });

  it('lo que no es una imagen (un PDF, un texto) se rechaza: 400', async () => {
    await expect(firmaTransparente(Buffer.from('%PDF-1.7 no soy una imagen'))).rejects.toMatchObject({ statusCode: 400, code: 'FIRMA_NO_VALIDA' });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(firmaTransparente(svg)).rejects.toMatchObject({ statusCode: 400, code: 'FIRMA_NO_VALIDA' });
  });
});

describe('la firma NO viaja a Certifex al emitir (Diego, 20/10: «solo el DNI»)', () => {
  const sinBloqueos = { bloqueadas: new Map(), programas: new Map([[1, { programa: { horas: 750, modulos: [{ titulo: 'Uno' }] }, formacion: { nombre: 'Diplomado X' } }]]) };

  it('está apagada', () => {
    expect(FIRMA_EN_DIPLOMA).toBe(false);
  });

  it('aunque quien emite traiga la firma, el item va sin `firmaAlumno` y el resultado dice que no la lleva', async () => {
    const firma = 'data:image/png;base64,iVBORw0KGgo=';
    const { porId } = await emitirConPrograma('ana@crm', [1, 2], { ...sinBloqueos, firmas: new Map([[1, firma], [2, firma]]) });
    const items = llamadas.find((l) => l.ruta === '/emitir').cuerpo.items;
    expect(items[0]).toEqual({ matriculaId: 1, programa: { horas: 750, modulos: [{ titulo: 'Uno' }] } });
    expect(items[1]).toEqual({ matriculaId: 2 });
    expect(JSON.stringify(items)).not.toContain('firmaAlumno');
    expect(porId.get(1)).toMatchObject({ ok: true, firmaAlumno: false, programa: { horas: 750 } });
    expect(porId.get(2)).toMatchObject({ ok: true, firmaAlumno: false });
  });

  it('quien llama sin `firmas` (la pestaña antigua) emite como antes', async () => {
    await emitirConPrograma('ana@crm', [2], sinBloqueos);
    expect(llamadas.find((l) => l.ruta === '/emitir').cuerpo.items).toEqual([{ matriculaId: 2 }]);
  });
});
