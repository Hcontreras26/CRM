import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectAvatar, { inicialesDe, resolverLogoSrc } from '@/shared/components/ui/ProjectAvatar';

describe('inicialesDe', () => {
  it('toma la primera letra de cada palabra si hay más de una', () => {
    expect(inicialesDe('Psiko Aprende')).toBe('PA');
    expect(inicialesDe('Fono Aprende')).toBe('FA');
    expect(inicialesDe('Psicólogo IA')).toBe('PI');
  });

  it('quita el prefijo común IS de los campus para diferenciarlos', () => {
    expect(inicialesDe('ISEIH')).toBe('EI');
    expect(inicialesDe('ISAEG')).toBe('AE');
    expect(inicialesDe('ISSLOGG')).toBe('SL');
    expect(inicialesDe('ISECD')).toBe('EC');
    expect(inicialesDe('ISEF')).toBe('EF');
  });

  it('usa las dos primeras letras para nombres de una palabra sin prefijo IS', () => {
    expect(inicialesDe('ICTESS')).toBe('IC');
  });

  it('maneja strings vacíos o nulos', () => {
    expect(inicialesDe('')).toBe('··');
    expect(inicialesDe(null)).toBe('··');
  });
});

describe('resolverLogoSrc', () => {
  it('respeta URLs externas completas (Cloudflare R2, CDN, https)', () => {
    const r2Url = 'https://pub-abc123.r2.dev/logos/iseih.png';
    expect(resolverLogoSrc({ logo_url: r2Url })).toBe(r2Url);
  });

  it('resuelve rutas relativas asegurando el prefijo base', () => {
    const src = resolverLogoSrc({ id: 5, logo_url: '/api/projects/5/logo' });
    expect(src).toMatch(/\/api\/projects\/5\/logo$/);
  });

  it('usa el catálogo local por slug si no hay logo_url', () => {
    const src = resolverLogoSrc({ slug: 'iseih' });
    expect(src).toMatch(/iseih\.webp$/);
  });

  it('retorna null si no hay logo ni en DB ni en catálogo local', () => {
    expect(resolverLogoSrc({ slug: 'empresa-desconocida' })).toBeNull();
  });
});

describe('ProjectAvatar component', () => {
  it('muestra la imagen cuando hay logo disponible', () => {
    const project = { id: 1, nombre: 'ISEIH', logo_url: 'https://r2.dev/iseih.png' };
    const { container } = render(<ProjectAvatar project={project} size="lg" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://r2.dev/iseih.png');
  });

  it('hace fallback al marcador de iniciales si la imagen falla (onError)', () => {
    const project = { id: 2, nombre: 'ISAEG', logo_url: 'https://r2.dev/broken.png' };
    const { container } = render(<ProjectAvatar project={project} size="lg" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img);
    // Debe haber desaparecido la imagen y mostrar las iniciales AE
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AE')).toBeInTheDocument();
  });

  it('muestra el marcador con iniciales directamente si no hay logo ni emoji', () => {
    const project = { id: 3, nombre: 'ICTESS' };
    render(<ProjectAvatar project={project} size="lg" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('IC')).toBeInTheDocument();
  });

  it('con soloIniciales (Configuración › Proyectos), las iniciales aunque tenga emoji', () => {
    const project = { id: 5, nombre: 'ISEIH', emoji: '🎓', logo_url: 'https://r2.dev/roto.png' };
    const { container } = render(<ProjectAvatar project={project} size="lg" soloIniciales />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('EI')).toBeInTheDocument();
    expect(screen.queryByText('🎓')).toBeNull();
  });

  it('muestra emoji si no hay logo pero sí emoji', () => {
    const project = { id: 4, nombre: 'Campus Virtual', emoji: '🎓' };
    render(<ProjectAvatar project={project} size="lg" />);
    expect(screen.getByText('🎓')).toBeInTheDocument();
  });
});
