// Reports IA API client (CRM-113)
// Contrato: docs/03-api-endpoints.md > Reports

import client, { type ApiResponse } from '@/shared/api/client';
import { reportsListMock, reportDetailMock, generateReportMock } from '../mocks/reports-ia.mock';

const USE_MOCKS = false;  // Backend listo (con fallback si falta ANTHROPIC_API_KEY)

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export interface ReportMetadata {
  leadsAnalizados: number;
  conversionesAnalizadas: number;
  facturacionTotal: number;
  fuentesDatos: string[];
}

export interface ReportSummary {
  id: string;
  projectId: number;
  projectName: string;
  periodo: string;
  metadata: ReportMetadata;
  generadoPor: { id: number; nombre: string };
  createdAt: string;
  pdfUrl?: string | null;
  pdfGeneratedAt?: string | null;
}

export interface Report extends ReportSummary {
  content: string;
}

export interface ListReportsParams {
  periodo?: string;
}

export async function listReports(projectId: string | number, params: ListReportsParams = {}): Promise<ApiResponse<ReportSummary[]>> {
  if (USE_MOCKS) { await delay(250); return { success: true, data: reportsListMock(projectId, params) }; }
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return client.get<ReportSummary[]>(`/reports-ia/${projectId}${qs ? '?' + qs : ''}`);
}

export async function getReport(id: string): Promise<ApiResponse<Report>> {
  if (USE_MOCKS) { await delay(250); return { success: true, data: reportDetailMock(id) as Report }; }
  return client.get<Report>(`/reports-ia/detail/${id}`);
}

export async function generateReport(projectId: string | number, periodo?: string): Promise<ApiResponse<Report>> {
  if (USE_MOCKS) { await delay(2000); return { success: true, data: generateReportMock(projectId, periodo) }; }
  return client.post<Report>(`/reports-ia/${projectId}/generate`, { periodo });
}

/**
 * Descarga el reporte en PDF. Se arma en el navegador con jsPDF.
 */
export async function exportReportPdf(
  id: string,
  opts: { filename?: string; descargar?: boolean } = {},
): Promise<Blob> {
  // Se genera AQUI, siempre, y no se le pide al servidor.
  //
  // La rama de servidor hacia `POST /reports-ia/:id/export-pdf` esperando un
  // blob, y ese endpoint contesta JSON: «PDF server-side pendiente. Frontend ya
  // genera PDF con jsPDF». Ese JSON se guardaba con nombre `reporte.pdf` y no
  // abria en ningun lector. En produccion, desde que se subio — y solo se veia
  // al abrir el fichero, no al pulsar el boton.
  //
  // El generador estaba escrito y entero, pero detras de `if (USE_MOCKS)`, que
  // es `false`. O sea que la version buena no se ejecutaba nunca.
  //
  // Y no hay nada que pedir: el markdown ya esta en el navegador.
  const r = await getReport(id);
  if (!r.data) throw new Error('Reporte no encontrado');
  return buildPdfFromMarkdown(r.data, opts.filename, opts.descargar);
}

/**
 * Genera un PDF real (estructura PDF valida) a partir del markdown del reporte.
 * Renderiza headings, paragrafos, listas, tablas, blockquotes, hr.
 */
async function buildPdfFromMarkdown(
  report: Report, filenameOverride?: string, descargar?: boolean,
): Promise<Blob> {
  const { pdfDeMarkdown } = await import('@/shared/lib/pdfDeMarkdown');
  const slug = (report.projectName || 'proyecto').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const m = report.metadata;
  return pdfDeMarkdown({
    cabecera: 'CRM MultiProyecto · Reporte mensual',
    cabeceraDerecha: report.projectName,
    titulo: `Reporte ${formatPeriodo(report.periodo)}`,
    subtitulo: `Proyecto: ${report.projectName} · Generado: ${new Date(report.createdAt).toLocaleString('es-ES')} · Por: ${report.generadoPor?.nombre || 'Sistema'}`,
    resumen: m
      ? `${m.leadsAnalizados} prospectos analizados  ·  ${m.conversionesAnalizadas} conversiones  ·  Facturacion: ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(m.facturacionTotal)}  ·  Fuentes: ${(m.fuentesDatos || []).join(', ')}`
      : undefined,
    contenido: report.content || '',
    pie: `Generado por Claude AI · ${new Date(report.createdAt).toLocaleDateString('es-ES')}`,
    nombreArchivo: filenameOverride || `reporte-${slug}-${report.periodo}.pdf`,
    descargar,
  });
}

function formatPeriodo(periodo?: string): string {
  if (!periodo) return '';
  const [y, m] = periodo.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}
