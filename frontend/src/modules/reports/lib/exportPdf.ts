// Export del reporte CRM (overview) a PDF — patrón clonado de reports-ia.api.ts
// CRM-F3-008. jsPDF directo sin html2canvas (los charts se materializan como tablas).

const ESTADOS: Record<string, string> = {
  nuevo: 'Nuevo',
  por_contactar: 'Por contactar',
  contactado: 'Contactado',
  en_seguimiento: 'En seguimiento',
  convertido: 'Convertido',
  no_interesado: 'No interesado',
};

interface Range { from: string; to: string }

interface OverviewData {
  leads: { total: number } & Record<string, number>;
  conversions: { cobrado: number; por_cobrar: number };
  tasa_conversion: number;
  leads_por_canal?: Array<{ canal: string; total: number }>;
  leads_por_gestor?: Array<{ gestor: string; total: number; convertidos: number }>;
  top_productos?: Array<{ producto: string; ventas: number; total: number; cobrado: number }>;
  ingresos_mensual?: Array<{ mes: string; ingresos: number }>;
  por_proyecto?: Array<{ project_id: number; nombre: string; leads: number; ventas: number; facturado: number; cobrado: number }>;
  // Los dos paneles que piden sus datos aparte. Llegan por aqui para que el
  // PDF lleve lo mismo que la pantalla y no media pagina.
  _panel?: any;
  _seguimiento?: any;
}

const fmtEur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n || 0));

