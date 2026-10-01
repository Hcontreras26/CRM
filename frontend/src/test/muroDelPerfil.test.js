import { describe, it, expect } from 'vitest';
import { pathAllowsAll, rutaAceptaSociedad } from '@/shared/components/layout/AppLayout';

/**
 * #208 · «Mi perfil» enseñaba «Selecciona un proyecto».
 *
 * El muro tiene dos listas: la de pantallas que se abren con «Todos los
 * proyectos» y la de las que se abren con una empresa puesta. `/perfil` solo
 * estaba en la segunda, así que con «Todos» nadie podía cambiar su contraseña.
 * Las pantallas personales tienen que estar en las dos.
 */

const PERSONALES = ['/perfil', '/preferencias', '/configuracion', '/notificaciones', '/manual', '/soporte'];

describe('las pantallas personales no tienen muro', () => {
  it.each(PERSONALES)('%s se abre con «Todos los proyectos»', (ruta) => {
    expect(pathAllowsAll(ruta)).toBe(true);
  });

  it.each(PERSONALES)('%s se abre con una empresa puesta', (ruta) => {
    expect(rutaAceptaSociedad(ruta)).toBe(true);
  });
});

describe('y el muro sigue donde tiene que estar', () => {
  it('una pantalla de un solo proyecto no se abre con «Todos»', () => {
    // Un webhook es de UN proyecto: «el webhook de todos» no existe.
    expect(pathAllowsAll('/captacion/webhooks')).toBe(false);
  });
});
