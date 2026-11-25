import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * CRM#1099 · Integraciones › Google Analytics 4 y Search Console (Diego, 25/11).
 *
 * La tarjeta de cada campus: subir o pegar el JSON de la cuenta de servicio
 * (comprobado antes de mandarlo), el ID de propiedad de GA4 (solo números), la
 * propiedad de Search Console con desplegable, «Probar», «Quitar» con
 * confirmación, y la clave privada que no se pinta nunca.
 */

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('@/shared/api/client', () => ({ default: api }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
const permisos = vi.hoisted(() => ({ mapa: {} }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: (k) => permisos.mapa[k] === true }) }));

const { default: GoogleCredencialCard } = await import('@/modules/accounting/components/GoogleCredencialCard');
const { leerJsonCuenta, soloNumeros } = await import('@/modules/accounting/lib/cuentaServicioGoogle');

const CORREO = 'crm-lector@crm-analitica.iam.gserviceaccount.com';
const CUENTA = JSON.stringify({
  type: 'service_account',
  project_id: 'crm-analitica',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEsecreto\n-----END PRIVATE KEY-----\n',
  client_email: CORREO,
});

const sinConectar = (servicio, extra = {}) => ({
  servicio, conectada: false, estado: 'sin_conectar', client_email: null, puesta_por: null,
  actualizada_at: null, ultima_prueba: null, ultima_sincronizacion: null, sincronizacion_activa: true,
  otra_cuenta: null, ...extra,
});
const conectada = (servicio, extra = {}) => ({
  ...sinConectar(servicio), conectada: true, estado: 'conectado', client_email: CORREO,
  ...(servicio === 'ga4' ? { property_id: '123456789' } : { site_url: 'sc-domain:psikoaprende.com' }),
  ultima_prueba: { at: '2026-11-25T10:00:00Z', ok: true, mensaje: 'Conectado: lee la propiedad.' },
  ultima_sincronizacion: { at: '2026-11-25T09:00:00Z', estado: 'ok', error: null },
  ...extra,
});

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  permisos.mapa = { 'integrations.view': true, 'integrations.google': true };
});

describe('la comprobación del JSON en el navegador', () => {
  it('acepta una cuenta de servicio y dice qué es lo demás', () => {
    expect(leerJsonCuenta(CUENTA)).toMatchObject({ ok: true, correo: CORREO });
    expect(leerJsonCuenta('{')).toMatchObject({ ok: false, error: expect.stringMatching(/JSON válido/) });
    expect(leerJsonCuenta('{"web":{"client_id":"x"}}')).toMatchObject({ ok: false, error: expect.stringMatching(/cliente de OAuth/) });
    expect(leerJsonCuenta('{"type":"authorized_user"}')).toMatchObject({ ok: false, error: expect.stringMatching(/service_account/) });
    expect(leerJsonCuenta('{"type":"service_account","client_email":"a@b.c"}')).toMatchObject({ ok: false, error: expect.stringMatching(/private_key/) });
  });

  it('el ID de propiedad: solo números', () => {
    expect(soloNumeros('properties/123')).toBe('123');
    expect(soloNumeros('G-ABC12')).toBe('12');
  });
});

