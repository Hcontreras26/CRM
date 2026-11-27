import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * CRM#1210 · La sincronización del campus y los umbrales del aviso, en la
 * tarjeta de GA4 / Search Console de Integraciones, sin `.env`.
 *
 *   · «Sincronizar este campus», «Sincronizar ahora», la próxima vuelta y la
 *     última, y de dónde sale lo que se usa (pantalla, servidor o de serie);
 *   · en Search Console, los umbrales con validación y una frase cada uno;
 *   · sin `integrations.google`, el estado sí, los interruptores no.
 */

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('@/shared/api/client', () => ({ default: api }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
const permisos = vi.hoisted(() => ({ mapa: {} }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: (k) => permisos.mapa[k] === true }) }));

const { default: GoogleCredencialCard } = await import('@/modules/accounting/components/GoogleCredencialCard');
const { errorDeUmbral } = await import('@/modules/accounting/components/GoogleSincronizacion');

const automatica = (extra = {}) => ({
  activa: false, origen: 'serie', variable: 'GA4_SYNC_ACTIVO', cambiada_por: null, cambiada_at: null,
  proxima_vuelta: null, cada_horas: 6, ...extra,
});
const UMBRALES = {
  valores: { clics: 30, impresiones: 30, minClics: 20, minImpresiones: 200 },
  origen: { clics: 'serie', impresiones: 'serie', minClics: 'serie', minImpresiones: 'serie' },
  de_serie: { clics: 30, impresiones: 30, minClics: 20, minImpresiones: 200 },
  cambiado_por: null, cambiado_at: null,
};
const conectada = (servicio, extra = {}) => ({
  servicio, conectada: true, estado: 'conectado', client_email: 'lector@x.iam.gserviceaccount.com',
  ...(servicio === 'ga4' ? { property_id: '123456789' } : { site_url: 'sc-domain:psikoaprende.com', umbrales_aviso: UMBRALES }),
  puesta_por: 'Ana', actualizada_at: '2026-11-25T10:00:00Z',
  ultima_prueba: null,
  ultima_sincronizacion: { at: '2026-11-25T09:00:00Z', estado: 'ok', error: null },
  sincronizacion_activa: false,
  sincronizacion: automatica(servicio === 'gsc' ? { variable: 'GSC_SYNC_ACTIVO' } : {}),
  otra_cuenta: null,
  ...extra,
});

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  permisos.mapa = { 'integrations.view': true, 'integrations.google': true };
});

