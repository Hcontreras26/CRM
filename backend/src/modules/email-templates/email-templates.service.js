// CRM-185 fase 2: plantillas de email configurables por proyecto.
// Renderizado de variables tipo {{path.to.var}} con un contexto plano/anidado.

import { query } from '../../shared/config/db.js';
import { AppError } from '../../shared/utils/AppError.js';

// Variables disponibles para substitucion. Documentado para el editor.
export const TEMPLATE_VARIABLES = [
  { token: '{{lead.nombre}}',    desc: 'Nombre del lead' },
  { token: '{{lead.email}}',     desc: 'Email del lead' },
  { token: '{{lead.telefono}}',  desc: 'Teléfono del lead' },
  { token: '{{lead.producto}}',  desc: 'Producto de interés del lead' },
  { token: '{{project.nombre}}', desc: 'Nombre del proyecto' },
  { token: '{{user.nombre}}',    desc: 'Nombre del usuario que envía' },

  // Del aviso mensual al tutor. Se declaran aunque solo las use ese correo:
  // quien entre a editarlo tiene que VER que huecos puede poner. Una variable
  // que funciona y no esta en la lista es una que nadie usa — y peor, alguien
  // escribe otra parecida, no resuelve, y el hueco sale vacio.
  { token: '{{tutor.nombre}}',   desc: 'Nombre del tutor (aviso de comisiones)' },
  { token: '{{mes}}',            desc: 'El mes del aviso, en letra: «agosto de 2026»' },
  { token: '{{total}}',          desc: 'Lo que se le debe ese mes, ya con su formato' },
  // Estas dos no son texto: son una lista y una tabla. Se montan aparte, antes
  // de renderizar, porque `renderTemplate` escapa el HTML — y bien hecho.
  { token: '{{formaciones}}',    desc: 'Lista de sus formaciones del mes' },
  { token: '{{calculo}}',        desc: 'La cuenta: comisión + IVA − retención' },
];

// Resuelve una ruta tipo "lead.nombre" en un objeto anidado.
function resolvePath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

// Substitucion de {{var}} con sanitizacion mínima (las plantillas estan
// guardadas por admin/superadmin de confianza, pero igual escapamos los
// valores dinamicos para evitar XSS si un nombre lleva HTML).
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Rellena `{{huecos}}` con el contexto.
 *
 * `escapar` decide si los valores se escapan como HTML. Por defecto SI, porque
 * el cuerpo del correo es HTML y un nombre con `<` no puede romperlo.
 *
 * PERO EL ASUNTO NO ES HTML, y ahi escapar estropea el nombre. Un cliente
 * llamado «Martí & Asociados» llegaba a la bandeja como «Martí &amp;
 * Asociados», y «O'Connor» como «O&#39;Connor». En el cuerpo no se ve —el
 * lector de correo lo pinta bien— pero el asunto es texto pelado y sale tal
 * cual. Es de esos fallos que solo ve el cliente.
 */
/**
 * Un texto escrito a mano, convertido en HTML que se lea.
 *
 * Las 18 plantillas del proceso comercial estan escritas como se escribe un
 * correo: parrafos separados por una linea en blanco y listas con un punto
 * delante. Ninguna tiene una sola etiqueta.
 *
 * Y se mandan con `htmlContent`, donde los saltos de linea NO EXISTEN. El
 * correo llegaba en un solo parrafo corrido, con los datos de la formacion
 * —inicio, duracion, modalidad— todos pegados en la misma linea.
 *
 * Se arregla al enviar y no reescribiendo las plantillas a HTML a proposito:
 * son editables, y quien entre a cambiar un texto lo va a escribir otra vez
 * como se escribe un correo. Pedirle que ponga `<p>` es pedirle que sepa HTML
 * para cambiar una frase.
 *
 * Si ya trae etiquetas se deja tal cual: quien escribio HTML sabia lo que hacia.
 */
export function comoHtml(texto) {
  const t = String(texto ?? '');
  if (/<[a-z][^>]*>/i.test(t)) return t;
  const SALTO = String.fromCharCode(10);
  const RETORNO = String.fromCharCode(13);
  // Lo PRIMERO, los saltos de Windows. Las 18 plantillas del proceso estan
  // guardadas con `\r\n`, y buscando `\n\n` no casa ninguna: el retorno se mete
  // en medio. Salia un parrafo unico con 33 saltos de linea dentro, que es
  // exactamente lo que esto venia a evitar — y pasaba en silencio.
  return t
    .split(RETORNO).join('')
    .split(new RegExp(`${SALTO}{2,}`))                 // linea en blanco = parrafo
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split(SALTO).join('<br>')}</p>`) // salto suelto = <br>
    .join(SALTO);
}

export function renderTemplate(template, ctx, { escapar = true } = {}) {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = resolvePath(ctx, path);
    if (val === undefined || val === null) return '';
    return escapar ? escapeHtml(val) : String(val);
  });
}

// CRUD basico
/**
 * Las plantillas que puede ver y editar un proyecto: las SUYAS y las de la casa.
 *
 * `project_id IS NULL` significa «comun a todos», y hasta ahora no salia en
 * ninguna parte: `WHERE t.project_id = $1` nunca casa con NULL, asi que una
 * plantilla comun quedaba invisible eligieras el proyecto que eligieras.
 *
 * Lo noto el aviso mensual al tutor, que es comun a proposito —un tutor cobra de
 * varios proyectos y el correo es uno solo—: se creo «editable desde el CRM» y
 * no habia forma de abrirla. Editable que no se puede abrir es no editable.
 *
 * Las comunes van PRIMERO: son pocas y son las que alguien busca cuando entra
 * aqui a cambiar un texto que sale en todo el CRM.
 */
export async function listByProject(projectId, { includeInactive = false } = {}) {
  const sql = `SELECT t.*, u.nombre AS created_by_nombre,
                      (t.project_id IS NULL) AS es_comun
                 FROM email_templates t
                 LEFT JOIN users u ON u.id = t.created_by
                WHERE (t.project_id = $1 OR t.project_id IS NULL)
                  ${includeInactive ? '' : 'AND t.active = true'}
                ORDER BY es_comun DESC, t.created_at DESC`;
  const { rows } = await query(sql, [projectId]);
  return rows;
}

export async function getById(id, projectId) {
  const { rows } = await query(
    `SELECT t.*, u.nombre AS created_by_nombre
     FROM email_templates t LEFT JOIN users u ON u.id = t.created_by
     WHERE t.id = $1`,
    [id]
  );
  const template = rows[0];
  if (!template) throw new AppError('Plantilla no encontrada', 404, 'NOT_FOUND');
  if (template.project_id !== projectId) throw new AppError('Sin acceso', 403, 'FORBIDDEN');
  return template;
}

export async function create({ projectId, userId, name, subject, body_html, description }) {
  const { rows } = await query(
    `INSERT INTO email_templates (project_id, created_by, name, subject, body_html, description)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [projectId, userId, name, subject, body_html, description || null]
  );
  return rows[0];
}

export async function update(id, projectId, data) {
  await getById(id, projectId);
  const allowed = ['name', 'subject', 'body_html', 'description', 'active'];
  const fields = [];
  const values = [];
  let idx = 1;
  for (const k of allowed) {
    if (data[k] !== undefined) { fields.push(`${k} = $${idx++}`); values.push(data[k]); }
  }
  if (fields.length === 0) return getById(id, projectId);
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await query(
    `UPDATE email_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
}

export async function remove(id, projectId) {
  await getById(id, projectId);
  await query(`DELETE FROM email_templates WHERE id = $1`, [id]);
}
