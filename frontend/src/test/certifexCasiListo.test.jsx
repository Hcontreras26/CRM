import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoCasiListo, FIRMA_EN_DIPLOMA } from '@/modules/certifex/components/piezas';

// El aviso de arriba de las dos pantallas que emiten. Diego, 20/10/2026: «las firmas no van
// en los diplomas, solo el DNI» y el DNI «es obligatorio». Vuelve a ser el de antes de la firma
// (la de la institución impresa; sobre «El interesado», solo el nombre), y dice que el DNI es
// obligatorio y dónde se pone.
describe('aviso de lo que lleva el diploma en Certifex', () => {
  it('la firma del alumno no va', () => {
    expect(FIRMA_EN_DIPLOMA).toBe(false);
  });

  it('dice que el DNI es obligatorio y dónde se pone, y que la firma del alumno no va', () => {
    render(<AvisoCasiListo />);
    const aviso = screen.getByRole('note');
    expect(aviso.textContent).toContain('El DNI del alumno es obligatorio en el diploma');
    expect(aviso.textContent).toContain('sin él no se aprueba ni se emite');
    expect(aviso.textContent).toContain('«Sin DNI · Poner»');
    expect(aviso.textContent).toContain('La firma de la institución ya va impresa');
    expect(aviso.textContent).toContain('sobre «El interesado» sale solo su nombre');
    expect(aviso.textContent).not.toContain('se sube en «Revisar datos antes de aprobar»');
    expect(aviso.textContent).not.toContain('La firma del alumno va en el diploma');
  });
});
