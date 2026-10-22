import { useState, useEffect } from 'react';
import { useOptionalTheme } from '@/contexts/ThemeContext';
import { getLocalLogo } from '@/shared/lib/projectLogos';
import { avatarColorForName } from '@/shared/lib/ui';

/**
 * Las iniciales con las que se reconoce una marca sin logo.
 *
 * Casi todas empiezan por «IS» —ISECD, ISEF, ISSLOGG, ISAEG, ISEIH—, así que
 * coger las dos primeras letras las deja a todas igual: «IS, IS, IS». Se quita
 * ese prefijo común y se cogen las dos siguientes: EC, EF, SL, AE, EI. Cada una
 * distinta, y siguen siendo su nombre.
 */
export function inicialesDe(nombre = '') {
  if (!nombre) return '··';
  const limpio = String(nombre).trim();
  if (!limpio) return '··';
  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (palabras.length > 1) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  const sola = palabras[0].toUpperCase();
  const sinPrefijo = sola.length >= 4 && sola.startsWith('IS') ? sola.slice(2) : sola;
  return sinPrefijo.slice(0, 2);
}

const tonoDe = avatarColorForName;

/**
 * Resuelve la URL de la imagen del proyecto, soportando URLs externas (Cloudflare R2,
 * CDN, https://), rutas relativas de la API (/api/projects/:id/logo) y catálogo
 * local de logos por slug en /projects/.
 */
export function resolverLogoSrc(project, theme = 'light') {
  if (!project) return null;
  const url = project.logo_url;
  if (url) {
    if (/^https?:\/\//i.test(url)) return url;
    const base = (import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '');
    if (url.startsWith('/')) {
      return url.startsWith(base) ? url : `${base}${url}`;
    }
    return `${base}/api/projects/${project.id}/logo`;
  }
  return getLocalLogo(project?.slug, theme);
}

/**
 * `soloIniciales`: sin logo, las iniciales aunque el proyecto tenga emoji. Lo usa
 * Configuración › Proyectos (Diego, #222: «un marcador con la inicial del campus»);
 * el menú lateral y el selector siguen enseñando el emoji.
 */
export function ProjectAvatar({ project, size = 'md', soloIniciales = false }) {
  // Fuera de ThemeProvider (una prueba suelta), claro por defecto.
  const theme = useOptionalTheme();

  const [falloImagen, setFalloImagen] = useState(false);
  const dim = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const imgSize = size === 'lg' ? 48 : size === 'sm' ? 20 : 24;

  useEffect(() => {
    setFalloImagen(false);
  }, [project?.id, project?.logo_url, project?.slug]);

  // «Todos los proyectos» va primero: no es una marca, es una vista.
  if (project?.isAll) {
    return (
      <div className={`${dim} rounded-lg bg-info-soft text-info-soft-foreground flex items-center justify-center flex-shrink-0 font-bold text-[11px]`}>
        ALL
      </div>
    );
  }

  const src = resolverLogoSrc(project, theme);

  if (src && !falloImagen) {
    return (
      // Fondo claro SIEMPRE, también en modo oscuro: estos logos vienen de las
      // webs y muchos son de tinta oscura sobre transparente. Sin el fondo
      // desaparecen en el panel oscuro y queda un cuadro vacío.
      <span className={`${dim} rounded-lg bg-white ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center overflow-hidden flex-shrink-0`}>
        <img
          src={src}
          alt=""
          width={imgSize}
          height={imgSize}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain p-[3px]"
          // Si el logo no carga —una web caída, una dirección cambiada o 404— se
          // enseñan las iniciales con su tono.
          onError={() => setFalloImagen(true)}
        />
      </span>
    );
  }

  if (project?.emoji && !soloIniciales) {
    return (
      <div className={`${dim} rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 ${size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'}`}>
        {project.emoji}
      </div>
    );
  }

  // Sin logo y sin emoji (o fallo al cargar imagen): marcador de iniciales con su color.
  return (
    <div
      className={`${dim} rounded-lg ${tonoDe(project?.nombre)} flex items-center justify-center flex-shrink-0 font-bold ${size === 'lg' ? 'text-base' : size === 'sm' ? 'text-[10px]' : 'text-[11px]'} tracking-tight`}
      title={project?.nombre || ''}
    >
      {inicialesDe(project?.nombre)}
    </div>
  );
}

export default ProjectAvatar;
