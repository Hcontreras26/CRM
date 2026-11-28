import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LeadUtmsCard from './LeadUtmsCard';

// #48: la ficha dice de dónde vino el prospecto, no solo el canal. Quien llega
// de Perplexity sin UTM salía como «ChatGPT IA» con todas las UTM en blanco.

describe('Origen y UTMs en la ficha', () => {
  it('enseña el referrer, el gclid y el clic de Meta cuando los hay', () => {
    render(<LeadUtmsCard utms={{
      canal_detectado: 'chatgpt_ia', referrer: 'https://www.perplexity.ai/',
      gclid: 'Cj0KCQ-prueba', fbc: 'fb.1.1700000000000.IwAR-prueba',
    }} />);
    expect(screen.getByText('Llegó desde (referrer)')).toBeTruthy();
    expect(screen.getByText('https://www.perplexity.ai/')).toBeTruthy();
    expect(screen.getByText('Cj0KCQ-prueba')).toBeTruthy();
    expect(screen.getByText('fb.1.1700000000000.IwAR-prueba')).toBeTruthy();
  });

  it('sin ellos no pinta esas filas vacías', () => {
    render(<LeadUtmsCard utms={{ utm_source: 'google', canal_detectado: 'organico' }} />);
    expect(screen.queryByText('Llegó desde (referrer)')).toBeNull();
    expect(screen.queryByText(/gclid/)).toBeNull();
    expect(screen.queryByText(/Clic de Meta/)).toBeNull();
  });
});
