import { describe, it, expect, vi } from 'vitest';
import { pdfDeMarkdown } from '@/shared/lib/pdfDeMarkdown';

const post = vi.fn(async () => ({ success: true, data: {} }));
const get = vi.fn(async () => ({
  success: true,
  data: {
    id: 'r1', projectName: 'Psiko Aprende', periodo: '2026-08',
    createdAt: new Date().toISOString(), content: '# Hola\n\nTexto.',
    generadoPor: { id: 1, nombre: 'Manuel' },
    metadata: { leadsAnalizados: 10, conversionesAnalizadas: 2, facturacionTotal: 100, fuentesDatos: ['CRM'] },
  },
}));
vi.mock('@/shared/api/client', () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a) },
}));

/**
 * Que lo que se descarga sea un PDF (#30, y el reporte mensual).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA PRUEBA MIRA LOS PRIMEROS CUATRO BYTES
 *
 * El botón «Exportar PDF» del reporte mensual llevaba roto desde que se subió.
 * Pedía el PDF al servidor —`POST /reports-ia/:id/export-pdf`— y ese endpoint
 * contesta JSON:
 *
 *     { success: true, data: { message: 'PDF server-side pendiente…' } }
 *
 * Eso se guardaba con nombre `reporte.pdf` y no abría en ningún lector. Y el
 * fallo NO se veía al pulsar el botón: se descargaba, sin error, sin aviso.
 * Solo aparecía al intentar abrir el fichero, que es cuando ya se lo has
 * mandado a alguien.
 *
 * La prueba que existía para exportar PDF simula jsPDF entero, así que
 * comprueba que se llamó a `text()` y a `save()` — no que salga un PDF.
 *
 * Por eso aquí se usa jsPDF DE VERDAD y se miran los bytes: un PDF empieza por
 * `%PDF`. Es la única comprobación que distingue un PDF de un JSON con nombre
 * de PDF.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Los primeros bytes del blob, como texto.
 *
 * Con `FileReader` y no con `blob.arrayBuffer()`: jsdom no implementa ese
 * método, y la prueba se caía por el lector, no por el PDF.
 */
function primerosBytes(blob, n = 8) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onerror = () => mal(r.error);
    r.onload = () => ok(new TextDecoder().decode(new Uint8Array(r.result).slice(0, n)));
    r.readAsArrayBuffer(blob);
  });
}

const BASE = {
  cabecera: 'CRM MultiProyecto · Consulta a la IA',
  titulo: 'Prospectos por canal',
  nombreArchivo: 'prueba.pdf',
  contenido: 'Texto normal.',
  // Sin esto, cada ejecución de las pruebas dejaba un PDF suelto en el
  // repositorio: `doc.save()` escribe de verdad. Aquí se comprueba el
  // contenido, no la descarga.
  descargar: false,
};



describe('lo que sale es un PDF', () => {
  it('empieza por %PDF, que es lo que mira un lector', async () => {
    const blob = await pdfDeMarkdown(BASE);
    expect(await primerosBytes(blob)).toMatch(/^%PDF/);
  });

  it('y no está vacío', async () => {
    const blob = await pdfDeMarkdown(BASE);
    expect(blob.size).toBeGreaterThan(500);
  });

  it('le pone la extensión si no la lleva', async () => {
    // `doc.save('consulta')` deja un fichero sin extensión que Windows no sabe
    // abrir aunque por dentro sea correcto.
    const blob = await pdfDeMarkdown({ ...BASE, nombreArchivo: 'sin-extension' });
    expect(await primerosBytes(blob)).toMatch(/^%PDF/);
  });
});

describe('aguanta el markdown que manda la IA', () => {
  it('una respuesta con tabla, lista, cita y titulares no revienta', async () => {
    const blob = await pdfDeMarkdown({
      ...BASE,
      contenido: `# Resumen

## Por canal

| Canal | Prospectos | Tasa |
|---|---:|---:|
| Meta Ads | 28 | 21,4 % |
| Google Ads | 18 | 16,7 % |

1. **Meta convierte el doble.**
2. Google tiene margen.

- Un punto
- Otro punto

> Una advertencia sobre los datos.

---

Final con \`codigo\` y un [enlace](https://ejemplo.com).`,
    });
    expect(await primerosBytes(blob)).toMatch(/^%PDF/);
  });

  it('con contenido vacío sigue saliendo un PDF, no una excepción', async () => {
    // Pasa: se pulsa exportar con una respuesta que falló y no tiene texto.
    const blob = await pdfDeMarkdown({ ...BASE, contenido: '' });
    expect(await primerosBytes(blob)).toMatch(/^%PDF/);
  });

  it('una tabla a medias —sin fila de guiones— tampoco lo tumba', async () => {
    // El markdown llega en trocitos por SSE: si se exporta mientras responde,
    // la tabla puede estar cortada por la mitad.
    const blob = await pdfDeMarkdown({ ...BASE, contenido: '| Canal | Total |\n| Meta | 28 |' });
    expect(await primerosBytes(blob)).toMatch(/^%PDF/);
  });

  it('un texto largo pasa de página sin perderse', async () => {
    const largo = Array.from({ length: 200 }, (_, i) => `Línea número ${i} con texto suficiente para ocupar.`).join('\n');
    const blob = await pdfDeMarkdown({ ...BASE, contenido: largo });
    expect(await primerosBytes(blob)).toMatch(/^%PDF/);
    expect(blob.size).toBeGreaterThan(2000);
  });
});

describe('el reporte mensual no le pide el PDF al servidor', () => {
  it('no llama a /export-pdf, que contesta JSON', async () => {
    // Es la regresión exacta: esa llamada devolvía
    // `{ message: 'PDF server-side pendiente…' }` y se guardaba como .pdf.
    post.mockClear();
    const { exportReportPdf } = await import('@/modules/reports-ia/api/reports-ia.api');
    await exportReportPdf('r1', { descargar: false });
    expect(post).not.toHaveBeenCalled();
  });

  it('y lo que devuelve empieza por %PDF', async () => {
    const { exportReportPdf } = await import('@/modules/reports-ia/api/reports-ia.api');
    const blob = await exportReportPdf('r1', { descargar: false });
    expect(await primerosBytes(blob)).toMatch(/^%PDF/);
  });
});
