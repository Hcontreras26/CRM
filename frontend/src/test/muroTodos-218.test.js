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

// Tanda 3: pantallas de UN campus que piden el campus dentro (o suman los de
// quien mira, o listan sus campus). Se abren con «Todos» y con una empresa.
const TANDA_3 = [
  '/prospectos/proceso', '/prospectos/duplicados', '/prospectos/revision-duplicados',
  '/meta-ads', '/chat-ia', '/conexion/moodle', '/conexion/moodle/1753',
];

describe('#218 tanda 3: se abren con «Todos» y con una empresa', () => {
  it.each(TANDA_3)('%s con «Todos»', (ruta) => {
    expect(pathAllowsAll(ruta)).toBe(true);
  });
  it.each(TANDA_3)('%s con una empresa', (ruta) => {
    expect(rutaAceptaSociedad(ruta)).toBe(true);
  });
});

describe('las que siguen con su muro (configuración de un campus, pendientes de Diego)', () => {
  // El servidor aún no sabe «Todos» (400 o 403 con el -1), o la pantalla pide un
  // campus por su cuenta. Se abren en las tandas 2 y 3, no antes.
  it.each([
    '/finanzas/integraciones', '/prospectos/convocatorias', '/productos', '/productos/woocommerce',
    '/whatsapp/plantillas', '/registro',
  ])('%s', (ruta) => {
    expect(pathAllowsAll(ruta)).toBe(false);
  });
});
