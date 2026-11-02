import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/shared/config/db.js', () => {
  const queryMock = vi.fn();
  return {
    query: queryMock,
    getClient: vi.fn(),
    default: { query: queryMock },
  };
});

import { query } from '../src/shared/config/db.js';
import * as leadModel from '../src/modules/leads/lead.model.js';
import { listLeadsSchema } from '../src/modules/leads/lead.validation.js';

describe('Búsqueda de personas (leads y clientes) · Diego 02/11', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findAll con search: "gonzalez" busca con unaccent y sin acentos', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count
      .mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            nombre: 'Diana González',
            email: 'diana@ejemplo.com',
            telefono: '+34626276414',
            status: 'convertido',
          },
        ],
      }); // data

    const res = await leadModel.findAll({
      projectId: 1,
      search: 'gonzalez',
      page: 1,
      limit: 5,
    });

    expect(query).toHaveBeenCalledTimes(2);
    const countSql = query.mock.calls[0][0];
    const countParams = query.mock.calls[0][1];

    expect(countSql).toContain("unaccent(COALESCE(l.nombre, '')) ILIKE unaccent($");
    expect(countParams).toContain('%gonzalez%');
    expect(res.leads[0].nombre).toBe('Diana González');
  });

  it('findAll con search: "626 27 64 14" busca por dígitos limpios', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 20,
            nombre: 'Carlos Teléfono',
            telefono: '+34626276414',
            status: 'nuevo',
          },
        ],
      });

    const res = await leadModel.findAll({
      projectId: 1,
      search: '626 27 64 14',
      page: 1,
      limit: 5,
    });

    const countSql = query.mock.calls[0][0];
    const countParams = query.mock.calls[0][1];

    expect(countSql).toContain("regexp_replace(COALESCE(l.telefono, ''), '\\D', '', 'g') LIKE $");
    expect(countParams).toContain('%626276414%');
    expect(res.leads[0].telefono).toBe('+34626276414');
  });

  it('lead.validation valida correctamente con projectIds CSV y sin projectId (modo Todos los proyectos)', () => {
    const validacionConProjectIds = listLeadsSchema.safeParse({
      projectIds: '1,2,3',
      search: 'gonzalez',
    });
    expect(validacionConProjectIds.success).toBe(true);
    expect(validacionConProjectIds.data.projectIds).toEqual([1, 2, 3]);

    const validacionSinNada = listLeadsSchema.safeParse({
      search: 'gonzalez',
    });
    expect(validacionSinNada.success).toBe(false);
  });

  it('findAll con projectIds y sin projectId ejecuta la consulta con ANY($::int[])', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await leadModel.findAll({
      projectIds: [2, 5, 7],
      search: 'jose',
      page: 1,
      limit: 5,
    });

    const countSql = query.mock.calls[0][0];
    const countParams = query.mock.calls[0][1];

    expect(countSql).toContain('l.project_id = ANY($1::int[])');
    expect(countParams[0]).toEqual([2, 5, 7]);
    expect(countParams).toContain('%jose%');
  });
});
