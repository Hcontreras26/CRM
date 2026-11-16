// Audiences API client (CRM-110 wizard de creacion de audiencia)
// Contrato definido en docs/03-api-endpoints.md > Audiences

import client, { type ApiResponse } from '@/shared/api/client';
import type { LeadStatus, LeadOrigen } from '@/shared/types';

const USE_MOCKS = false;

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export interface AudienceFilters {
  status?: string;
  statuses?: string[];
  canal?: string;
  canales?: string[];
  /** País de entrada (#221): códigos ISO o sin_pais. El retargeting de Meta, por país. */
  paises?: string[];
  fechaDesde?: string;
  fechaHasta?: string;
  productoId?: number | null;
  importeMinimo?: number | null;
}

export interface AudienceLeadSample {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  estado: LeadStatus | string;
  canal: LeadOrigen | string;
  fecha_solicitud?: string;
}

export interface AudienceBreakdown {
  status: Record<string, number>;
  canal: Record<string, number>;
}

export interface AudiencePreview {
  totalCount: number;
  breakdown: AudienceBreakdown;
  sample: AudienceLeadSample[];
}

export type MetaUploadStatus = 'preparing' | 'uploading' | 'processing' | 'completed' | 'error';

export interface MetaUpload {
  uploadId: string;
  audienceId: string;
  audienceName: string;
  recordsUploaded: number;
  matchRate: number | null;
  status: MetaUploadStatus;
}

export interface MetaUploadHistoryItem {
  audienceId: string;
  audienceName: string;
  recordsUploaded: number;
  matchRate: number | null;
  status: MetaUploadStatus;
  uploadedAt: string;
}

interface PreviewArgs {
  projectId: number;
  filters: AudienceFilters;
  signal?: AbortSignal;
}

interface ExportArgs {
  projectId: number;
  filters: AudienceFilters;
}

interface UploadArgs {
  projectId: number;
  filters: AudienceFilters;
  audienceId?: string;
}

/**
 * POST /api/audiences/preview — count + breakdown + sample para el wizard.
 */
export async function previewAudience({ projectId, filters, signal }: PreviewArgs): Promise<ApiResponse<AudiencePreview>> {
  if (USE_MOCKS) {
    await delay(400);
    return mockPreview({ projectId, filters });
  }
  return client.post('/audiences/preview', { projectId, filters }, { signal });
}

/**
 * POST /api/audiences/export — CSV blob con SHA256 hashes.
 */
export async function exportAudienceCsv({ projectId, filters }: ExportArgs): Promise<Blob> {
  if (USE_MOCKS) {
    await delay(600);
    return mockExportCsv({ projectId, filters });
  }
  const res = await client.post('/audiences/export', { projectId, filters }, { responseType: 'blob' });
  return res as unknown as Blob;
}

/**
 * POST /api/audiences/upload-meta (CRM-115) — sube audiencia a Meta Custom Audiences.
 */
export async function uploadAudienceToMeta({ projectId, filters, audienceId }: UploadArgs): Promise<ApiResponse<MetaUpload>> {
  if (USE_MOCKS) {
    return mockMetaUploadStart({ projectId, filters, audienceId });
  }
  return client.post('/audiences/upload-meta', { projectId, filters, audienceId });
}

/**
 * GET /api/audiences/upload-meta/:uploadId/status (CRM-115) — polling.
 */
export async function getMetaUploadStatus(uploadId: string): Promise<ApiResponse<MetaUpload>> {
  if (USE_MOCKS) {
    return mockMetaUploadStatus(uploadId);
  }
  return client.get(`/audiences/upload-meta/${uploadId}/status`);
}

/**
 * GET /api/audiences/upload-meta/history (CRM-115) — historial del proyecto.
 */
export async function getMetaUploadHistory(projectId: number): Promise<ApiResponse<MetaUploadHistoryItem[]>> {
  if (USE_MOCKS) {
    await delay(200);
    return { success: true, data: getMockMetaHistory(projectId) };
  }
  return client.get(`/audiences/upload-meta/history?projectId=${projectId}`);
}

// ------------------- MOCKS -------------------

