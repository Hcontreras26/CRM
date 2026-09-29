/**
 * Un PDF a partir de markdown (#30, y arregla el reporte mensual).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTO VIVE AQUI Y NO EN `reports-ia`
 *
 * Estaba escrito ahi dentro, completo y funcionando —titulares, listas, tablas,
 * citas, pie con numero de pagina—, pero ENCERRADO detras de `if (USE_MOCKS)`.
 * Y `USE_MOCKS` es `false`.
 *
 * O sea que el boton «Exportar PDF» del reporte mensual iba por la otra rama:
 * pedia el PDF al servidor. Y el servidor contesta esto:
 *
 *     { success: true, data: { message: 'PDF server-side pendiente…' } }
 *
 * JSON. Que se guardaba con nombre `reporte.pdf` y no abria en ningun lector.
 * En produccion, desde que se subio.
 *
 * Asi que se saca aqui, se parametriza —el titulo, la cabecera y el pie los
 * pone quien llama, no van cableados a la forma de un reporte— y lo usan los
 * dos sitios que lo necesitan: el reporte mensual y la conversacion con la IA.
 *
 * NO SE PIDE AL SERVIDOR
 *
 * El markdown ya esta en el navegador. Mandarlo a un servidor que no sabe
 * hacerlo para que lo devuelva es un viaje de ida y vuelta para nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface OpcionesPdf {
  /** La banda de arriba, a la izquierda. */
  cabecera: string;
  /** La banda de arriba, a la derecha. Un proyecto, una marca. */
  cabeceraDerecha?: string;
  /** El titular grande. */
  titulo: string;
  /** La linea gris de debajo: quien, cuando, de que. */
  subtitulo?: string;
  /** La caja gris con cuatro datos sueltos. Opcional. */
  resumen?: string;
  /** El cuerpo, en markdown. */
  contenido: string;
  /** Lo que va abajo a la izquierda en cada pagina. */
  pie?: string;
  /** Como se llama el fichero. Sin `.pdf` se le pone. */
  nombreArchivo: string;
  /**
   * Si ademas de armarlo hay que descargarlo. Por defecto si.
   *
   * Existe porque generar y descargar son dos cosas: `doc.save()` escribe un
   * fichero, y en las pruebas eso dejaba un PDF suelto en el repositorio en
   * cada ejecucion. Quien comprueba el contenido no quiere el fichero.
   */
  descargar?: boolean;
}

