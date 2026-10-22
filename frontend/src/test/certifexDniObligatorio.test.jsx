// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  El DNI es OBLIGATORIO para emitir el diploma (Diego, 20/10/2026: «revisa si los diplomas
  llevan el DNI porque es obligatorio»). Y la firma del alumno ya no va en el diploma («las
  firmas no van en los diplomas, solo el DNI»).

  Lo que se fija en la pantalla Diplomas, con la API simulada:
   · sin DNI (o con solo espacios), «Aprobar y emitir» de la fila no se puede pulsar y dice
     por qué; el chip «Sin DNI · Poner» dice que es obligatorio;
   · en un lote, lo que no tiene DNI se queda fuera y se dice cuántas; lo mismo en
     «Aprobados sin diploma»;
   · si el servidor lo bloquea por el DNI (FALTA_DNI), el aviso lo explica;
   · «Revisar datos» dice que el DNI es obligatorio, y no hay nada de la firma.
*/

const datos = vi.hoisted(() => {
  const fila = (id, nombre, dni, extra = {}) => ({
    matriculaId: id, centro: 'ISEIE', titular: { nombre, email: `alumno${id}@prueba.test`, dni },
    curso: { ref: 12, nombre: 'Máster en Prueba' }, notaFinal: 8, umbral: 5, completado: true,
    actividades: { total: 4, calificadas: 4 }, propuesto: true, nexpediente: null,
    solicitud: { en: '2026-10-20T09:00:00Z', nombre }, decision: null, crm: null, edicion: null, firma: null,
    programaCrm: { programa: { horas: 100, modulos: [{ titulo: 'Módulo uno' }] }, formacion: null, motivo: null, editado: false, elegida: false },
    ...extra,
  });
  const aprobada = { decision: { decision: 'aprobada', motivo: null, decididoPor: 'x', decididoEn: '2026-10-20T10:00:00Z', refExterna: null } };
  return {
    pendientes: [
      fila(1, 'Ana Con Documento', '12345678Z'),
      fila(2, 'Luis Sin Documento', null),
      fila(3, 'Eva Con Espacios', '   '),
    ],
    sinEmitir: [
      fila(4, 'Olga Aprobada Con', 'X1234567L', aprobada),
      fila(5, 'Pedro Aprobado Sin', null, aprobada),
    ],
  };
});

const api = vi.hoisted(() => ({ aprobarEmitir: vi.fn(), emitir: vi.fn(), toasts: [] }));

vi.mock('@/shared/hooks/useToast', () => ({
  toast: (t) => { api.toasts.push(t); },
  useToast: () => ({ toasts: [], addListener: () => () => {} }),
}));

vi.mock('@/modules/certifex/api/certifex.api', () => ({
  emisionesApi: {
    estado: async () => ({ data: { conectado: true, nombre: 'CRM de prueba' } }),
    centros: async () => ({ data: [] }),
    cursos: async () => ({ data: [] }),
  },
  diplomasApi: {
    resumen: async () => ({ data: { pendientes: 3, rechazadas: 0, vigentes: 0, revocados: 0, terminados: 0, porAvisar: 0, sinEmitir: 2, porEnviar: 0 } }),
    solicitudes: async () => ({ data: { filas: datos.pendientes, total: datos.pendientes.length, pagina: 1, tam: 50 } }),
    porAvisar: async () => ({ data: { porAvisar: [], sinEmitir: datos.sinEmitir } }),
    formaciones: async () => ({ data: { proyecto: null, motivo: null, formaciones: [] } }),
    aprobarEmitir: (...a) => api.aprobarEmitir(...a),
    emitir: (...a) => api.emitir(...a),
    firma: vi.fn(),
    subirFirma: vi.fn(),
  },
}));

const { default: CertifexDiplomasPage } = await import('@/modules/certifex/pages/CertifexDiplomasPage');

const ok = (ids) => ({ data: { resultados: ids.map((matriculaId) => ({ matriculaId, ok: true, fase: 'emitir', nexpediente: `CTF-2026-00000${matriculaId}-AAAA` })) } });

beforeEach(() => {
  api.toasts.length = 0;
  api.aprobarEmitir.mockReset().mockImplementation(async (ids) => ok(ids));
  api.emitir.mockReset().mockImplementation(async (ids) => ok(ids));
});
afterEach(cleanup);

async function abrir() {
  render(<MemoryRouter><CertifexDiplomasPage /></MemoryRouter>);
  await screen.findByText('Luis Sin Documento');
}

/** El botón «Aprobar y emitir» de la fila de ese alumno. */
const botonDe = (alumno) => within(screen.getByText(alumno).closest('tr')).getByRole('button', { name: /Aprobar y emitir/ });

