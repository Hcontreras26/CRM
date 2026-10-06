import { describe, it, expect } from 'vitest';
import {
  accessStateOf,
  formatFecha,
  hoyISO,
  roleKeyOf,
  roleLabelOf,
  ASSIGNABLE_ROLES,
} from '@/modules/users/lib/usersUi';
import { getInitials, avatarColorFor, AVATAR_COLORS } from '@/shared/lib/ui';

describe('accessStateOf', () => {
  it('separa «nunca ha entrado» de «activo»', () => {
    // El caso que importa: el alta manda un enlace de 24h y hoy el CRM no puede
    // mandar correo. Quien nunca entro puede ser alguien que se quedo fuera.
    expect(accessStateOf({ active: true, last_login_at: null })).toBe('nunca_entro');
    expect(accessStateOf({ active: true, last_login_at: '2026-08-01T10:00:00Z' })).toBe('activo');
  });

  it('desactivado gana sobre cualquier otra cosa', () => {
    expect(accessStateOf({ active: false, last_login_at: null })).toBe('inactivo');
    expect(accessStateOf({ active: false, last_login_at: '2026-08-01T10:00:00Z' })).toBe('inactivo');
  });
});

describe('formatFecha', () => {
  it('no desplaza el dia por zona horaria', () => {
    // new Date('2026-08-19') se interpreta como UTC y en España se pintaria
    // como el 18: un dia de ausencia de menos. Por eso se parte el texto.
    expect(formatFecha('2026-08-19')).toBe('19/08/2026');
    expect(formatFecha('2026-01-01')).toBe('01/01/2026');
    expect(formatFecha('2026-12-31')).toBe('31/12/2026');
  });

  it('acepta un timestamp completo quedandose con la fecha', () => {
    expect(formatFecha('2026-08-19T23:30:00.000Z')).toBe('19/08/2026');
  });

  it('devuelve un guion si no hay fecha', () => {
    expect(formatFecha(null)).toBe('—');
    expect(formatFecha(undefined)).toBe('—');
    expect(formatFecha('')).toBe('—');
  });
});

describe('hoyISO', () => {
  it('da YYYY-MM-DD con ceros a la izquierda', () => {
    expect(hoyISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('usa la fecha local, no la UTC', () => {
    const ahora = new Date();
    const esperado = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    expect(hoyISO()).toBe(esperado);
  });
});

describe('roleKeyOf / roleLabelOf', () => {
  it('a quien lleva colaboraciones se la llama por lo que hace', () => {
    expect(roleKeyOf({ role: 'gestor', gestor_colaboraciones: true })).toBe('colaboraciones');
    expect(roleLabelOf({ role: 'gestor', gestor_colaboraciones: true })).toBe('Colaboraciones');
  });

  it('sin el flag, manda el rol', () => {
    expect(roleKeyOf({ role: 'gestor' })).toBe('gestor');
    expect(roleKeyOf({ role: 'admin', gestor_colaboraciones: false })).toBe('admin');
  });

  it('aguanta que el listado no devuelva la columna', () => {
    // El SELECT del backend no incluye gestor_colaboraciones: llega undefined.
    expect(roleKeyOf({ role: 'gestor', gestor_colaboraciones: undefined })).toBe('gestor');
  });
});

describe('ASSIGNABLE_ROLES', () => {
  it('ofrece los cinco roles que el backend acepta, y no superadmin', () => {
    const valores = ASSIGNABLE_ROLES.map((r) => r.value);
    // user.validation.js: z.enum(['admin','gestor','soporte','tutor','colaborador'])
    expect(valores).toEqual(['admin', 'gestor', 'soporte', 'tutor', 'colaborador']);
    expect(valores).not.toContain('superadmin');
  });

  it('cada rol explica que implica', () => {
    for (const rol of ASSIGNABLE_ROLES) {
      expect(rol.hint.length).toBeGreaterThan(0);
      expect(rol.label.length).toBeGreaterThan(0);
    }
  });
});

describe('avatarColorFor', () => {
  it('el mismo id da siempre el mismo color', () => {
    expect(avatarColorFor(7)).toBe(avatarColorFor(7));
  });

  it('no se sale del array con ids negativos', () => {
    expect(AVATAR_COLORS).toContain(avatarColorFor(-3));
    expect(avatarColorFor(-3)).toBeDefined();
  });
});

describe('getInitials', () => {
  it('ignora los espacios de más', () => {
    expect(getInitials('  María   García  ')).toBe('MG');
  });

  it('se queda en dos letras', () => {
    expect(getInitials('Ana Belén Cruz Díaz')).toBe('AB');
  });

  it('devuelve ?? si no hay nombre', () => {
    expect(getInitials(null)).toBe('??');
    expect(getInitials('')).toBe('??');
  });
});
