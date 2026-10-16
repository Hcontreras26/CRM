import { query } from '../../shared/config/db.js';
import { comoLista } from '../../shared/utils/ambito.js';

// ============================================================
// EXPENSES (egresos / gastos operativos)
// Tabla: expenses (005_expenses.sql + 082/114 comprobante y origen + la de
// «egresos por empresa», que añade `issuer_id`).
//
// Paridad #227 (Diego, 10/10: «Egresos se empareja: la misma pantalla y el
// mismo funcionamiento en los dos CRM»). Este fichero es IGUAL en MultiCRM y
// en CRM-ISEIE. Antes había dos: MultiCRM lo llevaba dentro de `accounting`
// --sabía de empresas pero no tenía capa de servicio-- e ISEIE tenía este
// módulo aparte --con servicio, pero solo sabía mirar un campus--.
// ============================================================

/*
  DE QUIÉN ES UN GASTO. Tres casos, y el tercero es el nuevo:

    de un campus          project_id = 7,    issuer_id = NULL
    de toda una empresa   project_id = NULL, issuer_id = 3   (el alquiler de CEDIA)
    general, de la casa   project_id = NULL, issuer_id = NULL

  Antes solo existían el primero y el tercero, y con una empresa puesta en la
  cabecera no había forma de apuntar «el alquiler de CEDIA»: la pantalla
  mandaba `project_id: -1` --el «todos» del navegador-- y el servidor
  contestaba «Number must be greater than 0».

  QUÉ ENTRA EN UN ÁMBITO (una lista de campus: uno solo, o los de una empresa):
    - los gastos de esos campus;
    - los de la EMPRESA de esos campus (es de todos ellos);
    - los generales, que ya contaban en todos los ámbitos en el panel de
      Finanzas («un gasto sin proyecto es de la casa»). Se mantiene para que
      el listado y el panel den la MISMA cifra con el mismo filtro.

  La regla vive aquí y la usa también el panel de Finanzas
  (`accounting.model.js`): si cada uno se la monta, acaban dando cifras
  distintas para la misma pregunta.
*/

/**
 * La condición SQL de «este gasto entra en el ámbito». `n` es el número del
 * parámetro que trae la lista de campus (`int[]`); se usa dos veces.
 */
export function condicionDeAmbito(alias, n) {
  return `(${alias}.project_id = ANY($${n}::int[])
     OR (${alias}.project_id IS NULL AND (
           ${alias}.issuer_id IS NULL
        OR ${alias}.issuer_id IN (SELECT p_amb.sociedad_emisora_id FROM projects p_amb WHERE p_amb.id = ANY($${n}::int[]))
     )))`;
}

const SELECT_CON_NOMBRES = `
  SELECT e.*, p.nombre AS proyecto_nombre, u.nombre AS registrado_por_nombre,
         s.razon_social AS empresa_nombre
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN users u ON u.id = e.registrado_por
    LEFT JOIN invoice_issuers s ON s.id = e.issuer_id`;