describe('el DNI es obligatorio para emitir el diploma', () => {
  it('sin DNI (o con solo espacios), «Aprobar y emitir» de la fila no se pulsa y dice por qué', async () => {
    await abrir();
    expect(botonDe('Ana Con Documento').disabled).toBe(false);
    expect(botonDe('Luis Sin Documento').disabled).toBe(true);
    expect(botonDe('Eva Con Espacios').disabled).toBe(true);
    // El motivo, a la vista junto al botón (y en el `title`).
    expect(within(screen.getByText('Luis Sin Documento').closest('tr')).getByText('Pon el DNI para poder emitir')).toBeTruthy();
    expect(within(screen.getByText('Ana Con Documento').closest('tr')).queryByText('Pon el DNI para poder emitir')).toBeNull();
    expect(botonDe('Luis Sin Documento').getAttribute('title')).toMatch(/obligatorio/);
    // El chip dice que es obligatorio.
    expect(screen.getAllByRole('button', { name: /Sin DNI · Poner \(obligatorio\)/ })).toHaveLength(2);
    expect(screen.getByText('DNI 12345678Z')).toBeTruthy();
    // Pulsar el desactivado no hace nada.
    fireEvent.click(botonDe('Luis Sin Documento'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('en un lote, las que no tienen DNI se quedan fuera, se dice cuántas y solo se mandan las demás', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Elegir toda la página' }));
    const lote = await screen.findByRole('button', { name: 'Aprobar y emitir (1)' });
    expect(screen.getByText('2 sin DNI se quedan fuera (es obligatorio)')).toBeTruthy();
    fireEvent.click(lote);
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent).toContain('2 sin DNI no entran: el DNI es obligatorio en el diploma');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Emitir' }));
    await waitFor(() => expect(api.aprobarEmitir).toHaveBeenCalledTimes(1));
    expect(api.aprobarEmitir).toHaveBeenCalledWith([1]);
  });

  it('si ninguna de las elegidas tiene DNI, el lote no se puede pulsar', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Elegir a Luis Sin Documento' }));
    const lote = await screen.findByRole('button', { name: 'Aprobar y emitir (0)' });
    expect(lote.disabled).toBe(true);
    expect(screen.getByText('Ninguna tiene DNI: ponlo para poder emitir')).toBeTruthy();
  });

  it('«Aprobados sin diploma»: «Emitir» deja fuera lo que no tiene DNI y lo dice', async () => {
    await abrir();
    expect(screen.getByText('1 sin DNI no se emite (es obligatorio)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Poner el DNI de Pedro Aprobado Sin' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Emitir 1$/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent).toContain('1 sin DNI no entra');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Emitir' }));
    await waitFor(() => expect(api.emitir).toHaveBeenCalledWith([4]));
  });

  it('si el servidor lo bloquea por el DNI (FALTA_DNI), el aviso lo explica', async () => {
    const motivo = 'No se ha emitido: falta el DNI (o NIE o pasaporte) del alumno, que es obligatorio en el diploma. Ponlo con «Sin DNI · Poner» y vuelve a emitir.';
    api.aprobarEmitir.mockImplementation(async () => ({ data: { resultados: [{ matriculaId: 1, ok: false, fase: 'emitir_bloqueado', codigo: 'FALTA_DNI', error: motivo }] } }));
    await abrir();
    fireEvent.click(botonDe('Ana Con Documento'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Emitir' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Ana Con Documento');
    expect(alerta.textContent).toContain(motivo);
    const aviso = api.toasts.at(-1);
    expect(aviso.variant).toBe('destructive');
    expect(aviso.description).toMatch(/1 sin DNI, que es obligatorio/);
  });

  it('«Revisar datos» dice que el DNI es obligatorio, y la firma ya no aparece', async () => {
    await abrir();
    expect(screen.queryByText(/Sin firma/)).toBeNull();
    expect(screen.queryByText(/Con firma/)).toBeNull();
    fireEvent.click(within(screen.getByText('Luis Sin Documento').closest('tr')).getByRole('button', { name: /Sin DNI · Poner/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent).toContain('DNI / NIE / pasaporte (obligatorio)');
    expect(dialogo.textContent).toContain('Es obligatorio: sin él no se puede aprobar ni emitir.');
    expect(dialogo.textContent).toContain('Todavía no lo tiene: escríbelo para poder emitir.');
    expect(dialogo.textContent).not.toContain('escríbelo si debe salir');
    expect(dialogo.textContent).not.toContain('Firma del alumno');
    expect(dialogo.textContent).not.toMatch(/Subir firma/);
  });
});
