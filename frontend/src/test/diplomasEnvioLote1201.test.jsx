// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  #1201 · Diplomas › Emitidos: «Enviar al alumno (n)» en lote.

  Lo que se fija, con la página de verdad y la API doblada (ningún correo sale de aquí):
   · de lo elegido, lo que no se puede enviar (ya enviado, sin correo en la ficha, emitido fuera
     del CRM, revocado, revertido) se queda fuera: la barra dice cuántos y por qué, el botón
     cuenta solo los enviables y el diálogo lo repite;
   · al confirmar, solo los enviables van al envío en lote del servidor, en tandas de 10;
   · una tanda que falla entera se apunta en las suyas y el lote sigue con la siguiente; lo que el
     servidor deja fuera (p. ej. «enviándose ya») sale con su motivo;
   · con el correo de Certifex apagado, el lote se para ahí y se dice;
   · si ninguno se puede enviar, el botón no deja.
*/

const datos = vi.hoisted(() => {
  const diploma = (n, extra = {}) => {
    const nexpediente = `PSIKO-2026-${String(n).padStart(6, '0')}-AAAA`;
    return {
      nexpediente, centro: 'PSIKO', alumno: `Alumna ${n}`, titulacion: 'Diplomado en Prueba', cursoRef: 12, emitidoEn: '2026-11-20T10:00:00Z',
      emitidaPor: 'u9@prueba.test (CRM ISEIH)', revocada: false, revocacion: null, verificarUrl: `https://certifex.test/c/${nexpediente}`,
      diplomaUrl: null, aviso: null, emitidoEnCrm: true, titularEmail: `alumna${n}@prueba.test`, sinCorreo: false, ...extra,
    };
  };
  const enviado = { resultado: 'enviado', en: '2026-11-21T10:00:00Z', por: 'u9@prueba.test (CRM ISEIH)' };
  return { diploma, enviado, diplomas: [], toasts: [], lote: [] };
});
const { diploma, enviado } = datos;
const exp = (n) => `PSIKO-2026-${String(n).padStart(6, '0')}-AAAA`;

vi.mock('@/shared/hooks/useToast', () => ({
  toast: (t) => { datos.toasts.push(t); },
  useToast: () => ({ toasts: [], addListener: () => () => {} }),
}));

vi.mock('@/modules/certifex/api/certifex.api', () => ({
  emisionesApi: {
    estado: async () => ({ data: { conectado: true, nombre: 'CRM de prueba' } }),
    centros: async () => ({ data: [{ codigo: 'PSIKO', nombre: 'Psiko Aprende', moodleUrl: null, logo: null, activo: true, cursos: 1, matriculados: 3, porDecidir: 0, aprobadasSinEmitir: 0, rechazadas: 0, emitidas: 3 }] }),
    cursos: async () => ({ data: [] }),
    diploma: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
  },
  diplomasApi: {
    resumen: async () => ({ data: { pendientes: 0, rechazadas: 0, vigentes: datos.diplomas.length, revocados: 0, terminados: 0, porAvisar: 0, sinEmitir: 0, porEnviar: 0 } }),
    solicitudes: async () => ({ data: { filas: [], total: 0, pagina: 1, tam: 50 } }),
    porAvisar: async () => ({ data: { porAvisar: [], sinEmitir: [] } }),
    diplomas: vi.fn(async () => ({ data: { filas: datos.diplomas, total: datos.diplomas.length, pagina: 1, tam: 50 } })),
    terminados: async () => ({ data: { filas: [], total: 0, pagina: 1, tam: 50 } }),
    formaciones: async () => ({ data: { proyecto: null, motivo: null, formaciones: [] } }),
    avisos: vi.fn(async () => { throw new Error('en lote no se usa el envío de uno'); }),
    avisosLote: vi.fn(),
  },
}));

const { default: CertifexDiplomasPage } = await import('@/modules/certifex/pages/CertifexDiplomasPage');
const { diplomasApi } = await import('@/modules/certifex/api/certifex.api');

afterEach(cleanup);
beforeEach(() => {
  datos.toasts = [];
  diplomasApi.avisos.mockClear();
  diplomasApi.diplomas.mockClear();
  diplomasApi.avisosLote.mockReset();
  diplomasApi.avisosLote.mockImplementation(async (exps) => ({
    data: { correoActivo: true, resultados: exps.map((n) => ({ nexpediente: n, ok: true, resultado: 'enviado' })), omitidos: [] },
  }));
});