/** Quita el markdown de una linea suelta: el PDF no pinta negritas en linea. */
function sinMarcas(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Genera el PDF y lo descarga. Devuelve el blob por si quien llama lo quiere.
 */
export async function pdfDeMarkdown(o: OpcionesPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });

  const ANCHO = 210;
  const ALTO = 297;
  const MARGEN = 18;
  const UTIL = ANCHO - MARGEN * 2;
  let y = MARGEN;

  const sitio = (necesario = 10) => {
    if (y + necesario > ALTO - MARGEN) { doc.addPage(); y = MARGEN; }
  };

  const estilo = (tam: number, peso = 'normal', color = '#0f172a') => {
    doc.setFont('helvetica', peso);
    doc.setFontSize(tam);
    doc.setTextColor(color);
  };

  const escribir = (texto: string, tam: number, peso: string, color = '#0f172a', sangria = 0) => {
    estilo(tam, peso, color);
    const lineas: string[] = doc.splitTextToSize(texto, UTIL - sangria);
    lineas.forEach((l: string) => {
      sitio(tam * 0.45);
      doc.text(l, MARGEN + sangria, y);
      y += tam * 0.45;
    });
  };

  // ── La banda de arriba ──
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, ANCHO, 14, 'F');
  estilo(14, 'bold', '#ffffff');
  doc.text(o.cabecera, MARGEN, 9.5);
  if (o.cabeceraDerecha) {
    estilo(9, 'normal', '#dbeafe');
    doc.text(o.cabeceraDerecha, ANCHO - MARGEN, 9.5, { align: 'right' });
  }
  y = 24;

  estilo(20, 'bold', '#0f172a');
  doc.text(o.titulo, MARGEN, y);
  y += 8;
  if (o.subtitulo) {
    estilo(9, 'normal', '#64748b');
    doc.text(o.subtitulo, MARGEN, y);
    y += 7;
  }
  if (o.resumen) {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(MARGEN, y, UTIL, 14, 1.5, 1.5, 'FD');
    estilo(8, 'normal', '#475569');
    doc.text(o.resumen, MARGEN + 3, y + 9);
    y += 22;
  }

  // ── El cuerpo ──
  const lineas = (o.contenido || '').split('\n');
  let enTabla = false;
  let filas: string[][] = [];

  const cerrarTabla = () => {
    if (!enTabla) return;
    pintarTabla(doc, filas, MARGEN, y, UTIL, (n) => sitio(n), (nueva) => { y = nueva; });
    enTabla = false;
    filas = [];
  };

  for (const cruda of lineas) {
    const linea = cruda.trimEnd();

    if (linea.startsWith('|') && linea.endsWith('|')) {
      const celdas = linea.split('|').slice(1, -1).map((c) => c.trim());
      // La fila de guiones dice la alineacion, no es contenido.
      if (celdas.every((c) => /^:?-+:?$/.test(c))) continue;
      filas.push(celdas.map(sinMarcas));
      enTabla = true;
      continue;
    }
    cerrarTabla();

    if (!linea) { y += 2.5; continue; }

    if (linea.startsWith('# ')) { sitio(12); escribir(sinMarcas(linea.slice(2)), 18, 'bold'); y += 2; continue; }
    if (linea.startsWith('## ')) {
      sitio(10); y += 3;
      escribir(sinMarcas(linea.slice(3)), 14, 'bold');
      doc.setDrawColor(226, 232, 240);
      doc.line(MARGEN, y, MARGEN + UTIL, y);
      y += 2;
      continue;
    }
    if (linea.startsWith('### ')) { sitio(9); y += 2; escribir(sinMarcas(linea.slice(4)), 12, 'bold', '#1e293b'); continue; }

    if (/^---+$/.test(linea)) {
      y += 2;
      doc.setDrawColor(226, 232, 240);
      doc.line(MARGEN, y, MARGEN + UTIL, y);
      y += 4;
      continue;
    }

    if (linea.startsWith('> ')) {
      sitio(8);
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.5);
      doc.line(MARGEN, y - 3, MARGEN, y + 3);
      escribir(sinMarcas(linea.slice(2)), 10, 'italic', '#475569', 4);
      doc.setLineWidth(0.2);
      continue;
    }

    if (linea.startsWith('- ') || linea.startsWith('* ')) {
      sitio(6);
      estilo(10, 'normal');
      doc.text('•', MARGEN, y);
      escribir(sinMarcas(linea.slice(2)), 10, 'normal', '#0f172a', 4);
      continue;
    }

    const numerada = linea.match(/^(\d+)\. (.+)$/);
    if (numerada) {
      sitio(6);
      estilo(10, 'normal');
      doc.text(`${numerada[1]}.`, MARGEN, y);
      escribir(sinMarcas(numerada[2]), 10, 'normal', '#0f172a', 6);
      continue;
    }

    escribir(sinMarcas(linea), 10, 'normal');
  }
  cerrarTabla();

  // ── El pie, en todas las paginas ──
  const paginas = doc.internal.pages.length - 1;
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    estilo(7, 'normal', '#94a3b8');
    doc.text(`Página ${p} de ${paginas}`, ANCHO / 2, ALTO - 8, { align: 'center' });
    if (o.pie) doc.text(o.pie, MARGEN, ALTO - 8);
  }

  if (o.descargar !== false) {
    const nombre = o.nombreArchivo.endsWith('.pdf') ? o.nombreArchivo : `${o.nombreArchivo}.pdf`;
    doc.save(nombre);
  }
  return doc.output('blob');
}

/** Una tabla con su cabecera, sus filas alternas y su rejilla. */
function pintarTabla(
  doc: any, filas: string[][], x: number, desdeY: number, ancho: number,
  sitio: (n: number) => void, avanzar: (nuevaY: number) => void,
): void {
  if (!filas.length) return;
  const columnas = filas[0].length;
  const anchoCol = ancho / columnas;
  const relleno = 2;
  let y = desdeY;

  filas.forEach((celdas, i) => {
    const esCabecera = i === 0;
    let alto = 5;
    celdas.forEach((c) => {
      doc.setFont('helvetica', esCabecera ? 'bold' : 'normal');
      doc.setFontSize(9);
      alto = Math.max(alto, doc.splitTextToSize(c, anchoCol - relleno * 2).length * 4.5);
    });
    sitio(alto + 2);

    if (esCabecera) {
      doc.setFillColor(241, 245, 249);
      doc.rect(x, y, ancho, alto + 2, 'F');
    } else if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(x, y, ancho, alto + 2, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.rect(x, y, ancho, alto + 2);

    celdas.forEach((c, ci) => {
      doc.setFont('helvetica', esCabecera ? 'bold' : 'normal');
      doc.setFontSize(esCabecera ? 8 : 9);
      doc.setTextColor(esCabecera ? '#475569' : '#0f172a');
      doc.splitTextToSize(c, anchoCol - relleno * 2).forEach((l: string, li: number) => {
        doc.text(l, x + ci * anchoCol + relleno, y + 4 + li * 4.5);
      });
    });
    y += alto + 2;
  });
  avanzar(y + 3);
}