export async function exportReportPDF(data: OverviewData, projectName: string | undefined, range: Range): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
  }
  function setStyle(size: number, weight: 'normal' | 'bold' | 'italic' = 'normal', color: string = '#0f172a') {
    doc.setFont('helvetica', weight); doc.setFontSize(size); doc.setTextColor(color);
  }

  // Header banner
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, PAGE_W, 14, 'F');
  setStyle(14, 'bold', '#ffffff');
  doc.text('CRM MultiProyecto · Reporte', MARGIN, 9.5);
  setStyle(9, 'normal', '#dbeafe');
  doc.text(projectName || 'Todos los proyectos', PAGE_W - MARGIN, 9.5, { align: 'right' });
  y = 24;

  // Título + metadata
  setStyle(20, 'bold', '#0f172a');
  doc.text('Reporte de actividad', MARGIN, y);
  y += 8;
  setStyle(9, 'normal', '#64748b');
  doc.text(`Período: ${range.from} → ${range.to}  ·  Generado: ${new Date().toLocaleString('es-ES')}`, MARGIN, y);
  y += 8;

  // KPI cards (4 cols)
  const kpis = [
    { label: 'Total prospectos', value: String(data.leads.total ?? 0) },
    { label: 'Tasa conversión', value: `${data.tasa_conversion ?? 0}%` },
    { label: 'Ventas cobradas', value: fmtEur(data.conversions?.cobrado || 0) },
    { label: 'Por cobrar', value: fmtEur(data.conversions?.por_cobrar || 0) },
  ];
  const kpiW = CONTENT_W / 4;
  const kpiH = 16;
  ensureSpace(kpiH + 4);
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * kpiW;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x + 1, y, kpiW - 2, kpiH, 1.5, 1.5, 'FD');
    setStyle(8, 'normal', '#64748b');
    doc.text(kpi.label, x + 4, y + 5);
    setStyle(13, 'bold', '#0f172a');
    doc.text(kpi.value, x + 4, y + 12);
  });
  y += kpiH + 6;

  // Tabla Pipeline
  const pipelineRows = Object.entries(ESTADOS).map(([k, label]) => [label, String(data.leads?.[k] ?? 0)]);
  drawTable(doc, ['Estado', 'Total'], pipelineRows, MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace, 'Pipeline de prospectos');

  // Tabla Leads por canal
  if (data.leads_por_canal?.length) {
    const rows = data.leads_por_canal.map(r => [r.canal, String(r.total)]);
    drawTable(doc, ['Canal', 'Total'], rows, MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace, 'Prospectos por canal');
  }

  // Tabla Leads por gestor
  if (data.leads_por_gestor?.length) {
    const rows = data.leads_por_gestor.map(g => {
      const tasa = g.total > 0 ? Math.round((g.convertidos / g.total) * 100) : 0;
      return [g.gestor, String(g.total), String(g.convertidos), `${tasa}%`];
    });
    drawTable(doc, ['Gestor', 'Total', 'Convertidos', 'Tasa'], rows, MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace, 'Prospectos por gestor');
  }

  // Cuanto pone cada proyecto. En el mismo sitio que en pantalla: detras de
  // los KPI, que es lo que explica de donde salen.
  if ((data.por_proyecto?.length ?? 0) > 1) {
    const rows = data.por_proyecto!.map(f => [
      f.nombre, String(f.leads), String(f.ventas), fmtEur(f.facturado), fmtEur(f.cobrado),
    ]);
    rows.push([
      'TOTAL',
      String(data.por_proyecto!.reduce((a, f) => a + Number(f.leads || 0), 0)),
      String(data.por_proyecto!.reduce((a, f) => a + Number(f.ventas || 0), 0)),
      fmtEur(data.por_proyecto!.reduce((a, f) => a + Number(f.facturado || 0), 0)),
      fmtEur(data.por_proyecto!.reduce((a, f) => a + Number(f.cobrado || 0), 0)),
    ]);
    drawTable(doc, ['Proyecto', 'Prospectos', 'Ventas', 'Facturado', 'Cobrado'], rows,
      MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace, 'Cuánto pone cada proyecto');
  }

  // Tabla Top productos
  if (data.top_productos?.length) {
    const rows = data.top_productos.map(p => [p.producto, String(p.ventas), fmtEur(p.total), fmtEur(p.cobrado)]);
    drawTable(doc, ['Producto', 'Ventas', 'Facturado', 'Cobrado'], rows, MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace, 'Top productos por ventas');
  }

  // Resumen del periodo
  if (data._panel?.kpis) {
    const k = data._panel.kpis;
    const num = (x: string) => Number(k?.[x]?.value ?? 0);
    const filas: string[][] = [];
    for (const [campo, etiqueta, dinero] of [
      ['prospectos', 'Prospectos', false], ['ventas', 'Ventas', false],
      ['vendido', 'Vendido', true], ['ingresos', 'Ingresos (dinero que entró)', true],
      ['ingresos_venta', '· de ventas', true], ['ingresos_cuotas', '· de cuotas', true],
      ['tasa', 'Tasa conversión', false],
    ] as Array<[string, string, boolean]>) {
      if (!k[campo]) continue;
      filas.push([etiqueta, dinero ? fmtEur(num(campo)) : String(num(campo)),
        k[campo].trend == null ? '—' : `${k[campo].trend}%`]);
    }
    if (filas.length) {
      drawTable(doc, ['Métrica', 'Valor', 'vs anterior'], filas, MARGIN, CONTENT_W,
        () => y, (newY) => { y = newY; }, ensureSpace, 'Resumen del periodo');
    }
  }

  // Seguimiento y tiempos
  if (data._seguimiento?.cohorte) {
    const co = data._seguimiento.cohorte;
    const ac = data._seguimiento.actividad || {};
    const seg = (v: any) => v == null ? '—' : (Number(v) < 86400
      ? `${(Number(v) / 3600).toFixed(1)} h` : `${(Number(v) / 86400).toFixed(1)} d`);
    drawTable(doc, ['Métrica', 'Valor'], [
      ['Entraron en el periodo', String(co.entraron)],
      ['Con seguimiento', `${co.con_seguimiento} (${co.pct_con_seguimiento}%)`],
      ['Compraron', `${co.compraron} (${co.pct_compraron}%)`],
      ['Mediana hasta el 1er contacto', seg(co.mediana_primer_contacto_seg)],
      ['Mediana hasta la venta', co.mediana_dias_venta == null ? '—' : `${co.mediana_dias_venta} días`],
      ['Contactos en el periodo', `${ac.toques} a ${ac.personas} personas`],
      // Escrito contra voz (#128): el documento comercial dice que la nota de
      // voz sube la tasa de respuesta, y esto es lo que permite comprobarlo.
      ...(ac.whatsapp_saliente ? [[
        'WhatsApp enviado',
        `${ac.whatsapp_saliente.escrito} escrito · ${ac.whatsapp_saliente.voz} de voz`
          + ` (${ac.whatsapp_saliente.pct_voz}%)`,
      ]] : []),
    ], MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace, 'Seguimiento y tiempos');

    if ((co.embudo || []).length) {
      drawTable(doc, ['Seguimiento', 'Llegaron', '%', 'Compraron', 'Tasa', 'Desde el anterior'],
        co.embudo.map((f: any) => [
          `${f.nivel}.º`, String(f.personas), `${f.pct}%`, String(f.compraron),
          `${f.tasa}%`, seg(f.mediana_desde_anterior_seg),
        ]), MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace,
        'Hasta qué seguimiento llega cada uno');
    }
  }

  // Tabla Ingresos mensuales
  if (data.ingresos_mensual?.length) {
    const rows = data.ingresos_mensual.map(r => [r.mes, fmtEur(r.ingresos)]);
    drawTable(doc, ['Mes', 'Ingresos'], rows, MARGIN, CONTENT_W, () => y, (newY) => { y = newY; }, ensureSpace, 'Ingresos mensuales');
  }

  // Footer en cada página
  const totalPages = doc.internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setStyle(7, 'normal', '#94a3b8');
    doc.text(`Página ${p} de ${totalPages}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' });
    doc.text(projectName || 'Todos los proyectos', MARGIN, PAGE_H - 8);
    doc.text(new Date().toLocaleDateString('es-ES'), PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  }

  const slug = (projectName || 'crm').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  doc.save(`reporte-${slug}-${range.from}_${range.to}.pdf`);
}

function drawTable(
  doc: any,
  headers: string[],
  rows: string[][],
  x: number,
  width: number,
  getY: () => number,
  setY: (n: number) => void,
  ensureSpace: (n: number) => void,
  title?: string,
) {
  const colCount = headers.length;
  const colW = width / colCount;
  const padding = 2;
  const lineH = 5;

  if (title) {
    ensureSpace(10);
    let y = getY();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor('#0f172a');
    doc.text(title, x, y + 4);
    setY(y + 7);
  }

  const all = [headers, ...rows];
  all.forEach((cells, idx) => {
    const isHeader = idx === 0;
    let maxH = lineH;
    cells.forEach((c) => {
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(isHeader ? 8 : 9);
      const lines: string[] = doc.splitTextToSize(c, colW - padding * 2);
      maxH = Math.max(maxH, lines.length * 4.5);
    });
    ensureSpace(maxH + 2);
    let y = getY();

    if (isHeader) {
      doc.setFillColor(241, 245, 249);
      doc.rect(x, y, width, maxH + 2, 'F');
    } else if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(x, y, width, maxH + 2, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.rect(x, y, width, maxH + 2);

    cells.forEach((c, ci) => {
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(isHeader ? 8 : 9);
      doc.setTextColor(isHeader ? '#475569' : '#0f172a');
      const lines: string[] = doc.splitTextToSize(c, colW - padding * 2);
      lines.forEach((l, li) => {
        doc.text(l, x + ci * colW + padding, y + 4 + li * 4.5);
      });
    });
    setY(y + maxH + 2);
  });
  setY(getY() + 4);
}
