import { useEffect, useState, useRef } from 'react';
import Portal from '@/shared/components/ui/portal';
import Select from '@/shared/components/ui/Select';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';
import {
  X, UploadSimple, FileCsv, Check, WarningCircle, ArrowRight, Trash, Download,
} from '@phosphor-icons/react';

type FieldKey = 'nombre' | 'email' | 'telefono' | 'canal' | 'producto_interes' | 'notas';

interface FieldDef {
  key: FieldKey;
  label: string;
  required: boolean;
  hints: string[];
}

interface ParseResult {
  headers: string[];
  rows: string[][];
}

interface ImportError {
  line: number;
  error: string;
}

interface ImportProgress {
  done: number;
  ok: number;
  fail: number;
  errors: ImportError[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: number | null | undefined;
  onImported?: (result: { ok: number; fail: number }) => void;
}

const REQUIRED_FIELDS: FieldDef[] = [
  { key: 'nombre', label: 'Nombre', required: true, hints: ['nombre', 'name', 'first name', 'lead', 'cliente'] },
  { key: 'email', label: 'Email', required: true, hints: ['email', 'correo', 'e-mail', 'mail'] },
  { key: 'telefono', label: 'Teléfono', required: false, hints: ['telefono', 'phone', 'movil', 'celular', 'whatsapp'] },
  { key: 'canal', label: 'Canal', required: false, hints: ['canal', 'origen', 'source', 'utm_source'] },
  { key: 'producto_interes', label: 'Producto', required: false, hints: ['producto', 'product', 'curso', 'master'] },
  { key: 'notas', label: 'Notas', required: false, hints: ['notas', 'notes', 'observacion', 'comentario'] },
];

const MAX_ROWS = 200;

// Parser CSV simple (no maneja casos extremos de comillas anidadas pero ok para 95% de CSVs)
function parseCsv(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function autoMatchHeader(header: string, hints: string[]): boolean {
  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const h = norm(header);
  return hints.some(hint => h.includes(norm(hint)));
}

export default function CsvImportDialog({ open, onClose, projectId, onImported }: Props) {
  useEscapeKey(onClose, open);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1=upload, 2=mapping, 3=importing, 4=done
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult>({ headers: [], rows: [] });
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [progress, setProgress] = useState<ImportProgress>({ done: 0, ok: 0, fail: 0, errors: [] });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep(1); setFile(null); setParsed({ headers: [], rows: [] }); setMapping({});
      setProgress({ done: 0, ok: 0, fail: 0, errors: [] });
    }
  }, [open]);

  function handleFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = parseCsv(String(e.target?.result || ''));
      if (!data.headers.length) {
        toast({ title: 'CSV vacio o invalido', variant: 'destructive' });
        return;
      }
      if (data.rows.length > MAX_ROWS) {
        toast({ title: `Maximo ${MAX_ROWS} filas`, description: `Tu archivo tiene ${data.rows.length}. Solo se importaran las primeras ${MAX_ROWS}.`, variant: 'destructive' });
      }
      setParsed({ headers: data.headers, rows: data.rows.slice(0, MAX_ROWS) });
      // Auto-match headers
      const m: Partial<Record<FieldKey, number>> = {};
      REQUIRED_FIELDS.forEach(field => {
        const idx = data.headers.findIndex(h => autoMatchHeader(h, field.hints));
        if (idx !== -1) m[field.key] = idx;
      });
      setMapping(m);
      setStep(2);
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!projectId) return;
    setStep(3);
    let ok = 0, fail = 0;
    const errors: ImportError[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const data: Partial<Record<FieldKey, string>> = {};
      REQUIRED_FIELDS.forEach(field => {
        const idx = mapping[field.key];
        if (idx != null && row[idx]) data[field.key] = row[idx];
      });
      if (!data.nombre || !data.email) {
        fail++;
        errors.push({ line: i + 2, error: 'Falta nombre o email' });
        setProgress({ done: i + 1, ok, fail, errors: errors.slice(0, 5) });
        continue;
      }
      try {
        const res = await client.post('/leads', {
          project_id: projectId,
          nombre: data.nombre,
          email: data.email,
          telefono: data.telefono || '',
          canal: data.canal || 'directo',
          notas: data.notas || '',
        });
        if (res.success) ok++;
        else { fail++; errors.push({ line: i + 2, error: res.error || 'Error desconocido' }); }
      } catch (err: any) {
        fail++;
        errors.push({ line: i + 2, error: err?.data?.error || err.message });
      }
      setProgress({ done: i + 1, ok, fail, errors: errors.slice(0, 5) });
    }
    setStep(4);
    onImported?.({ ok, fail });
  }

  function downloadTemplate() {
    const csv = 'nombre,email,telefono,canal,producto_interes,notas\nMaria Lopez,maria@ejemplo.com,+34666111222,meta_ads,Master Forensia,Interesada en Q2\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'template-prospectos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const allRequiredMapped = REQUIRED_FIELDS.filter(f => f.required).every(f => mapping[f.key] != null);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[80] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-sm" onClick={step !== 3 ? onClose : undefined} />
        <div role="dialog" className="relative bg-card sm:rounded-lg border border-border w-full max-w-2xl flex flex-col h-full sm:h-auto sm:max-h-[88vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <UploadSimple size={18} weight="regular" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Importar prospectos desde CSV</h2>
                <p className="text-xs text-muted-foreground">Maximo {MAX_ROWS} filas por import</p>
              </div>
            </div>
            {step !== 3 && (
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Step 1: upload */}
          {step === 1 && (
            <div className="p-5 space-y-4 overflow-y-auto">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/30'
                }`}
              >
                <FileCsv size={36} weight="regular" className="text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold text-sm">Arrastra el CSV aqui o haz click</p>
                <p className="text-xs text-muted-foreground mt-1">Formato: cabecera obligatoria, columnas detectadas automaticamente</p>
                <input ref={inputRef} type="file" accept=".csv,text/csv" hidden
                  onChange={(e) => handleFile(e.target.files?.[0])} />
              </div>

              <div className="bg-muted/30 border border-border rounded-md p-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileCsv size={14} className="text-muted-foreground" /> Formato esperado
                </h4>
                <p className="text-xs text-muted-foreground">
                  Cabeceras detectadas automaticamente: <code className="bg-muted px-1 rounded">nombre</code>,
                  <code className="bg-muted px-1 rounded">email</code>,
                  <code className="bg-muted px-1 rounded">telefono</code>,
                  <code className="bg-muted px-1 rounded">canal</code>,
                  <code className="bg-muted px-1 rounded">producto_interes</code>,
                  <code className="bg-muted px-1 rounded">notas</code>.
                </p>
                <p className="text-xs text-muted-foreground">
                  En el siguiente paso podras mapear columnas si tu CSV usa nombres diferentes.
                </p>
                <button onClick={downloadTemplate}
                  className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1 mt-1">
                  <Download size={12} weight="bold" /> Descargar plantilla CSV
                </button>
              </div>
            </div>
          )}

          {/* Step 2: mapping + preview */}
          {step === 2 && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">Archivo cargado</h3>
                  <button onClick={() => { setFile(null); setStep(1); }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <Trash size={12} /> Cambiar archivo
                  </button>
                </div>
                <div className="bg-muted/30 border border-border rounded-md px-3 py-2 text-sm flex items-center gap-2">
                  <FileCsv size={16} className="text-muted-foreground" />
                  <span className="font-medium">{file?.name}</span>
                  <span className="text-muted-foreground text-xs">— {parsed.rows.length} filas</span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2">Mapeo de columnas</h3>
                <p className="text-xs text-muted-foreground mb-3">Empareja cada campo del CRM con la columna correspondiente del CSV. Detectamos algunas automaticamente.</p>
                <div className="space-y-2">
                  {REQUIRED_FIELDS.map(field => (
                    <div key={field.key} className="flex items-center gap-3">
                      <div className="w-32 text-xs font-medium flex-shrink-0">
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                      </div>
                      <ArrowRight size={12} className="text-muted-foreground flex-shrink-0" />
                      <Select<number | null>
                        value={mapping[field.key] ?? null}
                        onChange={(v) => setMapping(m => ({ ...m, [field.key]: v == null ? undefined : v }))}
                        options={[
                          { value: null, label: '— Sin mapear —' },
                          ...parsed.headers.map((h, i) => ({ value: i, label: h || `Columna ${i + 1}` })),
                        ]}
                        ariaLabel={`Mapear campo ${field.key}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2">Vista previa (primeras 5 filas)</h3>
                <div className="overflow-x-auto bg-card border border-border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        {REQUIRED_FIELDS.map(f => (
                          <th key={f.key} className="text-left px-3 py-2 font-bold whitespace-nowrap">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="border-t border-border">
                          {REQUIRED_FIELDS.map(f => {
                            const idx = mapping[f.key];
                            const val = idx != null ? row[idx] : '';
                            const missing = f.required && !val;
                            return (
                              <td key={f.key} className={`px-3 py-2 ${missing ? 'text-destructive font-medium' : ''}`}>
                                {val || (missing ? '—' : <span className="text-muted-foreground">—</span>)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: importing */}
          {step === 3 && (
            <div className="flex-1 p-5 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-md bg-primary/10 flex items-center justify-center">
                <UploadSimple size={28} weight="regular" className="text-primary animate-pulse" />
              </div>
              <div>
                <p className="font-semibold">Importando…</p>
                <p className="text-sm text-muted-foreground">{progress.done} / {parsed.rows.length} filas procesadas</p>
              </div>
              <div className="w-full max-w-xs h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all"
                  style={{ width: `${(progress.done / Math.max(1, parsed.rows.length)) * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-success font-semibold">{progress.ok} OK</span> ·
                <span className="text-destructive font-semibold ml-2">{progress.fail} errores</span>
              </p>
            </div>
          )}

          {/* Step 4: done */}
          {step === 4 && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-md bg-success-soft text-success flex items-center justify-center mx-auto">
                  <Check size={28} weight="bold" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Importación completada</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="text-success font-semibold">{progress.ok}</span> creados ·
                    <span className="text-destructive font-semibold ml-2">{progress.fail}</span> errores
                  </p>
                </div>
              </div>

              {progress.errors.length > 0 && (
                <div className="bg-destructive-soft border border-destructive/30 rounded-md p-3">
                  <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1">
                    <WarningCircle size={12} weight="fill" /> Primeros errores
                  </p>
                  <ul className="text-xs space-y-1 text-destructive">
                    {progress.errors.map((e, i) => (
                      <li key={i}>Fila {e.line}: {e.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/20">
            {step === 1 && (
              <button onClick={onClose}
                className="inline-flex items-center h-9 px-4 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted">
                Cerrar
              </button>
            )}
            {step === 2 && (
              <>
                <button onClick={() => setStep(1)}
                  className="inline-flex items-center h-9 px-4 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted">
                  Atras
                </button>
                <button onClick={handleImport} disabled={!allRequiredMapped}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                  <UploadSimple size={14} weight="bold" /> Importar {parsed.rows.length} prospectos
                </button>
              </>
            )}
            {step === 4 && (
              <button onClick={onClose}
                className="inline-flex items-center h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90">
                <Check size={14} weight="bold" className="mr-1" /> Listo
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