describe('GA4, para quien puede conectarla', () => {
  it('pegar el JSON enseña solo el correo, guarda con la propiedad y prueba sola', async () => {
    api.get.mockResolvedValue({ success: true, data: sinConectar('ga4') });
    api.put.mockResolvedValue({ success: true, data: conectada('ga4', { estado: 'sin_probar', ultima_prueba: null }) });
    api.post.mockResolvedValue({ success: true, data: { ok: true, mensaje: 'Conectado: lee la propiedad 123456789 (ayer, 57 sesiones).', estado: conectada('ga4') } });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/integrations/google/ga4?projectId=10'));

    // Los pasos, abiertos mientras no está conectada.
    expect(screen.getByText(/Google Analytics Data API/)).toBeTruthy();

    const guardar = screen.getByRole('button', { name: /Guardar/ });
    expect(guardar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Pegar el JSON de la cuenta de servicio'), { target: { value: CUENTA } });
    expect(screen.getByTestId('correo-cuenta').textContent).toBe(CORREO);
    // El texto con la clave no se queda en pantalla.
    expect(screen.getByLabelText('Pegar el JSON de la cuenta de servicio').value).toBe('');
    expect(document.body.textContent).not.toContain('PRIVATE KEY');

    fireEvent.change(screen.getByLabelText('ID de propiedad'), { target: { value: 'properties/123456789' } });
    expect(screen.getByLabelText('ID de propiedad').value).toBe('123456789');

    fireEvent.click(guardar);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/integrations/google/ga4', {
      projectId: 10, json: CUENTA, property_id: '123456789',
    }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/integrations/google/ga4/probar', { projectId: 10 }));
    expect(await screen.findByText(/ayer, 57 sesiones/)).toBeTruthy();
    expect(screen.getByText('Conectado')).toBeTruthy();
  });

  it('un JSON que no es de cuenta de servicio se dice al momento y no se puede guardar', async () => {
    api.get.mockResolvedValue({ success: true, data: sinConectar('ga4') });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Pegar el JSON de la cuenta de servicio'), { target: { value: '{"installed":{"client_id":"x"}}' } });
    expect(screen.getByRole('alert').textContent).toMatch(/cliente de OAuth/);
    fireEvent.change(screen.getByLabelText('ID de propiedad'), { target: { value: '1' } });
    expect(screen.getByRole('button', { name: /Guardar/ }).disabled).toBe(true);
  });

  it('subir el archivo .json', async () => {
    api.get.mockResolvedValue({ success: true, data: sinConectar('ga4') });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const archivo = new File([CUENTA], 'clave.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Archivo JSON de la cuenta de servicio'), { target: { files: [archivo] } });
    await waitFor(() => expect(screen.getByTestId('correo-cuenta').textContent).toBe(CORREO));
  });

  it('conectada: estado, última sincronización, copiar el correo, Probar y Quitar con confirmación', async () => {
    api.get.mockResolvedValue({ success: true, data: conectada('ga4', { estado: 'error' }) });
    api.post.mockResolvedValue({ success: true, data: {
      ok: false,
      mensaje: `La cuenta ${CORREO} no tiene acceso a la propiedad 123456789: añádela como «Lector» en GA4 › Administrar › Gestión de acceso a la propiedad.`,
      estado: conectada('ga4', { estado: 'error' }),
    } });
    api.delete.mockResolvedValue({ success: true, data: sinConectar('ga4') });
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    expect(await screen.findByText('Error')).toBeTruthy();
    expect(screen.getByText(/Última sincronización/).textContent).toMatch(/2026/);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar el correo de la cuenta' }));
    expect(writeText).toHaveBeenCalledWith(CORREO);

    fireEvent.click(screen.getByRole('button', { name: /Probar/ }));
    expect(await screen.findByText(/añádela como «Lector»/)).toBeTruthy();

    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/integrations/google/ga4?projectId=10'));
    expect(await screen.findByText('Sin conectar')).toBeTruthy();
    confirmar.mockRestore();
  });
});

describe('Search Console', () => {
  it('con la cuenta de GA4: busca las propiedades y guarda la elegida', async () => {
    api.get.mockResolvedValue({ success: true, data: sinConectar('gsc', { otra_cuenta: { servicio: 'ga4', client_email: CORREO } }) });
    api.post.mockImplementation(async (url) => (url.endsWith('/sitios')
      ? { success: true, data: [{ site_url: 'https://psikoaprende.com/', permiso: 'siteOwner' }, { site_url: 'sc-domain:psikoaprende.com', permiso: 'siteRestrictedUser' }] }
      : { success: true, data: { ok: true, mensaje: 'Conectado', estado: conectada('gsc') } }));
    api.put.mockResolvedValue({ success: true, data: conectada('gsc', { estado: 'sin_probar' }) });
    render(<GoogleCredencialCard projectId={10} servicio="gsc" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/integrations/google/gsc?projectId=10'));

    const buscar = screen.getByRole('button', { name: /Buscar mis propiedades/ });
    expect(buscar.disabled).toBe(true); // sin cuenta todavía
    fireEvent.click(screen.getByLabelText(/Usar la misma cuenta que Google Analytics 4/));
    expect(screen.getByTestId('correo-cuenta').textContent).toBe(CORREO);
    fireEvent.click(buscar);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/integrations/google/gsc/sitios', { projectId: 10, misma_cuenta: true }));
    fireEvent.change(await screen.findByLabelText('Propiedades que ve la cuenta'), { target: { value: 'sc-domain:psikoaprende.com' } });
    expect(screen.getByLabelText('Propiedad de Search Console').value).toBe('sc-domain:psikoaprende.com');

    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/integrations/google/gsc', {
      projectId: 10, misma_cuenta: true, site_url: 'sc-domain:psikoaprende.com',
    }));
  });
});

describe('quien solo ve Integraciones', () => {
  it('ve el estado y el correo, pero ni sube, ni guarda, ni prueba, ni quita', async () => {
    permisos.mapa = { 'integrations.view': true };
    api.get.mockResolvedValue({ success: true, data: conectada('ga4') });
    render(<GoogleCredencialCard projectId={10} servicio="ga4" />);
    expect(await screen.findByText('Conectado')).toBeTruthy();
    expect(screen.getByTestId('correo-cuenta').textContent).toBe(CORREO);
    expect(screen.queryByLabelText('Pegar el JSON de la cuenta de servicio')).toBeNull();
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Probar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull();
  });
});
