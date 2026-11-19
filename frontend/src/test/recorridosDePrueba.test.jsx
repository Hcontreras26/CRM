// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

/*
  Los recorridos guiados para probar las funciones nuevas de staging (CRM#856,
  gemela CRM-ISEIE#522). Lo que pide la issue:

    · que cada recorrido existe, con permisos del catálogo, y que alguna pantalla
      lo ofrece con «Ver cómo funciona»;
    · que cada anclaje de cada paso sigue en el código de su pantalla;
    · que sin permiso no sale, que apagada lo dice, que no se abre solo y que no
      tapa lo que señala ni deja capa al cerrarse.
*/

const { permisos, yo, api } = vi.hoisted(() => ({
  permisos: new Set(),
  yo: { current: { id: 7, role: 'admin' } },
  api: { get: vi.fn() },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: yo.current }) }));
vi.mock('@/shared/hooks/usePermission', () => ({
  default: () => ({ can: (k) => permisos.has(k), llevaEquipo: false }),
}));
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => api.get(...a) } }));

const { RECORRIDOS_PRUEBA, APAGADA, pasosDePrueba } = await import('@/shared/lib/recorridosDePrueba');
const { default: VerComoFunciona } = await import('@/shared/components/ui/VerComoFunciona');
const { CLAVES } = await import('../../../backend/src/modules/permissions/catalogo.js');

const SRC = path.resolve(__dirname, '..');
const BACKEND = path.resolve(__dirname, '../../../backend/src');
const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const nombreDe = (donde) => /^\[data-recorrido="([a-z0-9-]+)"\]$/.exec(donde)?.[1];
const lista = (p) => (p == null ? [] : Array.isArray(p) ? p : [p]);
const RECORRIDOS = Object.values(RECORRIDOS_PRUEBA);

function todoElCodigo(dir, extensiones, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['test', '__smoke__', 'node_modules'].includes(e.name)) todoElCodigo(p, extensiones, acc); }
    else if (extensiones.test(e.name)) acc.push(fs.readFileSync(p, 'utf8'));
  }
  return acc.join('\n');
}

/** Lo que contesta el servidor a cada pregunta de interruptor, encendido o no. */
function servidor(encendida) {
  api.get.mockImplementation(async (url) => {
    if (url === '/monitask/estado') {
      if (!encendida) throw Object.assign(new Error('Not found'), { status: 404 });
      return { success: true, data: { conectada: true } };
    }
    return { success: true, data: { activa: encendida, activo: encendida, paypal: encendida, santander: encendida } };
  });
}

