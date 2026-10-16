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
  useProjectContext: () => ({ activeProject: ctx.proyecto, projects: ctx.proyectos }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
vi.mock('@/shared/api/client', () => ({
  default: {
    get: vi.fn((url) => Promise.resolve(url.startsWith('/products')
      ? { success: true, data: [{ id: 5, nombre: 'Máster TCC', precio: 900 }] }
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
    expect(fila.className).toMatch(/grid-cols-6 sm:grid-cols-12/);
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
});
