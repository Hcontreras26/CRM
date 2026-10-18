import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  «Nueva factura» (y el abono) con las piezas comunes (#106): ningún
  desplegable del navegador (había nueve), cada campo con su Field y la clase
  común, y los conceptos se apilan en el móvil en vez de estrujarse en doce
  columnas.
*/

const ctx = vi.hoisted(() => ({
  proyecto: { id: 1, nombre: 'Psiko', sociedad_emisora_id: 7 },
  proyectos: [{ id: 1, nombre: 'Psiko', sociedad_emisora_id: 7 }, { id: 2, nombre: 'ISEIH', sociedad_emisora_id: 7 }],
}));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: ctx.proyecto, projects: ctx.proyectos, activeIssuerId: ctx.empresa ?? null }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
vi.mock('@/shared/api/client', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve(url.startsWith('/products')
      ? { success: true, data: [{ id: 5, nombre: 'Máster TCC', precio: 900 }] }
      : url.startsWith('/invoices/siguiente-numero')
        ? { success: true, data: { codigo: '2026/0001', siguiente: 1, serie: 'CEDIA', huecos: [] } }
        : { success: false })),
  },
}));
vi.mock('@/modules/conversions/api/conversions.api', () => ({
  conversionsApi: { byLead: vi.fn().mockResolvedValue({ success: true, data: [] }) },
}));
vi.mock('@/modules/invoices/api/invoices.api', () => ({
  invoicesApi: {
    getConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
    listIssuers: vi.fn().mockResolvedValue({ success: true, data: [{ id: 3, razon_social: 'Psiko SL', nif: 'B1', es_default: true }] }),
    listRegimenes: vi.fn().mockResolvedValue({ success: true, data: [{ id: 9, nombre: 'España', aplica_iva: true, iva_pct: 21 }] }),
    resolveRegimen: vi.fn().mockResolvedValue({ success: false }),
    list: vi.fn().mockResolvedValue({ success: true, data: [] }),
    leadFiscalData: vi.fn().mockResolvedValue({ success: false }),
  },
}));

import InvoiceCreatePage from '@/modules/invoices/pages/InvoiceCreatePage';
import FiscalDataDialog from '@/modules/invoices/components/FiscalDataDialog';

const abrir = async (ruta = '/facturas/nueva') => {
  const r = render(<MemoryRouter initialEntries={[ruta]}><InvoiceCreatePage /></MemoryRouter>);
  await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
  return r;
};