beforeEach(() => {
  localStorage.clear();
  permisos.clear();
  yo.current = { id: 7, role: 'admin' };
  api.get.mockReset();
  document.body.innerHTML = '';
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('cada recorrido existe y alguna pantalla lo ofrece', () => {
  it('son los ocho de la issue', () => {
    expect(Object.keys(RECORRIDOS_PRUEBA).sort()).toEqual([
      'auditoria-facturacion', 'brevo-bloqueados', 'cobros-paypal', 'extractos-banco',
      'factura-automatica', 'factura-duplicada', 'informe-mensual', 'monitask',
    ]);
  });

  it.each(RECORRIDOS.map((r) => [r.id, r]))('%s: presenta, dice qué debe fallar, cómo dejarlo limpio y cómo repetirlo', (id, r) => {
    expect(r.id).toBe(id);
    expect(r.pasos[0].texto).toContain('{pasos}');
    expect(r.pasos.some((p) => /debe fallar/.test(p.texto)), 'falta lo que debe fallar a propósito').toBe(true);
    expect(r.pasos.at(-2).titulo).toBe('Dejarlo limpio');
    expect(r.pasos.at(-1).texto).toMatch(/«Ver cómo funciona»/);
    for (const p of r.pasos) {
      expect(p.titulo.length).toBeGreaterThan(3);
      // Frases cortas, de las que se leen en un cartel.
      expect(p.texto.length, `${id} · ${p.titulo}`).toBeLessThan(330);
      expect(p.texto).not.toMatch(/endpoint|payload|API key|token de acceso/i);
    }
  });

  it.each(RECORRIDOS.map((r) => [r.id, r]))('%s: sus permisos existen en el catálogo', (_id, r) => {
    for (const k of [...lista(r.permiso), ...r.pasos.flatMap((p) => lista(p.permiso))]) {
      expect(CLAVES.has(k), `${k} no está en el catálogo`).toBe(true);
    }
  });

  let codigo = '';
  it.each(RECORRIDOS.map((r) => [r.id]))('%s: alguna pantalla lo ofrece con «Ver cómo funciona»', (id) => {
    codigo ||= todoElCodigo(SRC, /\.(tsx|jsx)$/);
    expect(codigo).toMatch(new RegExp(`<VerComoFunciona[^>]*\\bid=(?:"${id}"|\\{[^}]*'${id}')`));
  });

  let servidorJs = '';
  it.each(RECORRIDOS.filter((r) => r.interruptor).map((r) => [r.id, r.interruptor]))('%s: su interruptor (%s) existe en el servidor', (_id, variable) => {
    servidorJs ||= todoElCodigo(BACKEND, /\.js$/);
    expect(servidorJs).toContain(variable);
  });
});

describe('cada anclaje sigue en el código de su pantalla', () => {
  it.each(RECORRIDOS.map((r) => [r.id, r]))('%s', (_id, r) => {
    const codigo = r.pantalla.map(leer).join('\n');
    for (const p of r.pasos.filter((x) => x.donde)) {
      const n = nombreDe(p.donde);
      expect(n, `«${p.donde}» no es un data-recorrido`).toBeTruthy();
      expect(codigo, `falta data-recorrido="${n}" en ${r.pantalla.join(', ')}`)
        .toMatch(new RegExp(`data-recorrido=(?:"${n}"|\\{[^}]*'${n}')`));
    }
  });
});

describe('cuándo sale', () => {
  it('sin el permiso del recorrido, ni botón ni recorrido', () => {
    render(<VerComoFunciona id="monitask" />);
    expect(screen.queryByRole('button', { name: /Ver cómo funciona/ })).toBeNull();
  });

  it('no se abre solo, ni la primera vez', () => {
    vi.useFakeTimers();
    permisos.add('reports.informe_mensual');
    render(<VerComoFunciona id="informe-mensual" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByRole('button', { name: 'Ver cómo funciona: Informe mensual para la gestoría' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('un paso sin su permiso no sale', () => {
    const titulos = (can) => pasosDePrueba(RECORRIDOS_PRUEBA['cobros-paypal'], can).map((p) => p.titulo);
    expect(titulos((k) => k === 'cobros_externos.view')).not.toContain('Registrar uno a mano');
    expect(titulos((k) => ['cobros_externos.view', 'cobros_externos.edit'].includes(k))).toContain('Registrar uno a mano');
  });

  it.each(RECORRIDOS.filter((r) => r.interruptor).map((r) => [r.id, r]))('%s: apagada, lo dice y no abre nada', async (id, r) => {
    for (const k of lista(r.permiso)) permisos.add(k);
    servidor(false);
    render(<VerComoFunciona id={id} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver cómo funciona/ }));
    expect(await screen.findByRole('status')).toHaveTextContent(APAGADA);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(RECORRIDOS.filter((r) => r.interruptor).map((r) => [r.id, r]))('%s: encendida, se abre al pulsar', async (id, r) => {
    for (const k of lista(r.permiso)) permisos.add(k);
    servidor(true);
    render(<VerComoFunciona id={id} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver cómo funciona/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText(APAGADA)).toBeNull();
  });

  it('sin interruptor (informe mensual), no pregunta al servidor', async () => {
    permisos.add('reports.informe_mensual');
    render(<VerComoFunciona id="informe-mensual" />);
    fireEvent.click(screen.getByRole('button', { name: /Ver cómo funciona/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('no tapa lo que señala ni deja capa', () => {
  it('el cartel va debajo de lo que señala', async () => {
    permisos.add('reports.informe_mensual');
    const ancla = document.createElement('div');
    ancla.setAttribute('data-recorrido', 'informe-periodo');
    ancla.getBoundingClientRect = () => ({ left: 40, top: 100, bottom: 140, right: 300, width: 260, height: 40, x: 40, y: 100 });
    document.body.appendChild(ancla);
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    render(<VerComoFunciona id="informe-mensual" />, { container: document.body.appendChild(document.createElement('div')) });
    fireEvent.click(screen.getByRole('button', { name: /Ver cómo funciona/ }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(document.getElementById('recorrido-titulo')).toHaveTextContent('El mes y la empresa');
    const top = parseFloat(screen.getByRole('dialog').style.top);
    expect(top).toBeGreaterThanOrEqual(140);
  });

  it('al cerrarlo no queda nada encima de la pantalla', async () => {
    permisos.add('reports.informe_mensual');
    render(<VerComoFunciona id="informe-mensual" />);
    fireEvent.click(screen.getByRole('button', { name: /Ver cómo funciona/ }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el recorrido' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[role="presentation"]')).toBeNull();
    expect(document.querySelector('.fixed')).toBeNull();
  });

  it('si con el recorrido puesto se abre otra ventana, se cierra', async () => {
    vi.useFakeTimers();
    permisos.add('reports.informe_mensual');
    render(<VerComoFunciona id="informe-mensual" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Ver cómo funciona/ })); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const otra = document.createElement('div');
    otra.setAttribute('role', 'alertdialog');
    document.body.appendChild(otra);
    act(() => { vi.advanceTimersByTime(500); });
    expect(document.getElementById('recorrido-titulo')).toBeNull();
  });
});