async function abrirEmitidos() {
  render(<MemoryRouter initialEntries={['/?pestana=enviados']}><CertifexDiplomasPage soloEmitir /></MemoryRouter>);
  await screen.findByText(datos.diplomas[0].alumno);
}
const elegir = (n) => fireEvent.click(screen.getByRole('checkbox', { name: `Elegir ${exp(n)}` }));
const elegirTodo = () => fireEvent.click(screen.getByRole('checkbox', { name: 'Elegir toda la página' }));

describe('#1201 · «Enviar al alumno (n)» en Emitidos', () => {
  it('lote con mezcla: la barra dice cuántos se quedan fuera y por qué, y solo envía los enviables', async () => {
    datos.diplomas = [
      diploma(1), diploma(2), // enviables
      diploma(3, { aviso: enviado }), diploma(4, { aviso: enviado }), // ya enviados
      diploma(5, { sinCorreo: true, titularEmail: null }), // sin correo en la ficha
      diploma(6, { emitidoEnCrm: false, emitidaPor: 'secretaria@campus.test' }), // fuera del CRM
      diploma(7, { aviso: { ...enviado, resultado: 'correo_apagado' } }), // no salió: se vuelve a intentar
    ];
    await abrirEmitidos();
    elegirTodo();
    const estado = document.querySelector('[data-fuera="envio"]');
    expect(estado?.textContent).toBe('4 se quedan fuera: 2 ya enviados · 1 sin correo en la ficha · 1 emitido fuera del CRM');
    const boton = screen.getByRole('button', { name: /^Enviar al alumno \(3\)$/ });
    fireEvent.click(boton);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/Enviar 3 diplomas a sus alumnos/)).toBeTruthy();
    expect(dialogo.querySelector('[data-fuera="envio-dialogo"]')?.textContent)
      .toBe('Se quedan fuera, y no se les manda nada: 2 ya enviados · 1 sin correo en la ficha · 1 emitido fuera del CRM.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(diplomasApi.avisosLote).toHaveBeenCalledTimes(1));
    expect(diplomasApi.avisosLote).toHaveBeenCalledWith([exp(1), exp(2), exp(7)]);
    expect(diplomasApi.avisos).not.toHaveBeenCalled();
    await waitFor(() => expect(datos.toasts.at(-1)?.title).toBe('3 diplomas enviados al alumno'));
  });

  it('si ninguno de los elegidos se puede enviar, el botón no deja', async () => {
    datos.diplomas = [diploma(1, { aviso: enviado }), diploma(2, { revocada: true }), diploma(3, { anulada: true })];
    await abrirEmitidos();
    elegirTodo();
    expect(document.querySelector('[data-fuera="envio"]')?.textContent).toBe('3 se quedan fuera: 1 ya enviado · 1 revocado · 1 revertido');
    expect(screen.getByRole('button', { name: /^Enviar al alumno \(0\)$/ }).disabled).toBe(true);
  });

  it('en tandas de 10; una tanda que falla entera se apunta y el lote sigue; lo que el servidor deja fuera, con su motivo', async () => {
    datos.diplomas = Array.from({ length: 25 }, (_, i) => diploma(i + 1));
    diplomasApi.avisosLote.mockImplementation(async (exps) => {
      // La tanda se corta por tiempo (504): puede que alguno haya salido.
      if (exps.includes(exp(11))) throw Object.assign(new Error('Error 504'), { status: 504 });
      const [primero, ...resto] = exps;
      return {
        data: {
          correoActivo: true,
          resultados: resto.map((n) => ({ nexpediente: n, ok: true, resultado: 'enviado' })),
          omitidos: [{ nexpediente: primero, motivo: 'en_curso', error: 'Se está enviando ahora mismo desde otra pestaña o de otra persona.' }],
        },
      };
    });
    await abrirEmitidos();
    elegirTodo();
    fireEvent.click(screen.getByRole('button', { name: /^Enviar al alumno \(25\)$/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(diplomasApi.avisosLote).toHaveBeenCalledTimes(3));
    expect(diplomasApi.avisosLote.mock.calls.map((c) => c[0].length)).toEqual([10, 10, 5]);
    const aviso = await screen.findByRole('alert');
    // 10 de la tanda caída + 2 «enviándose ya» (la primera de cada tanda que sí contestó).
    expect(within(aviso).getByText('12 no se han podido completar')).toBeTruthy();
    expect(within(aviso).getAllByText('Puede que algunos se hayan enviado: refresca la lista antes de volver a enviar.')).toHaveLength(10);
    expect(within(aviso).getAllByText(/Se está enviando ahora mismo/)).toHaveLength(2);
    expect(datos.toasts.at(-1)).toMatchObject({ title: '13 diplomas enviados al alumno', description: '12 sin enviar: el motivo, en pantalla.' });
  });

  it('con el correo de Certifex apagado, se para en esa tanda y lo dice', async () => {
    datos.diplomas = Array.from({ length: 15 }, (_, i) => diploma(i + 1));
    diplomasApi.avisosLote.mockImplementation(async (exps) => ({
      data: { correoActivo: false, resultados: exps.map((n) => ({ nexpediente: n, ok: true, resultado: 'correo_apagado' })), omitidos: [] },
    }));
    await abrirEmitidos();
    elegirTodo();
    fireEvent.click(screen.getByRole('button', { name: /^Enviar al alumno \(15\)$/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(datos.toasts.at(-1)?.title).toBe('Aprobado, pero el correo está apagado'));
    expect(diplomasApi.avisosLote).toHaveBeenCalledTimes(1);
    expect(datos.toasts.at(-1).description).toMatch(/5 no se han intentado/);
    expect(await screen.findByText(/el correo está apagado en el servidor de Certifex/)).toBeTruthy();
    // QA en navegador: la alerta cuenta DIPLOMAS (5 sin intentar), no líneas («1 no se ha…»).
    const aviso = await screen.findByRole('alert');
    expect(within(aviso).getByText('5 no se han podido completar')).toBeTruthy();
    expect(within(aviso).getByText('5 más:')).toBeTruthy();
  });

  it('elegir uno a uno también cuenta: uno enviable y uno ya enviado', async () => {
    datos.diplomas = [diploma(1), diploma(2, { aviso: enviado })];
    await abrirEmitidos();
    elegir(1);
    expect(document.querySelector('[data-fuera="envio"]')).toBeNull();
    elegir(2);
    expect(document.querySelector('[data-fuera="envio"]')?.textContent).toBe('1 se queda fuera: 1 ya enviado');
    expect(screen.getByRole('button', { name: /^Enviar al alumno \(1\)$/ })).toBeTruthy();
  });

  it('QA: entregado por Certifex sin aviso del CRM también se queda fuera', async () => {
    datos.diplomas = [diploma(1), diploma(2, { entregado: true })];
    await abrirEmitidos();
    elegirTodo();
    expect(document.querySelector('[data-fuera="envio"]')?.textContent).toBe('1 se queda fuera: 1 ya entregado por Certifex');
    expect(screen.getByRole('button', { name: /^Enviar al alumno \(1\)$/ })).toBeTruthy();
  });

  it('QA: sin red, «No hay conexión con el servidor» (no «Failed to fetch»); la lista se recarga sola; un 4xx sale tal cual', async () => {
    datos.diplomas = Array.from({ length: 12 }, (_, i) => diploma(i + 1));
    diplomasApi.avisosLote.mockImplementation(async (exps) => {
      // Sin red: el navegador rechaza con «TypeError: Failed to fetch», en inglés.
      if (exps.includes(exp(1))) throw new TypeError('Failed to fetch');
      throw Object.assign(new Error('Ese diploma se está enviando ahora'), { status: 409 });
    });
    await abrirEmitidos();
    const antes = diplomasApi.diplomas.mock.calls.length;
    elegirTodo();
    fireEvent.click(screen.getByRole('button', { name: /^Enviar al alumno \(12\)$/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enviar' }));
    const aviso = await screen.findByRole('alert');
    expect(within(aviso).getAllByText('No hay conexión con el servidor: refresca la lista antes de volver a enviar.')).toHaveLength(10);
    expect(within(aviso).queryByText(/Failed to fetch/)).toBeNull();
    expect(within(aviso).getAllByText('Ese diploma se está enviando ahora')).toHaveLength(2);
    await waitFor(() => expect(diplomasApi.diplomas.mock.calls.length).toBeGreaterThan(antes));
  });
});
