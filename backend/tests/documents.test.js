// Tests del modulo de documents — focus en funciones puras (validation
// schemas + template builders) que no requieren DB. Los tests de integracion
// (model.nextNumber etc.) requieren DB y se omiten cuando no hay tunel.
import { describe, it, expect } from 'vitest';
import {
  generateSchema,
  previewSchema,
  setNumberSchema,
  peekNumberQuerySchema,
  projectQuerySchema,
} from '../src/modules/documents/documents.validation.js';
import {
  buildInvoiceHtml,
  buildInvoicePreviewHtml,
  buildCertP1Html,
  buildCertP2Html,
  buildCertPreviewHtml,
} from '../src/modules/documents/documents.service.js';

// ──────────────────────────────────────────────────────────────────────────
// Validation schemas (Zod)
// ──────────────────────────────────────────────────────────────────────────

describe('generateSchema', () => {
  it('acepta payload valido con type invoice', () => {
    const r = generateSchema.safeParse({
      projectId: 1, type: 'invoice', data: { cliente_nombre: 'X' },
    });
    expect(r.success).toBe(true);
  });

  it('acepta type certificate', () => {
    const r = generateSchema.safeParse({ projectId: 1, type: 'certificate', data: {} });
    expect(r.success).toBe(true);
  });

  it('rechaza type invalido', () => {
    const r = generateSchema.safeParse({ projectId: 1, type: 'foo', data: {} });
    expect(r.success).toBe(false);
  });

  it('rechaza projectId no positivo', () => {
    const r = generateSchema.safeParse({ projectId: 0, type: 'invoice', data: {} });
    expect(r.success).toBe(false);
  });

  it('coerciona projectId desde string', () => {
    const r = generateSchema.safeParse({ projectId: '5', type: 'invoice', data: {} });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.projectId).toBe(5);
  });

  it('acepta numero_override numerico', () => {
    const r = generateSchema.safeParse({
      projectId: 1, type: 'invoice', data: {}, numero_override: 200,
    });
    expect(r.success).toBe(true);
  });

  it('acepta numero_override empty string (sin override)', () => {
    const r = generateSchema.safeParse({
      projectId: 1, type: 'invoice', data: {}, numero_override: '',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza numero_override < 1', () => {
    const r = generateSchema.safeParse({
      projectId: 1, type: 'invoice', data: {}, numero_override: 0,
    });
    expect(r.success).toBe(false);
  });

  it('default data a {} si falta', () => {
    const r = generateSchema.safeParse({ projectId: 1, type: 'invoice' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.data).toEqual({});
  });
});

describe('previewSchema', () => {
  it('acepta type + data', () => {
    const r = previewSchema.safeParse({ type: 'invoice', data: { foo: 'bar' } });
    expect(r.success).toBe(true);
  });

  it('rechaza type invalido', () => {
    const r = previewSchema.safeParse({ type: 'xxx', data: {} });
    expect(r.success).toBe(false);
  });
});

describe('setNumberSchema', () => {
  it('acepta value entero positivo', () => {
    const r = setNumberSchema.safeParse({ projectId: 1, type: 'invoice', value: 200 });
    expect(r.success).toBe(true);
  });

  it('coerciona value desde string', () => {
    const r = setNumberSchema.safeParse({ projectId: 1, type: 'invoice', value: '300' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.value).toBe(300);
  });

  it('rechaza value 0 o negativo', () => {
    const r0 = setNumberSchema.safeParse({ projectId: 1, type: 'invoice', value: 0 });
    const rNeg = setNumberSchema.safeParse({ projectId: 1, type: 'invoice', value: -1 });
    expect(r0.success).toBe(false);
    expect(rNeg.success).toBe(false);
  });
});

describe('peekNumberQuerySchema', () => {
  it('acepta query con projectId + type', () => {
    const r = peekNumberQuerySchema.safeParse({ projectId: '1', type: 'invoice' });
    expect(r.success).toBe(true);
  });

  it('rechaza sin type', () => {
    const r = peekNumberQuerySchema.safeParse({ projectId: '1' });
    expect(r.success).toBe(false);
  });
});

describe('projectQuerySchema', () => {
  it('type es opcional', () => {
    const r = projectQuerySchema.safeParse({ projectId: '1' });
    expect(r.success).toBe(true);
  });

  it('si type viene, debe ser valido', () => {
    const r = projectQuerySchema.safeParse({ projectId: '1', type: 'foo' });
    expect(r.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Template builders — sanity checks (no rompen, contienen campos clave)
// ──────────────────────────────────────────────────────────────────────────

describe('buildInvoiceHtml', () => {
  it('no tira con data minima', () => {
    expect(() => buildInvoiceHtml({ numero: 1, fecha: '2026-05-04', lineas: [] })).not.toThrow();
  });

  it('no tira con data vacia', () => {
    expect(() => buildInvoiceHtml({})).not.toThrow();
  });

  it('embebe el numero en el pill', () => {
    const html = buildInvoiceHtml({ numero: 193 });
    expect(html).toContain('class="numero-pill">193');
  });

  it('embebe el cliente_nombre cuando existe', () => {
    const html = buildInvoiceHtml({
      numero: 1,
      cliente_nombre: 'Acme S.A.',
      lineas: [],
    });
    expect(html).toContain('Acme S.A.');
  });

  it('omite linea de cliente_dni si no hay valor', () => {
    const html = buildInvoiceHtml({ numero: 1, cliente_nombre: 'X' });
    expect(html).not.toMatch(/CIF:\s*<\/div>|NIF:\s*<\/div>|DNI:\s*<\/div>/);
  });

  it('aplica modo compact con 7+ lineas', () => {
    const html = buildInvoiceHtml({
      numero: 1,
      lineas: Array.from({ length: 7 }, () => ({ descripcion: 'X', cantidad: 1, precio: 10 })),
    });
    expect(html).toContain('items-table compact');
  });

  it('aplica modo dense con 13+ lineas', () => {
    const html = buildInvoiceHtml({
      numero: 1,
      lineas: Array.from({ length: 13 }, () => ({ descripcion: 'X', cantidad: 1, precio: 10 })),
    });
    expect(html).toContain('items-table dense');
  });

  it('formatea fecha YYYY-MM-DD a DD-MM-YYYY', () => {
    const html = buildInvoiceHtml({ numero: 1, fecha: '2026-04-30' });
    expect(html).toContain('30-04-2026');
  });

  it('muestra IVA exento cuando flag activo', () => {
    const html = buildInvoiceHtml({
      numero: 1,
      lineas: [{ descripcion: 'X', cantidad: 1, precio: 100 }],
      iva_exento: true,
    });
    expect(html).toContain('IVA (exento)');
    expect(html).toContain('Operación exenta de IVA');
  });

  it('aplica IVA 21% cuando no exento', () => {
    const html = buildInvoiceHtml({
      numero: 1,
      lineas: [{ descripcion: 'X', cantidad: 1, precio: 100 }],
      iva_pct: 21,
      iva_exento: false,
    });
    expect(html).toContain('IVA (21%)');
    // 21% de 100 = 21 → "21,00" (con formato europeo). Sin verificar el €
    // que tiene encoding susceptible a diferencias entre sistemas.
    expect(html).toMatch(/21,00\s*€/);
  });

  it('detecta CIF para empresas', () => {
    const html = buildInvoiceHtml({ numero: 1, cliente_dni: 'A58432469' });
    expect(html).toMatch(/CIF:\s*A58432469/);
  });

  it('detecta NIE para extranjeros', () => {
    const html = buildInvoiceHtml({ numero: 1, cliente_dni: 'X1234567A' });
    expect(html).toMatch(/NIE:\s*X1234567A/);
  });

  it('detecta DNI para personas fisicas', () => {
    const html = buildInvoiceHtml({ numero: 1, cliente_dni: '12345678A' });
    expect(html).toMatch(/DNI:\s*12345678A/);
  });
});

describe('buildInvoicePreviewHtml', () => {
  it('genera HTML scrollable con auto-fit script', () => {
    const html = buildInvoicePreviewHtml({ numero: 1, lineas: [] });
    expect(html).toContain('--fit');
    expect(html).toContain('--zoom');
    expect(html).toContain('window.addEventListener(\'resize\'');
  });
});

describe('buildCertP1Html', () => {
  // El nombre del alumno sale UNA vez, y la linea de firma va vacia.
  //
  // Esta prueba pedia dos: el nombre en cursiva y ademas un `alumno-firma-label`
  // impreso sobre la linea de firma. Ese label lo quite en `fc6d205` a
  // proposito —el alumno firma A MANO, imprimirle el nombre encima es
  // justamente lo que no se quiere— y no toque la prueba. Lleva roja desde el 8
  // de mayo, y con ella el CI entero.
  //
  // Asi que ahora dice lo que el certificado hace, y comprueba las dos cosas
  // por separado en vez de contar apariciones: un contador «>= 2» tampoco
  // habria avisado si el nombre saliera dos veces en el sitio equivocado.
  it('el nombre del alumno sale una vez, en el bloque cursivo', async () => {
    const html = await buildCertP1Html({
      alumno_nombre: 'Juan Perez',
      alumno_dni: '12345678A',
      curso_nombre: 'Curso Test',
    });
    expect(html.match(/Juan Perez/g) || []).toHaveLength(1);
    expect(html).toMatch(/class="t alumno-name">Juan Perez</);
  });

  it('y NO se imprime sobre la linea de firma', async () => {
    // Si alguien repone el label, esto se cae y hay que decidirlo a proposito,
    // que es lo que la vez pasada no paso.
    const html = await buildCertP1Html({ alumno_nombre: 'Juan Perez' });
    expect(html).not.toContain('alumno-firma-label');
  });

  it('embebe DNI en el subtitle', async () => {
    const html = await buildCertP1Html({ alumno_dni: '12345678A' });
    expect(html).toContain('con DNI: 12345678A');
  });

  it('no tira con data vacia', async () => {
    await expect(buildCertP1Html({})).resolves.toBeDefined();
  });

  it('usa Pinyon Script para el alumno-name', async () => {
    const html = await buildCertP1Html({ alumno_nombre: 'X' });
    expect(html).toContain("'Pinyon Script'");
  });

  it('usa Sanchez para curso-nombre', async () => {
    const html = await buildCertP1Html({ curso_nombre: 'X' });
    expect(html).toContain("'Sanchez'");
  });
});

describe('buildCertP2Html', () => {
  it('lista modulos numerados', async () => {
    const html = await buildCertP2Html({
      curso_nombre: 'Test',
      modulos: ['Modulo A', 'Modulo B', 'Modulo C'],
    });
    expect(html).toContain('Módulo 1:</strong> Modulo A');
    expect(html).toContain('Módulo 2:</strong> Modulo B');
    expect(html).toContain('Módulo 3:</strong> Modulo C');
  });

  it('aplica modo compact con 13+ modulos', async () => {
    const modulos = Array.from({ length: 13 }, (_, i) => `Modulo ${i + 1}`);
    const html = await buildCertP2Html({ modulos });
    expect(html).toContain('modulos-list compact');
  });

  it('aplica modo dense con 19+ modulos', async () => {
    const modulos = Array.from({ length: 19 }, (_, i) => `Modulo ${i + 1}`);
    const html = await buildCertP2Html({ modulos });
    expect(html).toContain('modulos-list dense');
  });

  it('default modalidad Online si no se pasa', async () => {
    const html = await buildCertP2Html({ modulos: [] });
    expect(html).toContain('Online');
  });
});

describe('buildCertPreviewHtml', () => {
  it('combina ambas paginas con scope CSS por pagina', async () => {
    const html = await buildCertPreviewHtml({
      alumno_nombre: 'Test',
      curso_nombre: 'Test',
      modulos: ['M1'],
    });
    expect(html).toContain('cert-page-1');
    expect(html).toContain('cert-page-2');
    // Selectores deben estar prefijados con scope
    expect(html).toContain('.cert-page-1 .page');
    expect(html).toContain('.cert-page-2 .page');
  });

  it('incluye script de auto-fit', async () => {
    const html = await buildCertPreviewHtml({ modulos: [] });
    expect(html).toContain('--fit');
    expect(html).toContain('NATIVE_W');
  });
});
