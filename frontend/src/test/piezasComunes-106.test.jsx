import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

/*
  Las piezas comunes de los formularios (#106), las que salieron en la
  revisión:
  - `cn` juntaba mal los tamaños con nombre: `text-secundario` se tomaba por un
    color y se borraba, y la etiqueta de Field perdía sus 12 px;
  - el desplegable del CRM no dejaba enlazar su etiqueta (no tenía `id`) ni
    saltar con una letra, como el del navegador;
  - con un desplegable abierto, Escape cerraba el diálogo entero.
*/

import { cn } from '@/shared/lib/utils';
import Field from '@/shared/components/ui/Field';
import Select from '@/shared/components/ui/Select';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';

const PAISES = [
  { value: '', label: 'Sin especificar' },
  { value: 'es', label: 'España' },
  { value: 'mx', label: 'México' },
  { value: 'pe', label: 'Perú' },
  { value: 'pt', label: 'Portugal' },
];

describe('piezas comunes de los formularios (#106)', () => {
  it('cn conserva los tamaños con nombre al lado de un color', () => {
    expect(cn('text-secundario', 'text-muted-foreground')).toBe('text-secundario text-muted-foreground');
    expect(cn('text-tabla uppercase', 'text-destructive')).toBe('text-tabla uppercase text-destructive');
    // Entre dos tamaños, o dos espacios, sigue ganando el último.
    expect(cn('text-secundario', 'text-sm')).toBe('text-sm');
    expect(cn('gap-tarjeta', 'gap-fila')).toBe('gap-fila');
  });

  it('la etiqueta de Field mantiene sus 12 px (text-secundario)', () => {
    render(<Field label="Nombre" htmlFor="x"><input id="x" /></Field>);
    const etiqueta = screen.getByText('Nombre');
    expect(etiqueta.className).toMatch(/\btext-secundario\b/);
    expect(etiqueta.className).toMatch(/\btext-muted-foreground\b/);
  });

  it('el desplegable acepta id: su etiqueta lo nombra', () => {
    render(
      <Field label="País" htmlFor="pais">
        <Select id="pais" value="" onChange={vi.fn()} options={PAISES} />
      </Field>,
    );
    expect(screen.getByLabelText('País').getAttribute('role')).toBe('combobox');
  });

  it('una letra salta a la opción que empieza por ella, sin mirar tildes', () => {
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={PAISES} ariaLabel="País" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'País' }));
    const lista = screen.getByRole('listbox');
    fireEvent.keyDown(lista, { key: 'p' });
    fireEvent.keyDown(lista, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('pe');
    // Otra vez la misma letra: la siguiente que empieza igual.
    fireEvent.click(screen.getByRole('combobox', { name: 'País' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'p' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'p' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('pt');
    // «e» encuentra «España»: la tilde no cuenta.
    fireEvent.click(screen.getByRole('combobox', { name: 'País' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'e' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('es');
  });

  it('con el desplegable abierto, Escape lo cierra a él y no al diálogo', () => {
    const cerrar = vi.fn();
    function Dialogo() {
      useEscapeKey(cerrar, true);
      const [v, setV] = useState('');
      return <Select value={v} onChange={setV} options={PAISES} ariaLabel="País" />;
    }
    render(<Dialogo />);
    fireEvent.click(screen.getByRole('combobox', { name: 'País' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(cerrar).not.toHaveBeenCalled();
    // Ya cerrado el desplegable, Escape sí cierra el diálogo.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});
