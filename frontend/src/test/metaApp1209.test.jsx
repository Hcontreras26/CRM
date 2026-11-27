import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * La app de Meta desde la pantalla (CRM#1209): el ID y el secreto se validan en
 * el navegador antes de enviarse, el secreto no se vuelve a enseñar, la tarjeta
 * dice de dónde sale cada valor (pantalla, servidor o el de siempre) y «Quitar»
 * pregunta con el diálogo del CRM, no con `confirm()`.
 */

const { client } = vi.hoisted(() => ({
  client: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/shared/api/client', () => ({ default: client }));

import MetaAppCard from '@/modules/meta-ads/components/MetaAppCard';

const ajuste = (valor, origen, por_defecto, variable) => ({ valor, origen, por_defecto, variable });
const estado = (extra = {}) => ({
  falta_migracion: false,
  app: {
    configurada: false, origen: null, guardada: false, app_id: null, secreto_cola: null,
    puesta_por: null, actualizada_at: null, ultima_prueba: null, servidor_tiene_app: false,
    ...(extra.app || {}),
  },
  ajustes: {
    renovacion_activa: ajuste(false, 'defecto', false, 'META_TOKENS_RENOVACION_ACTIVA'),
    renovar_dias: ajuste(40, 'defecto', 40, 'META_TOKENS_RENOVAR_DIAS'),
    aviso_dias: ajuste(7, 'servidor', 7, 'META_TOKENS_AVISO_DIAS'),
    gasto_total_cada_horas: ajuste(12, 'defecto', 12, 'META_GASTO_TOTAL_CADA_HORAS'),
  },
  ajustes_cambiados_por: null,
  ajustes_cambiados_at: null,
  ultima_vuelta: null,
  tokens: extra.tokens || [],
});
const ok = (data) => Promise.resolve({ success: true, data });
const SECRETO = '0123456789abcdef0123456789abcdef';

beforeEach(() => {
  vi.clearAllMocks();
  client.get.mockImplementation(() => ok(estado()));
});

describe('sin app', () => {
  it('dice que no hay ninguna y enseña los pasos', async () => {
    render(<MetaAppCard />);
    expect(await screen.findByText('Sin configurar')).toBeTruthy();
    expect(screen.getByTestId('meta-app-origen').textContent).toContain('ninguna');
    expect(screen.getByText(/Configuración de la app › Básica/)).toBeTruthy();
  });

  it('no deja guardar un secreto mal copiado', async () => {
    render(<MetaAppCard />);
    await screen.findByText('Sin configurar');
    fireEvent.change(screen.getByLabelText('Identificador de la app'), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText('Clave secreta de la app'), { target: { value: 'no-es-un-secreto' } });
    expect(screen.getByText(/El secreto son 32 caracteres/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Guardar$/ }).disabled).toBe(true);
    expect(client.put).not.toHaveBeenCalled();
  });

  it('guarda el ID y el secreto y enseña la prueba', async () => {
    client.put.mockImplementation(() => ok({
      prueba: { ok: true, mensaje: 'Todo bien: Meta acepta la app.' },
      estado: estado({ app: { configurada: true, origen: 'pantalla', guardada: true, app_id: '1234567890', secreto_cola: 'cdef' } }),
    }));
    render(<MetaAppCard />);
    await screen.findByText('Sin configurar');
    fireEvent.change(screen.getByLabelText('Identificador de la app'), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText('Clave secreta de la app'), { target: { value: SECRETO } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar$/ }));
    await waitFor(() => expect(client.put).toHaveBeenCalledWith('/meta-ads/app', { app_id: '1234567890', app_secret: SECRETO }));
    expect(await screen.findByText('Todo bien: Meta acepta la app.')).toBeTruthy();
    // El secreto no se queda en el campo: solo su cola, en el texto de ayuda.
    expect(screen.getByLabelText('Clave secreta de la app').value).toBe('');
    expect(screen.getByLabelText('Clave secreta de la app').placeholder).toContain('cdef');
  });
});

describe('con app', () => {
  it('dice de dónde sale cada valor', async () => {
    client.get.mockImplementation(() => ok(estado({ app: { configurada: true, origen: 'servidor', app_id: '999999', servidor_tiene_app: true } })));
    render(<MetaAppCard />);
    expect((await screen.findByTestId('meta-app-origen')).textContent).toContain('la del servidor (.env)');
    expect(screen.getByText('del servidor (.env)')).toBeTruthy(); // aviso_dias
  });

  it('«Quitar» pregunta con el diálogo del CRM y no con confirm()', async () => {
    const confirmar = vi.spyOn(window, 'confirm');
    client.get.mockImplementation(() => ok(estado({ app: { configurada: true, origen: 'pantalla', guardada: true, app_id: '1234567890', secreto_cola: 'cdef' } })));
    client.delete.mockImplementation(() => ok(estado()));
    render(<MetaAppCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Quitar/ }));
    expect(screen.getByText('¿Quitar la app de Meta?')).toBeTruthy();
    expect(confirmar).not.toHaveBeenCalled();
    const botones = screen.getAllByRole('button', { name: 'Quitar' });
    fireEvent.click(botones[botones.length - 1]);
    await waitFor(() => expect(client.delete).toHaveBeenCalledWith('/meta-ads/app'));
  });

  it('pinta los tokens de los campus que caducan pronto con su error en castellano', async () => {
    client.get.mockImplementation(() => ok(estado({
      app: { configurada: true, origen: 'pantalla', guardada: true, app_id: '1234567890' },
      tokens: [{
        tipo: 'meta_ads', cuenta_id: 1, project_nombre: 'Psiko Aprende', nombre: 'Psiko Ads',
        expires_at: new Date(Date.now() + 3 * 86400000).toISOString(), sin_caducidad: false,
        renovado_at: null, revisado_at: null, estado: 'ok', error: null, caducado: false, caduca_pronto: true,
      }, {
        tipo: 'meta_ads', cuenta_id: 2, project_nombre: 'ISEIH', nombre: 'ISEIH Ads',
        expires_at: null, sin_caducidad: false, renovado_at: null, revisado_at: null,
        estado: 'error', error: 'El token del campus ya no vale', caducado: false, caduca_pronto: false,
      }],
    })));
    render(<MetaAppCard />);
    expect(await screen.findByText('Caduca pronto')).toBeTruthy();
    expect(screen.getByText('No se pudo renovar')).toBeTruthy();
    expect(screen.getByText('El token del campus ya no vale')).toBeTruthy();
  });

  it('no deja guardar un aviso con más días que la renovación', async () => {
    render(<MetaAppCard />);
    await screen.findByText('Sin configurar');
    fireEvent.change(screen.getByLabelText('Renovar cuando queden menos de'), { target: { value: '5' } });
    expect(screen.getByText('El aviso tiene que ser con menos días que la renovación.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Guardar la renovación/ }).disabled).toBe(true);
  });

  it('«Renovar ahora» llama al servidor y cuenta lo que hizo', async () => {
    client.get.mockImplementation(() => ok(estado({ app: { configurada: true, origen: 'pantalla', guardada: true, app_id: '1234567890' } })));
    client.post.mockImplementation(() => ok({ resumen: { revisadas: 2, renovadas: 1, fallidas: 0 }, estado: estado({ app: { configurada: true, origen: 'pantalla', guardada: true } }) }));
    render(<MetaAppCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Renovar ahora/ }));
    await waitFor(() => expect(client.post).toHaveBeenCalledWith('/meta-ads/app/renovar', {}));
  });
});
