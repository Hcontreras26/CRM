import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #199 · la ficha de una matrícula, en panel lateral (ideas de Diego del 01/10):
 * cabecera, datos de la persona con copiar, documentos con visor y «Reemplazar»,
 * vínculos, historial y las acciones según el estado.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn(), patch: vi.fn() }, API_BASE_URL: '/crm/api' }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

import MatriculaDetail from '@/modules/matriculas/components/MatriculaDetail';

const FICHA = {
  id: 1, estado: 'solicitud_admision', lead_id: 3912, conversion_id: null,
  lead_nombre: 'María López', lead_email: 'maria@x.es', lead_telefono: '+34600111222',
  curso: 'Máster en Psicología Clínica', campus_nombre: 'Psiko Aprende', gestora_nombre: 'Ana',
  source: 'webhook', recibida_at: '2026-10-01T07:12:00Z',
  dni_doc_url: '/api/matriculas/1/doc/dni?exp=1&sig=a', documentos_formato: { dni: 'imagen' },
  titulo_doc_url: '/api/matriculas/1/doc/titulo?exp=1&sig=b',
  datos_admision: { documento_tipo: 'DNI', documento: '11111111A', fecha_nacimiento: '1995-04-12', direccion: 'Calle 1, Madrid', pais: 'España', estudios: 'Grado' },
  historial: [
    { evento: 'recibida', creado_at: '2026-10-01T07:12:00Z' },
    { evento: 'estado', estado: 'datos_validados', usuario: 'Mireia', creado_at: '2026-10-01T09:40:00Z' },
    { evento: 'documento', documento: 'dni_dorso', reemplazo: false, usuario: 'Mireia', creado_at: '2026-10-02T08:00:00Z' },
    { evento: 'documento', documento: 'dni', reemplazo: true, usuario: 'Ana', creado_at: '2026-10-03T08:00:00Z' },
    { evento: 'estado', estado: 'rechazada', motivo: 'El título no se lee', usuario: 'Mireia', creado_at: '2026-10-04T08:00:00Z' },
  ],
};

const abrir = (matricula = FICHA, onEstado = vi.fn()) => {
  render(<MemoryRouter><MatriculaDetail matricula={matricula} onClose={() => {}} onChange={() => {}} onEstado={onEstado} /></MemoryRouter>);
  return onEstado;
};
const boton = (nombre) => screen.queryByRole('button', { name: new RegExp(nombre) });

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async () => ({ success: true, data: FICHA }));
});

describe('las acciones de la ficha según el estado', () => {
  it('en Solicitud: «Validar datos» (pasa a Datos validados) y «Rechazar»', () => {
    const onEstado = abrir({ ...FICHA, estado: 'solicitud_admision' });
    expect(boton('Validar matrícula')).toBeNull();
    fireEvent.click(boton('Validar datos'));
    expect(onEstado).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'datos_validados');
    expect(boton('Rechazar')).not.toBeNull();
  });

  it.each(['datos_validados', 'pendiente'])('en %s: «Validar matrícula» (pasa a Validada) y «Rechazar»', async (estado) => {
    get.mockImplementation(async () => ({ success: true, data: { ...FICHA, estado } }));
    const onEstado = abrir({ ...FICHA, estado });
    expect(boton('Validar datos')).toBeNull();
    fireEvent.click(boton('Validar matrícula'));
    expect(onEstado).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'validada');
    expect(boton('Rechazar')).not.toBeNull();
  });

  it('en Validada: solo «Rechazar»', async () => {
    get.mockImplementation(async () => ({ success: true, data: { ...FICHA, estado: 'validada' } }));
    abrir({ ...FICHA, estado: 'validada' });
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(boton('Validar datos')).toBeNull();
    expect(boton('Validar matrícula')).toBeNull();
    expect(boton('Rechazar')).not.toBeNull();
  });

  it('en Rechazada: ninguna, y se ve el motivo', async () => {
    const rechazada = { ...FICHA, estado: 'rechazada', motivo_rechazo: 'El DNI no se lee' };
    get.mockImplementation(async () => ({ success: true, data: rechazada }));
    abrir(rechazada);
    expect(boton('Validar')).toBeNull();
    expect(boton('Rechazar')).toBeNull();
    expect(screen.getByText(/El DNI no se lee/)).toBeTruthy();
  });
});

