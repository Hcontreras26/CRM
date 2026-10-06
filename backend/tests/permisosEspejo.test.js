import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ALL_RESOURCES, SYSTEM_ROLE_DEFAULTS } from '../src/modules/permissions/permissions.defaults.js';

/**
 * El frontal lleva su propia copia del catalogo de permisos, y tiene que ser
 * eso: una copia.
 *
 * Durante meses no lo fue. El backend hablaba de `leads.view` y el frontal de
 * `leads.read`; `leads.edit` contra `leads.update`; `leads.assign` contra
 * `leads.reassign`. Nada fallaba a la vista porque el hook ni miraba lo que
 * manda el backend, asi que la divergencia no costaba nada... hasta que se
 * conecto. Entonces la pantalla de Roles guardaba en la base claves que ningun
 * guardia consulta, y los botones se escondian de quien si tenia permiso.
 *
 * Los tipos no cazan esto: las dos partes son cadenas sueltas. Esta prueba si.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(aqui, '../../frontend/src/shared/hooks/usePermission.ts');
const fuente = readFileSync(HOOK, 'utf8');

/** Los recursos y acciones que declara PERMISSION_RESOURCES. */
function recursosDelFrontal() {
  const bloque = fuente.slice(
    fuente.indexOf('export const PERMISSION_RESOURCES'),
    fuente.indexOf('export const FIXED_ROLES'),
  );
  const salida = {};
  for (const linea of bloque.split('\n')) {
    const m = linea.match(/key: '([\w_]+)',\s*label: '[^']*',\s*actions: \[([^\]]*)\]/);
    if (m) salida[m[1]] = m[2].split(',').map((a) => a.trim().replace(/'/g, '')).filter(Boolean);
  }
  return salida;
}

/**
 * Las claves que declara ROLE_DEFAULT_PERMISSIONS para un rol.
 *
 * Recorriendo lineas en vez de con una expresion regular armada a mano: la
 * primera version se construia con `new RegExp` y una plantilla, y ahi `[\s\S]`
 * se quedaba en `[sS]`. Parecia que el frontal no declaraba ningun rol.
 */
function clavesDelRol(rol) {
  const lineas = fuente
    .slice(fuente.indexOf('export const ROLE_DEFAULT_PERMISSIONS'))
    .split('\n');
  const salida = {};
  let dentro = false;
  for (const linea of lineas) {
    const abre = linea.match(/^ {2}(\w+): \{(\}?)/);
    if (abre) {
      if (abre[1] !== rol) { dentro = false; continue; }
      if (abre[2] === '}') return {};   // `tutor: {}` cabe en una linea
      dentro = true;
      continue;
    }
    if (!dentro) continue;
    if (/^ {2}\},/.test(linea)) break;
    for (const [, k, v] of linea.matchAll(/'([\w.]+)': (true|false)/g)) salida[k] = v === 'true';
  }
  return dentro || Object.keys(salida).length ? salida : null;
}

describe('el catalogo de permisos del frontal es espejo del backend', () => {
  it('declara los mismos recursos, ni uno mas ni uno menos', () => {
    expect(Object.keys(recursosDelFrontal()).sort()).toEqual(Object.keys(ALL_RESOURCES).sort());
  });

  it('cada recurso declara las mismas acciones', () => {
    const frontal = recursosDelFrontal();
    for (const [recurso, acciones] of Object.entries(ALL_RESOURCES)) {
      expect(frontal[recurso], `acciones de ${recurso}`).toEqual(acciones);
    }
  });

  // Aqui es donde moria: `read`/`update`/`reassign` no existen en el backend.
  it('no usa el vocabulario viejo', () => {
    const sospechosas = Object.entries(recursosDelFrontal())
      .flatMap(([r, acciones]) => acciones.map((a) => `${r}.${a}`))
      .filter((clave) => /\.(read|update|reassign)$/.test(clave));
    expect(sospechosas).toEqual([]);
  });

  for (const rol of ['admin', 'gestor', 'soporte', 'colaborador']) {
    it(`los defaults de ${rol} coinciden con los del backend`, () => {
      expect(clavesDelRol(rol)).toEqual(SYSTEM_ROLE_DEFAULTS[rol]);
    });
  }

  it('el tutor existe y no puede nada', () => {
    expect(clavesDelRol('tutor')).toEqual({});
  });
});