export async function createExpense(data, userId) {
  const { rows } = await query(
    `INSERT INTO expenses (
        project_id, issuer_id, concepto, importe, fecha, categoria, notas, registrado_por,
        comprobante_url, comprobante_key, comprobante_mime, comprobante_size_bytes,
        source_payable_id, source_stripe_payout_id
     )
     VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      data.project_id || null,
      // Con campus, la empresa sale del campus: guardarla otra vez sería dejar
      // que las dos digan cosas distintas.
      data.project_id ? null : (data.issuer_id || null),
      data.concepto, data.importe, data.fecha, data.categoria || 'otros', data.notas ?? null, userId,
      data.comprobante_url || null, data.comprobante_key || null, data.comprobante_mime || null, data.comprobante_size_bytes || null,
      data.source_payable_id || null, data.source_stripe_payout_id || null,
    ]
  );
  return rows[0];
}

export async function findExpenseById(id) {
  const { rows } = await query(`${SELECT_CON_NOMBRES} WHERE e.id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Los filtros del listado y del resumen, en un solo sitio: si el total se
 * calcula con otro WHERE que la tabla, deja de cuadrar con ella.
 */
function construirFiltros({ projectId = null, projectIds = null, categoria, from, to, q, origen }) {
  const conds = [];
  const params = [];
  let idx = 1;

  // Una EMPRESA son sus campus: `comoLista` deja los dos casos --un proyecto
  // o una sociedad-- en una sola lista. `null` es «todo».
  const ids = comoLista(projectId, projectIds);
  if (ids) { conds.push(condicionDeAmbito('e', idx++)); params.push(ids); }
  if (categoria) { conds.push(`e.categoria = $${idx++}`); params.push(categoria); }
  if (from) { conds.push(`e.fecha >= $${idx++}`); params.push(from); }
  if (to) { conds.push(`e.fecha <= $${idx++}`); params.push(to); }
  if (q) {
    conds.push(`(e.concepto ILIKE $${idx} OR e.notas ILIKE $${idx})`);
    idx++;
    params.push(`%${q}%`);
  }
  if (origen === 'auto') conds.push('(e.source_payable_id IS NOT NULL OR e.source_stripe_payout_id IS NOT NULL)');
  if (origen === 'manual') conds.push('(e.source_payable_id IS NULL AND e.source_stripe_payout_id IS NULL)');

  return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', params, idx };
}

export async function listExpenses({ page = 1, limit = 20, ...filtros }) {
  const { where, params, idx } = construirFiltros(filtros);
  const offset = (page - 1) * limit;

  const { rows: countRows } = await query(`SELECT COUNT(*) FROM expenses e ${where}`, params);
  const total = parseInt(countRows[0].count);

  const { rows } = await query(
    `${SELECT_CON_NOMBRES}
     ${where}
     ORDER BY e.fecha DESC, e.id DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { expenses: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Los totales del listado, sobre TODAS las filas del filtro y no sobre la
 * página que se ve. Antes el «Total» de la cabecera sumaba en el navegador las
 * 20 filas cargadas: una cifra falsa en cuanto había más (auditoría de
 * Finanzas, 3.4). Es el mismo patrón que Facturación, que trae sus cifras de
 * un `/stats` aparte.
 */
export async function resumenExpenses(filtros) {
  const { where, params } = construirFiltros(filtros);
  const { rows: tot } = await query(
    `SELECT COUNT(*)::int AS num, COALESCE(SUM(e.importe), 0) AS total,
            COUNT(*) FILTER (WHERE e.project_id IS NULL)::int AS num_sin_campus,
            COALESCE(SUM(e.importe) FILTER (WHERE e.project_id IS NULL), 0) AS total_sin_campus
       FROM expenses e ${where}`,
    params
  );
  const { rows: porCat } = await query(
    `SELECT e.categoria, COUNT(*)::int AS num, COALESCE(SUM(e.importe), 0) AS total
       FROM expenses e ${where}
      GROUP BY e.categoria
      ORDER BY total DESC`,
    params
  );
  return {
    num: tot[0].num,
    total: Number(tot[0].total),
    sin_campus: { num: tot[0].num_sin_campus, total: Number(tot[0].total_sin_campus) },
    por_categoria: porCat.map((r) => ({ categoria: r.categoria, num: r.num, total: Number(r.total) })),
  };
}

export async function updateExpense(id, fields) {
  const allowed = [
    'project_id', 'issuer_id', 'concepto', 'importe', 'fecha', 'categoria', 'notas',
    'comprobante_url', 'comprobante_key', 'comprobante_mime', 'comprobante_size_bytes',
  ];
  const sets = [];
  const params = [];
  let idx = 1;
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = $${idx++}`);
      params.push(fields[k]);
    }
  }
  if (!sets.length) return null;
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(`UPDATE expenses SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  return rows[0] || null;
}

// Para detectar duplicados generados automáticamente por hooks (B0/C/F).
// Si ya existe un expense con ese source_*_id, devuelve esa fila — el hook NO
// crea uno nuevo. El UNIQUE de la base lo haría igual, pero así no hay
// excepción que atrapar.
export async function findBySourcePayableId(payableId) {
  const { rows } = await query(`SELECT * FROM expenses WHERE source_payable_id = $1`, [payableId]);
  return rows[0] || null;
}
export async function findBySourceStripePayoutId(payoutId) {
  const { rows } = await query(`SELECT * FROM expenses WHERE source_stripe_payout_id = $1`, [payoutId]);
  return rows[0] || null;
}

/** ¿Tiene esta empresa alguno de estos campus? */
export async function empresaTieneAlgunCampus(issuerId, campus) {
  if (!campus.length) return false;
  const { rows } = await query(
    `SELECT 1 FROM projects WHERE sociedad_emisora_id = $1 AND id = ANY($2::int[]) LIMIT 1`,
    [issuerId, campus]
  );
  return rows.length > 0;
}

export async function deleteExpense(id) {
  await query(`DELETE FROM expenses WHERE id = $1`, [id]);
}
