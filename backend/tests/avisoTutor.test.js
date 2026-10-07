import { describe, it, expect, vi, beforeEach } from 'vitest';

// El aviso de venta al tutor, tarea #82.
//
// Se prueba el CRITERIO: a quien se avisa, que se le cuenta, y sobre todo lo
// que NO puede pasar — que vea lo de otro, que le llegue un correo de ceros, o
// que un reinicio se lo mande dos veces.

const consultas = [];
const enviados = [];

vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql, params) => {
    consultas.push({ sql, params });
    if (sql.includes('DISTINCT u.id')) {
      return { rows: [{ id: 7, nombre: 'Lola', email: 'lola@empresa.com' }] };
    }
    return { rows: [] };
  }),
}));
vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async (a) => { enviados.push(a); return { sent: true }; }),
}));
vi.mock('../src/modules/tutores/tutor.model.js', () => ({
  comisiones: vi.fn(async () => ([{
    alumno: 'María Muñoz', formacion: 'Máster', cobro: '1200.00',
    pct: '15.00', importe: '180.00', cuota_numero: 1, cuotas_total: 12,
    estado: 'pendiente',
  }])),
  resumenComisiones: vi.fn(async () => ([{ pendiente: '540.00', pagada: '120.00' }])),
}));

const { _internos } = await import('../src/jobs/avisoTutorScheduler.js');

beforeEach(() => { consultas.length = 0; enviados.length = 0; });

const venta = (extra = {}) => ({
  alumno: 'María Muñoz', formacion: 'Máster en Psicología', cobro: '1200.00',
  pct: '15.00', importe: '180.00', cuota_numero: null, cuotas_total: 0,
  estado: 'pendiente', ...extra,
});

describe('a quien se avisa', () => {
  it('solo a quien ha cobrado algo hoy', async () => {
    await _internos.tutoresConMovimiento('2026-08-31');
    expect(consultas[0].sql).toMatch(/cp\.fecha = \$1::date/);
    expect(consultas[0].params).toContain('2026-08-31');
  });

  it('respeta a quien lo apago', async () => {
    await _internos.tutoresConMovimiento('2026-08-31');
    expect(consultas[0].sql).toMatch(/NOT EXISTS[\s\S]*avisos_apagados/);
    expect(consultas[0].sql).toMatch(/venta_tutor/);
  });

  it('una comision revertida no cuenta como venta', async () => {
    // Avisarle de una revertida seria decirle que ha cobrado algo que se le ha
    // quitado.
    await _internos.tutoresConMovimiento('2026-08-31');
    expect(consultas[0].sql).toMatch(/estado <> 'revertida'/);
  });

  it('solo a gente activa y con correo', async () => {
    await _internos.tutoresConMovimiento('2026-08-31');
    expect(consultas[0].sql).toMatch(/u\.active/);
    expect(consultas[0].sql).toMatch(/u\.email IS NOT NULL/);
  });
});

describe('lo que se le cuenta', () => {
  const texto = (ventas, mes) =>
    _internos.cuerpo({ nombre: 'Lola' }, ventas, mes).textContent;

  it('el alumno, la formacion y lo que le toca', () => {
    const t = texto([venta()], { pendiente: '540.00', pagada: '0' });
    expect(t).toContain('María Muñoz');
    expect(t).toContain('Máster en Psicología');
    expect(t).toMatch(/180,00/);   // su comision
    expect(t).toMatch(/1200,00/);  // lo cobrado
    expect(t).toMatch(/15 %/);     // su porcentaje
  });

  it('dice que cuota es de cuantas', () => {
    // No es lo mismo la primera de doce que la ultima.
    expect(texto([venta({ cuota_numero: 1, cuotas_total: 12 })], {}))
      .toMatch(/Cuota 1 de 12/);
  });

  it('no habla de cuotas cuando el pago es unico', () => {
    const t = texto([venta({ cuota_numero: null, cuotas_total: 0 })], {});
    expect(t).not.toMatch(/Cuota/);
  });

  it('el acumulado del mes va separado en pendiente y pagada', () => {
    // «Llevas 800 €» sin decir cuanto se ha cobrado ya no sirve para saber que
    // esperar en la transferencia.
    const t = texto([venta()], { pendiente: '540.00', pagada: '120.00' });
    expect(t).toMatch(/540,00.*pendiente/s);
    expect(t).toMatch(/120,00.*pagada/s);
  });

  it('lleva un enlace a SU panel, no al de administracion', () => {
    // `/tutores/comisiones` es la pantalla de administracion, donde se ven las
    // comisiones de todo el mundo. La del tutor es `/mis-cursos`.
    const h = _internos.cuerpo({ nombre: 'Lola' }, [venta()], {}).htmlContent;
    expect(h).toContain('/mis-cursos');
    expect(h).not.toContain('/tutores/comisiones');
  });

  it('el titular distingue una venta de varias', () => {
    expect(texto([venta()], {})).toMatch(/Has vendido hoy/);
    expect(texto([venta(), venta()], {})).toMatch(/Has vendido 2 veces hoy/);
  });

  it('no se cuela el nombre de otro tutor', () => {
    // Lo suyo y solo lo suyo: el correo se arma con las filas que ya vienen
    // filtradas por `tutorId`, y no imprime la columna `tutor` de ninguna.
    const t = texto([venta({ tutor: 'Otro Tutor' })], {});
    expect(t).not.toContain('Otro Tutor');
  });
});

describe('lo que no puede fallar', () => {
  it('si no ha vendido nadie, no se manda nada', async () => {
    // Un correo diario que casi siempre dice «hoy nada» se deja de leer, y el
    // dia que trae algo tampoco se lee.
    const db = await import('../src/shared/config/db.js');
    db.query.mockResolvedValueOnce({ rows: [] });
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(19);
    await _internos.vuelta();
    expect(enviados).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('la clave lleva el tutor y el dia', async () => {
    // Que un reinicio no lo mande dos veces.
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(19);
    await _internos.vuelta();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].clave).toMatch(/^venta_tutor-7-\d{4}-\d{2}-\d{2}$/);
    vi.restoreAllMocks();
  });

  it('fuera de su hora no hace nada', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(3);
    await _internos.vuelta();
    expect(enviados).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('va por la tuberia de #27, con su version en texto', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(19);
    await _internos.vuelta();
    expect(enviados[0]).toHaveProperty('textContent');
    expect(enviados[0].htmlContent).toMatch(/^<!DOCTYPE html>/);
    vi.restoreAllMocks();
  });
});
