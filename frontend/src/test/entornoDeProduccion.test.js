// @vitest-environment node
//
// El 22/10/2026 los frontales de producción se compilaron en worktrees sin
// `frontend/.env.production`, que no está en git. Vite no avisó: en ISEIE se
// fue el ranking de gestoras (Diego: «¿por qué en ISEIE dejaron de aparecer los
// ranking de las gestoras para los admin?») y aquí, en el 360, VITE_BETA_MODE
// quedó apagado y el menú dejó de marcar «Próximamente». Mismo código en los dos
// CRM (paridad): estas pruebas reproducen ese build y piden que se pare.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { comprobarEntornoDeProduccion, clavesDe } from '../../scripts/entornoDeProduccion.js';

const FRONTEND = path.resolve(__dirname, '../..');
const EJEMPLO = fs.readFileSync(path.join(FRONTEND, '.env.production.example'), 'utf8');

let dir;
beforeEach(() => {
  // Una carpeta como la de un worktree recién creado: lo que está en git
  // (el ejemplo) y nada de lo que no (el .env.production).
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entorno-prod-'));
  fs.writeFileSync(path.join(dir, '.env.production.example'), EJEMPLO);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const build = (extra = {}) => comprobarEntornoDeProduccion({
  command: 'build', mode: 'production', cwd: dir, entorno: {}, ...extra,
});

describe('El build de producción y su .env.production', () => {
  it('el ejemplo versionado lleva la base /crm/ y la beta encendida', () => {
    expect(EJEMPLO).toMatch(/^VITE_BASE_PATH=\/crm\/$/m);
    expect(EJEMPLO).toMatch(/^VITE_BETA_MODE=true$/m);
    expect(clavesDe(EJEMPLO)).toEqual(['VITE_BASE_PATH', 'VITE_BETA_MODE', 'VITE_MODULOS_APAGADOS']);
  });

  it('en un worktree sin .env.production, el build se PARA y dice qué falta (lo del 22/10)', () => {
    expect(() => build()).toThrow(/VITE_BETA_MODE/);
    expect(() => build()).toThrow(/\.env\.production/);
  });

  it('con el .env.production del clon principal, compila', () => {
    fs.copyFileSync(path.join(dir, '.env.production.example'), path.join(dir, '.env.production'));
    expect(build()).toEqual({ comprobado: true, faltan: [] });
  });

  it('una comentada no cuenta: dice exactamente las que faltan', () => {
    fs.writeFileSync(path.join(dir, '.env.production'), 'VITE_BASE_PATH=/crm/\n# VITE_BETA_MODE=true\n');
    let error;
    try { build(); } catch (e) { error = e; }
    expect(error?.message).toMatch(/faltan VITE_BETA_MODE, VITE_MODULOS_APAGADOS\./);
  });

  it('las del entorno del proceso valen igual que las del fichero', () => {
    const entorno = Object.fromEntries(clavesDe(EJEMPLO).map((k) => [k, 'x']));
    expect(build({ entorno }).faltan).toEqual([]);
  });

  it('en la CI solo avisa: allí se compila para ver que compila, no para publicar', () => {
    const avisar = vi.fn();
    const r = build({ entorno: { CI: 'true' }, avisar });
    expect(r.soloAviso).toBe(true);
    expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/VITE_BETA_MODE/));
  });

  it('/testeo (--mode staging), `npm run dev` y las pruebas no pasan por aquí', () => {
    expect(build({ mode: 'staging' }).comprobado).toBe(false);
    expect(comprobarEntornoDeProduccion({ command: 'serve', mode: 'production', cwd: dir, entorno: {} }).comprobado).toBe(false);
  });
});
