import crypto from 'crypto';
import { z } from 'zod';
import * as model from './audience.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { leerFiltroPais } from '../leads/pais.js';

const filtersSchema = z.object({
  statuses: z.array(z.string()).optional(),
  canales: z.array(z.string()).optional(),
  // País de entrada (#221): códigos ISO (CL, MX…) o `sin_pais`.
  paises: z.array(z.string()
    .refine((v) => leerFiltroPais(v) !== null, 'País no válido')
    .transform((v) => leerFiltroPais(v))).max(60).optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  productoId: z.coerce.number().int().optional().nullable(),
  importeMinimo: z.coerce.number().optional().nullable(),
}).optional();

const previewSchema = z.object({
  projectId: z.number().int().positive(),
  filters: filtersSchema,
});

export async function preview(req, res, next) {
  try {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('Datos invalidos', 400, 'VALIDATION_ERROR');
    const data = await model.previewAudience(parsed.data);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

function sha256(s) { return crypto.createHash('sha256').update(String(s).toLowerCase().trim()).digest('hex'); }

export async function exportCsv(req, res, next) {
  try {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('Datos invalidos', 400, 'VALIDATION_ERROR');
    const leads = await model.exportAudience(parsed.data);
    const lines = ['email_hash,phone_hash,first_name,last_name'];
    for (const l of leads) {
      const [first, ...rest] = (l.nombre || '').split(' ');
      const last = rest.join(' ');
      lines.push([
        l.email ? sha256(l.email) : '',
        l.telefono ? sha256(l.telefono.replace(/[^\d]/g, '')) : '',
        sha256(first || ''),
        sha256(last || ''),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audience-${Date.now()}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) { next(err); }
}

// CRM-115: subir audiencia a Meta (stub: marca pendiente, sin Meta API real)
export async function uploadMeta(req, res, next) {
  try {
    const { projectId, audienceName, filters } = req.body || {};
    if (!projectId || !audienceName) throw new AppError('projectId y audienceName requeridos', 400, 'VALIDATION_ERROR');
    const leads = await model.exportAudience({ projectId, filters });
    const upload = await model.createUpload({
      project_id: projectId,
      audience_name: audienceName,
      records_uploaded: leads.length,
      status: 'processing',
      filters,
      created_by: req.user.userId,
    });
    // Sin credenciales Meta: simulamos progreso con un timeout corto, marca completed con match_rate ficticio
    setTimeout(async () => {
      try {
        const matchRate = 60 + Math.random() * 30; // 60-90%
        await model.updateUpload(upload.id, {
          status: 'completed',
          match_rate: Number(matchRate.toFixed(2)),
          audience_id: 'sim_' + Math.random().toString(36).slice(2, 14),
          completed_at: new Date(),
        });
      } catch {}
    }, 5000);
    res.status(201).json({ success: true, data: upload });
  } catch (err) { next(err); }
}

export async function uploadStatus(req, res, next) {
  try {
    const u = await model.getUpload(req.params.uploadId);
    if (!u) throw new AppError('Upload no encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: u });
  } catch (err) { next(err); }
}

export async function uploadHistory(req, res, next) {
  try {
    const projectId = parseInt(req.query.projectId);
    if (!projectId) throw new AppError('projectId requerido', 400, 'PROJECT_REQUIRED');
    res.json({ success: true, data: await model.listUploads(projectId) });
  } catch (err) { next(err); }
}
