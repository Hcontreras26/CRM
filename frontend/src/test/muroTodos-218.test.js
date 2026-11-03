import { describe, it, expect } from 'vitest';
import { pathAllowsAll, rutaAceptaSociedad } from '@/shared/components/layout/AppLayout';

/**
 * #218, tanda 1 · Con «Todos los proyectos», 22 pantallas (49 de 77 entradas del
 * menú, el 03/11) se quedaban en «Selecciona un proyecto».
 *
 * Estas ya funcionaban con una EMPRESA y su servidor, sin campus, se queda en
 * los de quien pide (con #620 también Seguimiento y Reportes). Lo único que les
 * faltaba era la lista de «Todos». Probadas como super admin y como admin.
 */

const TANDA_1 = [
  '/finanzas', '/finanzas/ingresos', '/finanzas/conversiones', '/finanzas/egresos',
  '/finanzas/por-cobrar', '/finanzas/por-pagar', '/finanzas/comisiones',
  '/finanzas/pendiente-facturar', '/finanzas/ventas-analisis',
  '/informes', '/prospectos/seguimiento',
  '/correos', '/mensajes', '/mis-cursos', '/novedades', '/solicitudes-cambio', '/solicitudes-cambio/12',
  '/configuracion/claves',
  '/whatsapp', '/whatsapp/chat', '/whatsapp/banco', '/whatsapp/conexion', '/whatsapp/ayuda',
];

describe('#218 tanda 1: se abren con «Todos los proyectos»', () => {
  it.each(TANDA_1)('%s', (ruta) => {
    expect(pathAllowsAll(ruta)).toBe(true);
  });

  // La regla para entrar en «Todos»: que ya sepa sumar campus, es decir, que se
  // abra con una empresa. Si alguna no lo hiciera, enseñaría cifras de «todo».
  it.each(TANDA_1)('%s ya se abría con una empresa', (ruta) => {
    expect(rutaAceptaSociedad(ruta)).toBe(true);
  });
});

// Tanda 2: su servidor no entendía «Todos» y ahora, sin campus, se queda en los
// de quien pide (tests/facturasTodos218.test.js).
const TANDA_2 = ['/finanzas/facturas', '/finanzas/pagos-stripe', '/finanzas/nominas'];

describe('#218 tanda 2: se abren con «Todos los proyectos»', () => {
  it.each(TANDA_2)('%s', (ruta) => {
    expect(pathAllowsAll(ruta)).toBe(true);
  });

  it('emitir una factura sigue pidiendo su campus', () => {
    expect(pathAllowsAll('/finanzas/facturas/nueva')).toBe(false);
  });
});

describe('las de las tandas siguientes siguen con su muro', () => {
  // El servidor aún no sabe «Todos» (400 o 403 con el -1), o la pantalla pide un
  // campus por su cuenta. Se abren en las tandas 2 y 3, no antes.
  it.each([
    '/finanzas/integraciones',
    '/prospectos/convocatorias', '/prospectos/duplicados', '/prospectos/revision-duplicados',
    '/prospectos/proceso', '/productos', '/productos/woocommerce', '/meta-ads', '/conexion/moodle',
    '/whatsapp/plantillas', '/registro',
  ])('%s', (ruta) => {
    expect(pathAllowsAll(ruta)).toBe(false);
  });
});