function buildSampleLeads(count: number): AudienceLeadSample[] {
  const nombres = ['Maria Lopez', 'Juan Martinez', 'Ana Fernandez', 'Carlos Diaz', 'Sofia Ruiz', 'David Torres', 'Elena Gomez', 'Pedro Sanchez', 'Cristina Moreno', 'Pablo Jimenez'];
  const dominios = ['gmail.com', 'hotmail.com', 'yahoo.es', 'outlook.com'];
  const estados: LeadStatus[] = ['nuevo', 'por_contactar', 'contactado', 'en_seguimiento', 'convertido', 'no_interesado'];
  const canales: LeadOrigen[] = ['meta_ads', 'google_ads', 'organico', 'directo', 'referido', 'tiktok_ads'];
  return Array.from({ length: Math.min(count, 10) }, (_, i) => {
    const nombre = nombres[i % nombres.length];
    const slug = nombre.toLowerCase().replace(/\s/g, '.');
    return {
      id: i + 1,
      nombre,
      email: `${slug}@${dominios[i % dominios.length]}`,
      telefono: `+34${600000000 + i * 1234}`,
      estado: estados[i % estados.length],
      canal: canales[i % canales.length],
      fecha_solicitud: new Date(Date.now() - i * 7 * 86400000).toISOString().slice(0, 10),
    };
  });
}

function mockPreview({ projectId, filters }: { projectId: number; filters: AudienceFilters }): ApiResponse<AudiencePreview> {
  const baseCount = ({ 1: 380, 2: 240, 3: 165, 4: 920, 5: 540, 6: 280 } as Record<number, number>)[projectId] || 100;
  let count = baseCount;

  if (filters.statuses?.length) count = Math.round(count * (filters.statuses.length / 6));
  if (filters.canales?.length) count = Math.round(count * (filters.canales.length / 8));
  if (filters.fechaDesde && filters.fechaHasta) {
    const days = Math.max(1, Math.round((new Date(filters.fechaHasta).getTime() - new Date(filters.fechaDesde).getTime()) / 86400000));
    count = Math.round(count * Math.min(1, days / 90));
  }
  if (filters.productoId) count = Math.round(count * 0.4);
  if (filters.importeMinimo) count = Math.round(count * 0.25);

  count = Math.max(0, count);

  const breakdown: AudienceBreakdown = {
    status: {
      nuevo: Math.round(count * 0.18),
      por_contactar: Math.round(count * 0.12),
      contactado: Math.round(count * 0.22),
      en_seguimiento: Math.round(count * 0.15),
      convertido: Math.round(count * 0.20),
      no_interesado: Math.round(count * 0.13),
    },
    canal: {
      meta_ads: Math.round(count * 0.32),
      google_ads: Math.round(count * 0.24),
      organico: Math.round(count * 0.18),
      directo: Math.round(count * 0.12),
      referido: Math.round(count * 0.08),
      otro: Math.round(count * 0.06),
    },
  };

  const sample = buildSampleLeads(count);

  return { success: true, data: { totalCount: count, breakdown, sample } };
}

function sha256ish(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  return Math.abs(hash).toString(16).padStart(16, '0').repeat(4).slice(0, 64);
}

