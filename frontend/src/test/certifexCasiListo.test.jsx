import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoCasiListo } from '@/modules/certifex/components/piezas';

// Certificaciones subió a producción «casi listo» (Diego, 16/10) porque faltaba la firma del
// alumno (#349). Desde el 19/10 va impresa (v2.2.7): el aviso de las dos pantallas que emiten
// ya no dice que falta, sino de dónde sale y dónde se sube si no la trae la matrícula.
describe('aviso de la firma del alumno en Certifex', () => {
  it('dice que la firma va en el diploma, de dónde sale y dónde se sube', () => {
    render(<AvisoCasiListo />);
    const aviso = screen.getByRole('note');
    expect(aviso.textContent).toContain('La firma del alumno va en el diploma');
    expect(aviso.textContent).toContain('solicitud de admisión');
    expect(aviso.textContent).toContain('Revisar datos antes de aprobar');
    expect(aviso.textContent).toContain('«El interesado»');
    expect(aviso.textContent).not.toContain('Casi listo');
  });
});
