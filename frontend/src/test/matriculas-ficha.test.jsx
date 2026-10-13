import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * #199 · las acciones de la ficha, según el estado (ideas de Diego del 01/10):
 * en Solicitud, «Validar datos»; en Datos validados o Pendiente, «Validar
 * matrícula»; en cualquiera, «Rechazar», que pide el motivo.
 */

vi.mock('@/shared/api/client', () => ({ default: { post: vi.fn(), patch: vi.fn() } }));

import MatriculaDetail from '@/modules/matriculas/components/MatriculaDetail';

const abrir = (estado, onEstado = vi.fn()) => {
  render(<MatriculaDetail matricula={{ id: 1, estado, lead_nombre: 'María López' }} onClose={() => {}} onChange={() => {}} onEstado={onEstado} />);
  return onEstado;
};
const boton = (nombre) => screen.queryByRole('button', { name: new RegExp(nombre) });

describe('las acciones de la ficha según el estado', () => {
  it('en Solicitud: «Validar datos» (pasa a Datos validados) y «Rechazar»', () => {
    const onEstado = abrir('solicitud_admision');
    expect(boton('Validar matrícula')).toBeNull();
    fireEvent.click(boton('Validar datos'));
    expect(onEstado).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'datos_validados');
    expect(boton('Rechazar')).not.toBeNull();
  });

  it.each(['datos_validados', 'pendiente'])('en %s: «Validar matrícula» (pasa a Validada) y «Rechazar»', (estado) => {
    const onEstado = abrir(estado);
    expect(boton('Validar datos')).toBeNull();
    fireEvent.click(boton('Validar matrícula'));
    expect(onEstado).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'validada');
    expect(boton('Rechazar')).not.toBeNull();
  });

  it('en Validada: solo «Rechazar»', () => {
    abrir('validada');
    expect(boton('Validar datos')).toBeNull();
    expect(boton('Validar matrícula')).toBeNull();
    expect(boton('Rechazar')).not.toBeNull();
  });

  it('en Rechazada: ninguna', () => {
    abrir('rechazada');
    expect(boton('Validar')).toBeNull();
    expect(boton('Rechazar')).toBeNull();
  });

  it('«Rechazar» pide el motivo (lo abre la página con su diálogo)', () => {
    const onEstado = abrir('pendiente');
    fireEvent.click(boton('Rechazar'));
    expect(onEstado).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'rechazada');
  });
});