function mockExportCsv({ projectId, filters }: ExportArgs): Blob {
  const { data } = mockPreview({ projectId, filters });
  const total = data!.totalCount;
  const header = 'email_hash,phone_hash,first_name,last_name';
  const rows = Array.from({ length: total }, (_, i) => {
    const sample = data!.sample[i % data!.sample.length];
    const parts = sample.nombre.split(' ');
    const email = `lead${i}@${sample.email.split('@')[1]}`;
    const phone = `+34${600000000 + i}`;
    return `${sha256ish(email)},${sha256ish(phone)},${parts[0] || ''},${parts.slice(1).join(' ') || ''}`;
  });
  const csv = [header, ...rows].join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

// ===================== CRM-115 — Upload Meta mock =====================

interface InternalUpload {
  startedAt: number;
  audienceId: string;
  audienceName: string;
  recordsUploaded: number;
  matchRate: number | null;
  status: MetaUploadStatus;
}

const META_UPLOADS = new Map<string, InternalUpload>();
const META_HISTORY = new Map<number, MetaUploadHistoryItem[]>();

const STATUS_FLOW: MetaUploadStatus[] = ['preparing', 'uploading', 'processing', 'completed'];

async function mockMetaUploadStart({ projectId, filters, audienceId }: UploadArgs): Promise<ApiResponse<MetaUpload>> {
  await delay(400);
  const { data } = mockPreview({ projectId, filters });
  if (!data!.totalCount || data!.totalCount < 20) {
    return { success: false, error: 'Audiencia minima 20 leads', code: 'MIN_AUDIENCE_SIZE' };
  }
  const uploadId = 'up_' + Math.random().toString(36).slice(2, 10);
  const today = new Date().toISOString().slice(0, 10);
  const audienceName = audienceId ? `Audiencia existente (${audienceId})` : `CRM auto - ${projectId} - ${today}`;
  const finalAudienceId = audienceId || 'meta_aud_' + Math.random().toString(36).slice(2, 10);
  META_UPLOADS.set(uploadId, {
    startedAt: Date.now(),
    audienceId: finalAudienceId,
    audienceName,
    recordsUploaded: data!.totalCount,
    matchRate: null,
    status: 'preparing',
  });
  return {
    success: true,
    data: {
      uploadId,
      audienceId: finalAudienceId,
      audienceName,
      recordsUploaded: data!.totalCount,
      matchRate: null,
      status: 'preparing',
    },
  };
}

async function mockMetaUploadStatus(uploadId: string): Promise<ApiResponse<MetaUpload>> {
  await delay(200);
  const item = META_UPLOADS.get(uploadId);
  if (!item) return { success: false, error: 'Upload no encontrado' };
  const elapsed = Date.now() - item.startedAt;
  const flowIdx = elapsed < 1500 ? 0 : elapsed < 4000 ? 1 : elapsed < 7000 ? 2 : 3;
  const status = STATUS_FLOW[flowIdx];
  item.status = status;
  if (status === 'completed' && item.matchRate === null) {
    item.matchRate = Math.round((0.65 + Math.random() * 0.25) * 1000) / 10;
    pushHistory(item);
  }
  return {
    success: true,
    data: {
      uploadId,
      audienceId: item.audienceId,
      audienceName: item.audienceName,
      recordsUploaded: item.recordsUploaded,
      matchRate: item.matchRate,
      status: item.status,
    },
  };
}

function pushHistory(item: InternalUpload): void {
  const projectId = Number(item.audienceName.match(/(\d+)/)?.[1] || 1);
  const arr = META_HISTORY.get(projectId) || [];
  if (!arr.find(x => x.audienceId === item.audienceId)) {
    arr.unshift({
      audienceId: item.audienceId,
      audienceName: item.audienceName,
      recordsUploaded: item.recordsUploaded,
      matchRate: item.matchRate,
      status: item.status,
      uploadedAt: new Date().toISOString(),
    });
    META_HISTORY.set(projectId, arr);
  }
}

function getMockMetaHistory(projectId: number): MetaUploadHistoryItem[] {
  const arr = META_HISTORY.get(Number(projectId)) || [];
  if (arr.length === 0) {
    const today = new Date();
    const seed: MetaUploadHistoryItem[] = [
      { audienceId: 'meta_aud_demo01', audienceName: `CRM auto - ${projectId} - convertidos`, recordsUploaded: 245, matchRate: 78.4, status: 'completed', uploadedAt: new Date(today.getTime() - 7 * 86400000).toISOString() },
      { audienceId: 'meta_aud_demo02', audienceName: `CRM auto - ${projectId} - retargeting`, recordsUploaded: 412, matchRate: 71.2, status: 'completed', uploadedAt: new Date(today.getTime() - 18 * 86400000).toISOString() },
    ];
    META_HISTORY.set(Number(projectId), seed);
    return seed;
  }
  return arr;
}

// Exports para tests unitarios
export const _testing = {
  mockPreview,
  mockExportCsv,
  mockMetaUploadStart,
  mockMetaUploadStatus,
  getMockMetaHistory,
};