describe('la sincronización del campus', () => {
  it('apagada de serie: lo dice, y al encenderla pinta la próxima vuelta y quién la encendió', async () => {
    api.get.mockResolvedValue({ success: true, data: conectada('ga4') });
    api.put.mockResolvedValue({ success: true, data: conectada('ga4', {
      sincronizacion_activa: true,
      sincronizacion: automatica({ activa: true, origen: 'pantalla', cambiada_por: 'Ana', cambiada_at: '2026-11-27T10:00:00Z', proxima_vuelta: '2026-11-27T16:00:00Z' }),
    }) });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    expect((await screen.findByTestId('automatica-origen')).textContent).toMatch(/Apagada de serie/);
    expect(screen.getByTestId('proxima-vuelta').textContent).toMatch(/apagada/);

    fireEvent.click(screen.getByRole('switch', { name: 'Sincronizar este campus' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/integrations/google/ga4/sincronizacion', { projectId: 10, activo: true }));
    await waitFor(() => expect(screen.getByTestId('automatica-origen').textContent).toMatch(/Encendida aquí por Ana/));
    expect(screen.getByTestId('proxima-vuelta').textContent).toMatch(/2026/);
    expect(screen.getByRole('switch', { name: 'Sincronizar este campus' }).checked).toBe(true);
    // Ya puesta aquí: se puede devolver al servidor.
    fireEvent.click(screen.getByRole('button', { name: /Dejar que lo decida el servidor \(GA4_SYNC_ACTIVO\)/ }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/integrations/google/ga4/sincronizacion', { projectId: 10, activo: null }));
  });

  it('encendida por el `.env`: dice que sale de la variable del servidor', async () => {
    api.get.mockResolvedValue({ success: true, data: conectada('ga4', { sincronizacion: automatica({ activa: true, origen: 'servidor', proxima_vuelta: '2026-11-27T16:00:00Z' }) }) });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    expect((await screen.findByTestId('automatica-origen')).textContent).toMatch(/variable GA4_SYNC_ACTIVO del servidor/);
  });

  it('«Sincronizar ahora» llama al campus y enseña el resultado', async () => {
    api.get.mockResolvedValue({ success: true, data: conectada('ga4') });
    api.post.mockResolvedValue({ success: true, data: { ok: true, mensaje: 'Hecho: datos de los últimos 90 días traídos de Google Analytics 4.', estado: conectada('ga4') } });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    fireEvent.click(await screen.findByRole('button', { name: /Sincronizar ahora/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/integrations/google/ga4/sincronizar', { projectId: 10 }));
    expect(await screen.findByText(/últimos 90 días/)).toBeTruthy();
  });

  it('sin `integrations.google`: ve el estado, pero ni interruptor ni «Sincronizar ahora» ni campos', async () => {
    permisos.mapa = { 'integrations.view': true };
    api.get.mockResolvedValue({ success: true, data: conectada('gsc') });
    render(<GoogleCredencialCard projectId={10} servicio="gsc" />);
    expect(await screen.findByTestId('automatica-origen')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sincronizar ahora/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Guardar umbrales/ })).toBeNull();
    expect(screen.queryByLabelText(/Caída de clics/)).toBeNull();
    expect(screen.getByTestId('umbrales-aviso').textContent).toMatch(/30 %/);
  });
});

describe('los umbrales del aviso de Search Console', () => {
  it('la comprobación del navegador, la misma que la del servidor', () => {
    expect(errorDeUmbral('30', 100)).toBeNull();
    expect(errorDeUmbral('0', 100)).toBeNull();
    expect(errorDeUmbral('', 100)).toMatch(/Falta/);
    expect(errorDeUmbral('150', 100)).toMatch(/Como mucho 100/);
    expect(errorDeUmbral('-3', 100)).toMatch(/negativo/);
    expect(errorDeUmbral('2,5', 100)).toMatch(/enteros/);
  });

  it('cada uno con su frase; un valor mal no deja guardar; bien, se guarda', async () => {
    api.get.mockResolvedValue({ success: true, data: conectada('gsc') });
    api.put.mockResolvedValue({ success: true, data: conectada('gsc', { umbrales_aviso: {
      ...UMBRALES, valores: { ...UMBRALES.valores, clics: 15 }, origen: { ...UMBRALES.origen, clics: 'pantalla' }, cambiado_por: 'Ana',
    } }) });
    render(<GoogleCredencialCard projectId={10} servicio="gsc" />);
    const clics = await screen.findByLabelText(/Caída de clics/);
    expect(screen.getByText(/Avisa si los clics de la semana caen más de este %/)).toBeTruthy();
    expect(screen.getByText(/de 5 a 3 es «−40 %»/)).toBeTruthy();
    const guardar = screen.getByRole('button', { name: /Guardar umbrales/ });
    expect(guardar.disabled).toBe(true); // nada cambiado

    fireEvent.change(clics, { target: { value: '150' } });
    expect(screen.getByRole('alert').textContent).toMatch(/Como mucho 100/);
    expect(guardar.disabled).toBe(true);

    fireEvent.change(clics, { target: { value: '15' } });
    expect(guardar.disabled).toBe(false);
    fireEvent.click(guardar);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/integrations/google/gsc/umbrales', {
      projectId: 10, umbrales: { clics: 15, impresiones: 30, minClics: 20, minImpresiones: 200 },
    }));
    expect(await screen.findByText(/Cambiados por Ana/)).toBeTruthy();
    expect(screen.getByText(/Caída de clics/).textContent).toMatch(/puesto aquí/);
    fireEvent.click(screen.getByRole('button', { name: /Usar los del servidor o los de serie/ }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/integrations/google/gsc/umbrales', { projectId: 10, umbrales: null }));
  });

  it('GA4 no tiene umbrales', async () => {
    api.get.mockResolvedValue({ success: true, data: conectada('ga4') });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    await screen.findByTestId('sincronizacion-ga4');
    expect(screen.queryByTestId('umbrales-aviso')).toBeNull();
  });
});
