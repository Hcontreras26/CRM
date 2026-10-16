import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoCasiListo } from '@/modules/certifex/components/piezas';

// Certificaciones sube a producción «casi listo» (Diego, 16/10): funciona, pero los diplomas
// aún no llevan la firma del alumno sobre «El interesado» (#349). Las dos pantallas que
// emiten lo dicen arriba; esto comprueba que el aviso pinta y dice lo que falta.
describe('aviso «casi listo» de Certifex', () => {
  it('dice que falta la firma del alumno y de dónde saldrá', () => {
    render(<AvisoCasiListo />);
    const aviso = screen.getByRole('note');
    expect(aviso.textContent).toContain('Casi listo');
    expect(aviso.textContent).toContain('sin la firma del alumno');
    expect(aviso.textContent).toContain('solicitud de admisión');
    expect(aviso.textContent).toContain('«El interesado»');
  });
});
