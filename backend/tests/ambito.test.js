import { describe, it, expect } from 'vitest';
import { proyectosDelAmbito, comoLista, SIN_PRUEBAS } from '../src/shared/utils/ambito.js';

/*
  El ámbito de una consulta: un proyecto, una sociedad entera, o todo.

  Se prueba porque de esto cuelgan ya Reportes, Ventas y Tutores, y un fallo
  aquí NO SE VE: no rompe nada, solo hace que una pantalla enseñe de más o de
  menos. Es justo lo que costó encontrar cuando el «Resumen del periodo» daba
  las cifras de los nueve proyectos con el título de CEDIA puesto.

  ANTES IBA CON `node --test`, Y ESO LO DEJÓ SIN CORRER.

  El fichero decía que el backend no tenía vitest en ningún entorno y que un
  test de vitest aquí sería un test que nadie puede ejecutar. Ya no es verdad:
  `npm test` ES vitest, y es lo que corre CI.

  El resultado fue el contrario del que se buscaba. Vitest recoge este fichero,
  no encuentra ninguna suite —sus nueve pruebas son `test()` de Node, que él no
  lee— y falla con «No test suite found in file». O sea que estas nueve no
  protegían nada Y ADEMÁS tenían el backend en rojo, escondiendo los fallos de
  verdad entre el ruido.

  `proyectosDelAmbito` se prueba contra la base de verdad, que es donde vive lo
  que puede fallar: solo lee.
*/

describe('comoLista', () => {
  it('un proyecto suelto se convierte en lista de uno', () => {
    expect(comoLista(7, null)).toEqual([7]);
  });

  it('la lista manda sobre el proyecto suelto', () => {
    // Con una sociedad elegida llegan las dos cosas; gana la sociedad.
    expect(comoLista(7, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('sin nada devuelve null, que significa «todo»', () => {
    expect(comoLista(null, null)).toBeNull();
    expect(comoLista(null, [])).toBeNull();
  });

  it('los ids llegan como número aunque vengan de la URL', () => {
    // De `req.query` llegan cadenas, y `= ANY($1::int[])` con textos revienta.
    expect(comoLista(null, ['4', '9'])).toEqual([4, 9]);
    expect(comoLista('7', null)).toEqual([7]);
  });
});

describe('SIN_PRUEBAS', () => {
  it('excluye los proyectos marcados de pruebas', () => {
    expect(SIN_PRUEBAS()).toMatch(/es_prueba/);
    expect(SIN_PRUEBAS()).toMatch(/project_id NOT IN/);
    // En unas consultas la columna es `c.project_id` y en otras `l.project_id`.
    expect(SIN_PRUEBAS('c.project_id')).toMatch(/c\.project_id NOT IN/);
  });
});

describe('proyectosDelAmbito', () => {
  it('sin issuerId, pasa el proyecto tal cual', async () => {
    expect(await proyectosDelAmbito({ query: { projectId: '7' } }))
      .toEqual({ projectId: 7, projectIds: null });
  });

  it('sin nada, es «todos»', async () => {
    expect(await proyectosDelAmbito({ query: {} }))
      .toEqual({ projectId: null, projectIds: null });
  });

  it('una sociedad se traduce a sus campus', async () => {
    const { query } = await import('../src/shared/config/db.js');
    const { rows } = await query(
      `SELECT sociedad_emisora_id AS id, count(*)::int n FROM projects
        WHERE sociedad_emisora_id IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1`);
    if (!rows.length) return; // Sin sociedades configuradas no hay nada que probar.
    const { id, n } = rows[0];

    const r = await proyectosDelAmbito({ query: { issuerId: String(id), projectId: '7' } });
    expect(r.projectIds).toHaveLength(n);
    // El proyecto se descarta: lo que se pidió fue la sociedad entera.
    expect(r.projectId).toBeNull();
  });

  it('una sociedad SIN campus no puede significar «todos»', async () => {
    // Es el fallo peligroso: devolver null aquí enseñaría el CRM entero justo
    // cuando se pidió acotar. Se devuelve una lista que no casa con nada.
    const r = await proyectosDelAmbito({ query: { issuerId: '999999' } });
    expect(r.projectIds).toEqual([-1]);
    expect(r.projectIds).not.toBeNull();
  });
});