describe('Nueva factura (#106)', () => {
  beforeEach(() => { ctx.proyecto = { id: 1, nombre: 'Psiko', sociedad_emisora_id: 7 }; });

  it('no queda ningún desplegable del navegador: todos son los del CRM', async () => {
    const { container } = await abrir();
    expect(container.querySelector('select')).toBeNull();
    for (const nombre of ['Proyecto', 'Empresa que emite', 'IVA / Régimen fiscal', 'Método de pago', 'Moneda', 'Añadir un curso del catálogo']) {
      expect(screen.getByRole('combobox', { name: nombre })).toBeTruthy();
    }
  });

  it('los campos llevan la clase común (ni casillas propias ni bordes sueltos)', async () => {
    const { container } = await abrir();
    const propias = [...container.querySelectorAll('input:not([type=checkbox]), textarea')]
      .filter((el) => !el.className.includes('bg-muted/50'));
    expect(propias).toEqual([]);
  });

  it('los conceptos se apilan en el móvil y cada casilla dice qué es', async () => {
    const { container } = await abrir();
    const fila = screen.getByRole('textbox', { name: 'Concepto 1' }).parentElement;
    // 7 columnas en el móvil: cantidad, precio y subtotal, 2 cada uno (con 1, el
    // subtotal no cabía a 390 px).
    expect(fila.className).toMatch(/grid-cols-7 sm:grid-cols-12/);
    expect([...fila.children].find((h) => h.textContent.includes('0.00')).className).toMatch(/col-span-2 sm:col-span-1/);
    expect(screen.getByRole('spinbutton', { name: 'Cantidad del concepto 1' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Precio unitario del concepto 1' })).toBeTruthy();
    // La cabecera de columnas solo sale cuando cabe.
    const cabecera = [...container.querySelectorAll('span')].find((s) => s.textContent === 'Precio unit.').parentElement;
    expect(cabecera.className).toMatch(/hidden sm:grid/);
  });

  it('el abono marca lo obligatorio con el Field compartido y usa el desplegable del CRM', async () => {
    const { container } = await abrir('/facturas/nueva?tipo=rectificativa');
    expect(container.querySelector('select')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Factura a rectificar' })).toBeTruthy();
    expect(screen.getAllByText('(obligatorio)').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText(/Motivo del abono/).tagName).toBe('TEXTAREA');
  });

  it('sin campus puesto, pregunta cuál con el desplegable del CRM, ya enfocado', async () => {
    ctx.proyecto = { id: -1, nombre: 'Todos' };
    const { container } = await abrir();
    expect(container.querySelector('select')).toBeNull();
    const campus = screen.getByRole('combobox', { name: 'Campus de la factura' });
    expect(document.activeElement).toBe(campus);
  });

  // Visto en la prueba a mano: con CEDIA puesta (dos campus) salían todos.
  // Diego, 10/10: «campus solo de esa empresa».
  it('con una empresa puesta, el campus solo ofrece los de esa empresa', async () => {
    ctx.proyecto = { id: -1, nombre: 'Todos' };
    ctx.empresa = 7;
    ctx.proyectos = [
      { id: 1, nombre: 'Psiko', sociedad_emisora_id: 7 },
      { id: 2, nombre: 'ISEIH', sociedad_emisora_id: 7 },
      { id: 3, nombre: 'Academia IA', sociedad_emisora_id: 9 },
    ];
    try {
      await abrir();
      act(() => { screen.getByRole('combobox', { name: 'Campus de la factura' }).click(); });
      const opciones = screen.getAllByRole('option').map((o) => o.textContent);
      expect(opciones).toEqual(['Elige el campus…', 'Psiko', 'ISEIH']);
    } finally {
      ctx.empresa = null;
      ctx.proyectos = [{ id: 1, nombre: 'Psiko', sociedad_emisora_id: 7 }, { id: 2, nombre: 'ISEIH', sociedad_emisora_id: 7 }];
    }
  });

  it('cada etiqueta enlazada a su campo', async () => {
    const { container } = await abrir();
    const sueltas = [...container.querySelectorAll('label.mb-1\\.5.block.px-1')]
      .filter((l) => !l.htmlFor || !document.getElementById(l.htmlFor))
      .map((l) => l.textContent);
    expect(sueltas).toEqual([]);
  });

  // Visto en la prueba a mano: salía «España — 21% IVA — 21% IVA».
  it('el régimen que ya dice su IVA en el nombre no lo repite', async () => {
    const { invoicesApi } = await import('@/modules/invoices/api/invoices.api');
    const antes = invoicesApi.listRegimenes.getMockImplementation();
    invoicesApi.listRegimenes.mockResolvedValue({ success: true, data: [
      { id: 1, nombre: 'España — 21% IVA', aplica_iva: true, iva_pct: '21.00' },
      { id: 2, nombre: 'Fuera de la UE', aplica_iva: false, iva_pct: '0.00' },
      { id: 3, nombre: 'UE B2C', aplica_iva: true, iva_pct: '21.00' },
    ] });
    try {
      await abrir();
      act(() => { screen.getByRole('combobox', { name: 'IVA / Régimen fiscal' }).click(); });
      const opciones = screen.getAllByRole('option').map((o) => o.textContent);
      expect(opciones).toContain('España — 21% IVA');
      expect(opciones).toContain('Fuera de la UE — sin IVA');
      expect(opciones).toContain('UE B2C — 21% IVA');
      expect(opciones.some((o) => /IVA — 21% IVA/.test(o))).toBe(false);
    } finally {
      invoicesApi.listRegimenes.mockImplementation(antes);
    }
  });

  // Visto en la prueba a mano: iba al lado de la casilla, no debajo.
  it('la ayuda del número de factura va debajo de la casilla, como la de Field', async () => {
    await abrir();
    const ayuda = screen.getByText(/El siguiente disponible es/);
    expect(ayuda.tagName).toBe('P');
    expect(ayuda.className).toMatch(/mt-1 px-1 text-secundario text-muted-foreground/);
    // No comparte fila con la casilla.
    expect(ayuda.parentElement.contains(screen.getByLabelText('Número de factura'))).toBe(true);
    expect(ayuda.previousElementSibling.contains(screen.getByLabelText('Número de factura'))).toBe(true);
    expect(ayuda.previousElementSibling.className).toMatch(/flex/);
  });
});

describe('Datos fiscales para la factura (#106)', () => {
  const abrirDialogo = async () => {
    const r = render(<FiscalDataDialog projectId={1} leadId={9} defaultItems={[{ descripcion: 'Máster', cantidad: 1, precio_unitario: 900 }]}
      onClose={vi.fn()} onCreated={vi.fn()} />);
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    return r;
  };

  it('sin desplegables del navegador: la empresa y el método son los del CRM', async () => {
    const { container } = await abrirDialogo();
    expect(container.querySelector('select')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Empresa que emite' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Método de pago' })).toBeTruthy();
  });

  // Al pasar el desplegable a Field, el título del apartado y la etiqueta
  // decían lo mismo: «Empresa que emite» dos veces seguidas.
  it('«Empresa que emite» sale una vez: el apartado se llama «Emisor»', async () => {
    await abrirDialogo();
    expect(screen.getAllByText('Empresa que emite')).toHaveLength(1);
    expect(screen.getByText('Emisor')).toBeTruthy();
  });

  it('todos los campos con la clase común y su etiqueta, también las notas', async () => {
    const { container } = await abrirDialogo();
    const propias = [...container.querySelectorAll('input:not([type=checkbox]), textarea')]
      .filter((el) => !el.className.includes('bg-muted/50'));
    expect(propias).toEqual([]);
    expect(screen.getByLabelText('Notas (opcional)')).toBeTruthy();
  });

  it('los conceptos se apilan en el móvil y cada casilla dice qué es', async () => {
    await abrirDialogo();
    const fila = screen.getByRole('textbox', { name: 'Concepto 1' }).parentElement;
    expect(fila.className).toMatch(/grid-cols-6 sm:grid-cols-12/);
    expect(screen.getByRole('spinbutton', { name: 'Precio del concepto 1' })).toBeTruthy();
  });

  it('con «Emitir» apagado, dice al lado qué falta (antes el aviso no se veía nunca)', async () => {
    await abrirDialogo();
    expect(screen.getByRole('button', { name: /Emitir factura/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent)
      .toBe('Para emitirla, falta en «Cliente»: Nombre · NIF / DNI / CIF · Código postal · Dirección fiscal · Ciudad.');
  });

  it('cada etiqueta enlazada a su campo, también los datos del cliente', async () => {
    const { container } = await abrirDialogo();
    const sueltas = [...container.querySelectorAll('label.mb-1\\.5.block.px-1')]
      .filter((l) => !l.htmlFor || !document.getElementById(l.htmlFor))
      .map((l) => l.textContent);
    expect(sueltas).toEqual([]);
    expect(screen.getByLabelText(/^NIF \/ DNI \/ CIF/).tagName).toBe('INPUT');
  });
});
