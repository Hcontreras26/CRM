import { describe, it, expect } from 'vitest';
import { calcularDesglose } from '@/modules/facturas-colaborador/api/facturasColaborador.api';

// #202, segunda parte · el desglose que enseña la pantalla. Tiene que dar lo
// mismo que el del servidor (desglose.js), que es el que cuenta.
describe('facturas de colaboradores · el desglose en la pantalla', () => {
  const cobro = (extra) => ({ iva_pct: 21, irpf_pct: 15, importe_fijo: null, tarifa_hora: null, concepto: 'x', ...extra });

  it('fijo: 600 + 21 % − 15 % = 636', () => {
    expect(calcularDesglose(cobro({ modalidad: 'fijo', importe_fijo: 600 }), '', []))
      .toEqual({ base: 600, iva: 126, irpf: 90, total: 636 });
  });

  it('por hora: 18 h × 22 €/h = 396 de base y 419,76 de total', () => {
    expect(calcularDesglose(cobro({ modalidad: 'hora', tarifa_hora: 22 }), '18', []))
      .toEqual({ base: 396, iva: 83.16, irpf: 59.4, total: 419.76 });
  });

  it('por proyecto: suma las líneas; «7,5» son siete horas y media; lo vacío no suma', () => {
    const lineas = [
      { concepto: 'Landing', project_id: '', horas: '7,5' },
      { concepto: 'SEO', project_id: '', horas: '4' },
      { concepto: '', project_id: '', horas: '' },
    ];
    expect(calcularDesglose(cobro({ modalidad: 'proyecto', tarifa_hora: 30, iva_pct: 0, irpf_pct: 0 }), '', lineas))
      .toEqual({ base: 345, iva: 0, irpf: 0, total: 345 });
  });

  it('el medio céntimo, hacia arriba, igual que el servidor (no «No cuadra» por un céntimo)', () => {
    // 5 h × 21,70 = 108,50; IRPF 15 % = 16,275 → 16,28 (con decimales salía 16,27).
    expect(calcularDesglose(cobro({ modalidad: 'hora', tarifa_hora: 21.7 }), '5', []))
      .toEqual({ base: 108.5, iva: 22.79, irpf: 16.28, total: 115.01 });
    expect(calcularDesglose(cobro({ modalidad: 'fijo', importe_fijo: 158.5, irpf_pct: 0 }), '', []).iva).toBe(33.29);
    expect(calcularDesglose(cobro({ modalidad: 'proyecto', tarifa_hora: 22.33, iva_pct: 0, irpf_pct: 0 }), '',
      [{ concepto: 'x', project_id: '', horas: '1,5' }]).base).toBe(33.5);
  });

  it('las horas, a dos decimales como el servidor: «7,333» son 7,33', () => {
    expect(calcularDesglose(cobro({ modalidad: 'hora', tarifa_hora: 22, iva_pct: 0, irpf_pct: 0 }), '7,333', []).base).toBe(161.26);
  });
});
