import { describe, it, expect } from 'vitest';
import { getLeadPriority, getPriorityStyle } from '@/modules/leads/lib/leadPriority';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

describe('getLeadPriority — state machine', () => {
  it('devuelve "normal" para input vacío/null', () => {
    expect(getLeadPriority(null)).toBe('normal');
    expect(getLeadPriority(undefined)).toBe('normal');
  });

  it('"overdue" gana sobre cualquier estado si el recordatorio ya venció', () => {
    const past = new Date(Date.now() - 2 * HOUR).toISOString();
    expect(getLeadPriority({ estado: 'nuevo', next_reminder_at: past })).toBe('overdue');
    expect(getLeadPriority({ estado: 'convertido', next_reminder_at: past })).toBe('overdue');
    expect(getLeadPriority({ estado: 'no_interesado', next_reminder_at: past })).toBe('overdue');
  });

  it('"overdue" NO se aplica si el recordatorio es futuro', () => {
    const future = new Date(Date.now() + 2 * HOUR).toISOString();
    expect(getLeadPriority({ estado: 'nuevo', next_reminder_at: future })).toBe('fresh');
  });

  it('ignora next_reminder_at inválido sin romper', () => {
    expect(getLeadPriority({ estado: 'nuevo', next_reminder_at: 'no-es-fecha' })).toBe('fresh');
    expect(getLeadPriority({ estado: 'nuevo', next_reminder_at: '' })).toBe('fresh');
  });

  it('estados terminales: convertido → won, no_interesado → lost', () => {
    expect(getLeadPriority({ estado: 'convertido' })).toBe('won');
    expect(getLeadPriority({ estado: 'no_interesado' })).toBe('lost');
  });

  it('soporta tanto el campo "estado" como "status"', () => {
    expect(getLeadPriority({ status: 'convertido' })).toBe('won');
    expect(getLeadPriority({ status: 'no_interesado' })).toBe('lost');
  });

  it('estado activo con >= 3 días de inactividad → urgent', () => {
    expect(getLeadPriority({ estado: 'nuevo', dias_inactivo: 3 })).toBe('urgent');
    expect(getLeadPriority({ estado: 'por_contactar', dias_inactivo: 5 })).toBe('urgent');
    expect(getLeadPriority({ estado: 'en_seguimiento', dias_inactivo: 10 })).toBe('urgent');
  });

  it('inactividad < 3 días NO marca urgent', () => {
    expect(getLeadPriority({ estado: 'nuevo', dias_inactivo: 2 })).toBe('fresh');
    expect(getLeadPriority({ estado: 'en_seguimiento', dias_inactivo: 2 })).toBe('inProgress');
  });

  it('"contactado" no se considera activo para urgent (intencional)', () => {
    // contactado >= 3 días NO es urgent — solo nuevo/por_contactar/en_seguimiento
    expect(getLeadPriority({ estado: 'contactado', dias_inactivo: 10 })).toBe('inProgress');
  });

  it('clasifica "fresh": nuevo / por_contactar sin inactividad', () => {
    expect(getLeadPriority({ estado: 'nuevo' })).toBe('fresh');
    expect(getLeadPriority({ estado: 'por_contactar' })).toBe('fresh');
    expect(getLeadPriority({ estado: 'nuevo', dias_inactivo: 0 })).toBe('fresh');
  });

  it('clasifica "inProgress": contactado / en_seguimiento sin inactividad', () => {
    expect(getLeadPriority({ estado: 'contactado' })).toBe('inProgress');
    expect(getLeadPriority({ estado: 'en_seguimiento' })).toBe('inProgress');
  });

  it('estado desconocido cae a "normal"', () => {
    expect(getLeadPriority({ estado: 'estado_inventado' })).toBe('normal');
    expect(getLeadPriority({})).toBe('normal');
  });

  it('dias_inactivo no numérico se trata como 0', () => {
    expect(getLeadPriority({ estado: 'nuevo', dias_inactivo: 'abc' })).toBe('fresh');
    expect(getLeadPriority({ estado: 'nuevo', dias_inactivo: null })).toBe('fresh');
  });
});

describe('getPriorityStyle', () => {
  it('devuelve estilo para cada prioridad conocida', () => {
    for (const p of ['overdue', 'urgent', 'fresh', 'inProgress', 'won', 'lost', 'normal']) {
      const style = getPriorityStyle(p);
      expect(style).toHaveProperty('label');
      expect(style).toHaveProperty('dotClass');
      expect(style).toHaveProperty('borderClass');
      expect(style).toHaveProperty('rowBgClass');
    }
  });

  it('prioridad desconocida cae al estilo "normal"', () => {
    expect(getPriorityStyle('xxx')).toBe(getPriorityStyle('normal'));
    expect(getPriorityStyle(undefined)).toBe(getPriorityStyle('normal'));
  });

  it('el tono dice qué hay que hacer, no cuál de los siete es', () => {
    // Antes se comprobaba el nombre del color de Tailwind —rojo, ámbar,
    // violeta—, que es justo lo que se ha quitado. Lo que no debe cambiar es el
    // significado: vencido alarma, urgente avisa, convertido es el final bueno.
    expect(getPriorityStyle('overdue').dotClass).toContain('destructive');
    expect(getPriorityStyle('urgent').dotClass).toContain('warning');
    // Verde y no violeta: convertido es una victoria y el color tiene que
    // decirlo. En violeta no se distinguía de «nuevo».
    expect(getPriorityStyle('won').dotClass).toContain('success');
  });

  it('los tres tonos que importan no se parecen entre sí', () => {
    const tonos = ['overdue', 'urgent', 'won', 'lost'].map((p) => getPriorityStyle(p).dotClass);
    expect(new Set(tonos).size).toBe(tonos.length);
  });

  it('el borde de la fila va con el mismo tono que el punto', () => {
    // Se descuadraban: el punto era ámbar y el borde de la fila, azul.
    for (const p of ['overdue', 'urgent', 'fresh', 'won']) {
      const { dotClass, borderClass } = getPriorityStyle(p);
      const tono = dotClass.replace('bg-', '').split('/')[0];
      expect(borderClass, 'el borde de ' + p + ' no usa ' + tono).toContain(tono);
    }
  });
});