describe('la ficha en panel lateral, como la de los prospectos', () => {
  it('cabecera: el nombre, el estado, el curso y el campus (sin un punto suelto)', async () => {
    abrir();
    expect(screen.getByRole('heading', { name: 'María López' })).toBeTruthy();
    expect(screen.getAllByText('Solicitud admisión').length).toBeGreaterThan(0);
    expect(screen.getByText('Máster en Psicología Clínica · Psiko Aprende')).toBeTruthy();
  });

  it('datos de la persona, del formulario, con botón para copiar', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    abrir();
    expect(screen.getByText('DNI 11111111A')).toBeTruthy();
    expect(screen.getByText('12/04/1995')).toBeTruthy();
    expect(screen.getByText('Calle 1, Madrid, España')).toBeTruthy();
    expect(screen.getByText('Grado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar teléfono' }));
    expect(writeText).toHaveBeenCalledWith('+34600111222');
  });

  it('documentos: miniatura, visor grande y «Reemplazar»; el aviso si no abre', async () => {
    abrir();
    // Los cinco de Diego, todos con su botón: «Reemplazar» en los que hay y «Subir» en los que faltan.
    expect(screen.getAllByText('Reemplazar').length).toBe(2);
    expect(screen.getAllByText('Subir').length).toBe(3);
    expect(screen.getByLabelText('Subir DNI (detrás)')).toBeTruthy();
    expect(screen.getByLabelText('Subir Foto')).toBeTruthy();
    expect(screen.queryByText(/llega con el formulario/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver DNI (delante)' }));
    expect(screen.getByRole('dialog', { name: 'Visor: DNI (delante)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar visor' }));
    expect(screen.queryByRole('dialog', { name: /Visor/ })).toBeNull();
    // Una imagen que no carga: el texto de Diego.
    fireEvent.error(screen.getByAltText('DNI (delante)'));
    expect(screen.getByText('No se pudo abrir el DNI (delante). Vuelve a intentarlo; si sigue, súbelo de nuevo.')).toBeTruthy();
  });

  it('el documento se pide dentro del CRM (/crm/api/…), no fuera (/api/…, 404)', async () => {
    abrir();
    expect(screen.getByAltText('DNI (delante)').getAttribute('src')).toBe('/crm/api/matriculas/1/doc/dni?exp=1&sig=a');
  });

  it('un PDF se abre en el visor de PDF', async () => {
    const conPdf = { ...FICHA, documentos_formato: { dni: 'pdf' } };
    get.mockImplementation(async () => ({ success: true, data: conPdf }));
    abrir(conPdf);
    fireEvent.click(screen.getByRole('button', { name: 'Ver DNI (delante)' }));
    expect(screen.getByTitle('DNI (delante)').tagName).toBe('IFRAME');
  });

  it('vínculos: su prospecto, su venta y su gestora', async () => {
    abrir({ ...FICHA, conversion_id: 44 });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/matriculas/1'));
    expect(screen.getByRole('link', { name: /Ver prospecto/ }).getAttribute('href')).toBe('/prospectos/3912');
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('historial: cada cosa que le ha pasado, con quién y cuándo, en hora de Madrid', async () => {
    abrir();
    expect(screen.getByText(/Recibida por el formulario el 01 oct 2026, 0?9:12/)).toBeTruthy();
    expect(screen.getByText(/Datos validados por Mireia el 01 oct 2026, 11:40/)).toBeTruthy();
    expect(screen.getByText(/DNI \(detrás\) subido por Mireia el 02 oct 2026/)).toBeTruthy();
    expect(screen.getByText(/DNI \(delante\) reemplazado por Ana el 03 oct 2026/)).toBeTruthy();
    expect(screen.getByText(/Rechazada por Mireia el 04 oct 2026, 10:00\. Motivo: El título no se lee/)).toBeTruthy();
  });
});
