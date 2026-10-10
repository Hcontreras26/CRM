import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { Button } from '@/shared/components/ui/button';
import Field from '@/shared/components/ui/Field';
import FilaCampos from '@/shared/components/ui/FilaCampos';
import Select from '@/shared/components/ui/Select';
import { inputClass } from '@/shared/lib/ui';
import {
  AREAS, AREA_ES, FORMAS_PAGO, FORMA_PAGO_ES, MODALIDADES, MODALIDAD_ES, diaDelPago, euros, facturasColaboradorApi,
  fechaHora, normalizarImporte,
  type Area, type Colaborador, type DesgloseDeFactura, type EmpresaDelColaborador, type EmpresaDelGrupo, type FormaPago,
  type LineaRegistro, type Modalidad,
} from '../api/facturasColaborador.api';

/** El marco de los diálogos de esta pantalla. */
export function Dialogo({ titulo, alCerrar, children, ancho = 'max-w-lg' }: {
  titulo: string; alCerrar: () => void; children: React.ReactNode; ancho?: string;
}) {
  return (
    // `!m-0`: el contenedor de la página pone margen al primer hijo (como en Certifex).
    <div role="dialog" aria-label={titulo} className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={alCerrar}>
      <div onClick={(e) => e.stopPropagation()}
        className={`bg-card border border-border rounded-lg shadow-2xl w-full ${ancho} max-h-[85vh] overflow-y-auto`}>
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <h2 className="font-bold">{titulo}</h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// En hora local: con `toISOString` (UTC), el día 1 de 00:00 a 02:00 en Madrid salía el mes anterior.
const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
// Firefox no tiene el selector de mes y deja escribir: solo vale «AAAA-MM».
export const esMes = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const errorDe = (err: any) => err?.data?.error || err?.message || 'Inténtalo de nuevo';

/* ─────────────────────────── alta y edición ─────────────────────────── */

interface UsuarioColaborador { id: number; nombre: string; email: string }

/** Una empresa marcada, tal como se escribe en el formulario (texto; vacío = sin poner). */
interface FormEmpresa { acordado: string; modalidad: Modalidad | ''; fijo: string; tarifa: string; iva: string; irpf: string }

const texto = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));
const deLaFicha = (e: EmpresaDelColaborador): FormEmpresa => ({
  acordado: texto(e.importe_acordado), modalidad: e.modalidad ?? '',
  fijo: texto(e.importe_fijo), tarifa: texto(e.tarifa_hora), iva: texto(e.iva_pct), irpf: texto(e.irpf_pct),
});
const VACIA: FormEmpresa = { acordado: '', modalidad: '', fijo: '', tarifa: '', iva: '', irpf: '' };
/** Texto a número (vacío → null; mal escrito → NaN, para avisar). */
const numero = (v: string) => (v.trim() === '' ? null : Number(normalizarImporte(v)));

export function ColaboradorDialog({ colaborador, empresas, alCerrar, alGuardar }: {
  colaborador: Colaborador | null;
  empresas: EmpresaDelGrupo[];
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const c = colaborador;
  const [nombre, setNombre] = useState(c?.nombre ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [nif, setNif] = useState(c?.nif ?? '');
  const [area, setArea] = useState<Area>(c?.area ?? 'otra');
  const [notas, setNotas] = useState(c?.notas ?? '');
  const [altaDesde, setAltaDesde] = useState(c?.alta_desde ?? '');
  const [userId, setUserId] = useState<number | null>(c?.user_id ?? null);
  // Empresa marcada → lo acordado y cómo cobra de ella.
  const [marcadas, setMarcadas] = useState<Record<number, FormEmpresa>>(() => Object.fromEntries(
    (c?.empresas ?? []).map((e) => [e.issuer_id, deLaFicha(e)]),
  ));
  const cambiar = (id: number, campo: keyof FormEmpresa, valor: string) =>
    setMarcadas((m) => ({ ...m, [id]: { ...m[id], [campo]: valor } }));
  const [usuarios, setUsuarios] = useState<UsuarioColaborador[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Su usuario del CRM, si lo tiene: los que tienen el rol colaborador (#210).
  useEffect(() => {
    client.get('/users?role=colaborador&active=true&limit=100')
      .then((r: any) => setUsuarios(r.data || []))
      .catch(() => setUsuarios([]));
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const nombreDe = (id: number) => empresas.find((x) => x.id === id)?.razon_social ?? 'esa empresa';
    const ids = Object.keys(marcadas).map(Number);
    if (!ids.length) { setError('Elige al menos una empresa a la que factura.'); return; }
    // Cómo cobra de cada una: sin eso no se puede pedir ni comprobar el desglose.
    for (const id of ids) {
      const f = marcadas[id];
      if (!f.modalidad) { setError(`Elige cómo cobra de ${nombreDe(id)}.`); return; }
      if (f.modalidad === 'fijo' && !f.fijo.trim()) { setError(`Pon el importe fijo de ${nombreDe(id)}.`); return; }
      if (f.modalidad !== 'fijo' && !f.tarifa.trim()) { setError(`Pon la tarifa por hora de ${nombreDe(id)}.`); return; }
      if (!f.iva.trim() || !f.irpf.trim()) { setError(`Pon el IVA y el IRPF de ${nombreDe(id)} (0 si no lleva).`); return; }
    }
    const lista = ids.map((id) => {
      const f = marcadas[id];
      return {
        issuer_id: id,
        importe_acordado: numero(f.acordado),
        modalidad: f.modalidad || null,
        importe_fijo: f.modalidad === 'fijo' ? numero(f.fijo) : null,
        tarifa_hora: f.modalidad !== 'fijo' ? numero(f.tarifa) : null,
        iva_pct: numero(f.iva),
        irpf_pct: numero(f.irpf),
      };
    });
    const numeros = lista.flatMap((l) => [l.importe_acordado, l.importe_fijo, l.tarifa_hora, l.iva_pct, l.irpf_pct]);
    if (numeros.some((n) => n !== null && !Number.isFinite(n))) {
      setError('Revisa los importes y porcentajes: tienen que ser números.'); return;
    }
    const cuerpo = {
      nombre: nombre.trim(), email: email.trim(), nif: nif.trim() || null, area,
      notas: notas.trim() || null, alta_desde: altaDesde || null, user_id: userId, empresas: lista,
    };
    setGuardando(true);
    setError(null);
    try {
      if (c) await facturasColaboradorApi.editar(c.id, cuerpo);
      else await facturasColaboradorApi.crear(cuerpo);
      toast({ title: c ? 'Colaborador guardado' : 'Colaborador dado de alta' });
      alGuardar();
    } catch (err) {
      setError(errorDe(err));
    } finally { setGuardando(false); }
  }

  // Factura también a otras empresas: este admin solo cambia lo de las suyas.
  const soloSusEmpresas = Boolean(c?.compartido);

  return (
    <Dialogo titulo={c ? `Editar · ${c.nombre}` : 'Añadir colaborador'} alCerrar={alCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} className="space-y-4" noValidate>
        {soloSusEmpresas && (
          <p className="rounded-md bg-info-soft text-info-soft-foreground px-3 py-2 text-secundario">
            También factura a otras empresas: sus datos, su baja y su alta los cambia el super admin.
            Tú puedes cambiar lo de tu empresa (si factura a ella y lo acordado).
          </p>
        )}
        <fieldset disabled={soloSusEmpresas} className="space-y-4 disabled:opacity-60">
        <FilaCampos>
          <Field label="Nombre" htmlFor="col-nombre" required>
            <input id="col-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Correo" htmlFor="col-email" required hint="Al que le llega el enlace de cada mes">
            <input id="col-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
        </FilaCampos>
        <FilaCampos>
          <Field label="NIF" htmlFor="col-nif" hint="Opcional">
            <input id="col-nif" value={nif} onChange={(e) => setNif(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Área">
            <Select<Area> value={area} onChange={setArea} ariaLabel="Área"
              options={AREAS.map((a) => ({ value: a, label: AREA_ES[a] }))} />
          </Field>
        </FilaCampos>
        </fieldset>

        <Field label="Empresas a las que factura" required
          hint="Una o varias. El importe acordado es opcional: se le enseña como referencia. Cómo cobra, el IVA y el IRPF sirven para comprobar su factura">
          <div className="space-y-2">
            {empresas.map((e) => {
              const on = e.id in marcadas;
              const f = marcadas[e.id];
              return (
                <div key={e.id} className={on ? 'rounded-md border border-border p-2 space-y-2' : ''}>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm min-w-0 flex-1">
                      <input type="checkbox" checked={on} onChange={() => setMarcadas((m) => {
                        const n = { ...m };
                        if (on) delete n[e.id]; else n[e.id] = { ...VACIA };
                        return n;
                      })} />
                      <span className="truncate">{e.razon_social}</span>
                    </label>
                    {on && (
                      <div className="w-40 flex-none">
                        <input aria-label={`Importe acordado con ${e.razon_social}`} inputMode="decimal" placeholder="€/mes (opcional)"
                          value={f.acordado} onChange={(ev) => cambiar(e.id, 'acordado', ev.target.value)}
                          className={inputClass} />
                      </div>
                    )}
                  </div>
                  {on && (
                    // Cómo cobra de esta empresa: fijo, por hora o por proyecto, con su IVA e IRPF.
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">Cómo cobra</span>
                        <Select<string> value={f.modalidad} onChange={(v) => cambiar(e.id, 'modalidad', v)}
                          ariaLabel={`Cómo cobra de ${e.razon_social}`}
                          options={[{ value: '', label: 'Elige…' }, ...MODALIDADES.map((m) => ({ value: m, label: MODALIDAD_ES[m] }))]} />
                      </label>
                      {f.modalidad === 'fijo' ? (
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Fijo €/mes (base)</span>
                          <input aria-label={`Importe fijo con ${e.razon_social}`} inputMode="decimal"
                            value={f.fijo} onChange={(ev) => cambiar(e.id, 'fijo', ev.target.value)} className={inputClass} />
                        </label>
                      ) : (
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Tarifa €/h</span>
                          <input aria-label={`Tarifa por hora con ${e.razon_social}`} inputMode="decimal"
                            disabled={!f.modalidad}
                            value={f.tarifa} onChange={(ev) => cambiar(e.id, 'tarifa', ev.target.value)} className={inputClass} />
                        </label>
                      )}
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">IVA %</span>
                        <input aria-label={`IVA % con ${e.razon_social}`} inputMode="decimal"
                          disabled={!f.modalidad}
                          value={f.iva} onChange={(ev) => cambiar(e.id, 'iva', ev.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">IRPF %</span>
                        <input aria-label={`IRPF % con ${e.razon_social}`} inputMode="decimal"
                          disabled={!f.modalidad}
                          value={f.irpf} onChange={(ev) => cambiar(e.id, 'irpf', ev.target.value)} className={inputClass} />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Field>

        <fieldset disabled={soloSusEmpresas} className="space-y-4 disabled:opacity-60">
        <FilaCampos>
          <Field label="Desde qué mes" htmlFor="col-alta" hint="Vacío: desde ya">
            <input id="col-alta" type="month" value={altaDesde} onChange={(e) => setAltaDesde(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Su usuario del CRM" hint="Solo si lo tiene: entonces ve «Mi factura»">
            <Select<string> value={userId ? String(userId) : ''} onChange={(v) => setUserId(v ? Number(v) : null)} ariaLabel="Usuario del CRM"
              options={[{ value: '', label: 'Sin usuario' }, ...usuarios.map((u) => ({ value: String(u.id), label: `${u.nombre} · ${u.email}` }))]} />
          </Field>
        </FilaCampos>

        <Field label="Notas" htmlFor="col-notas">
          <textarea id="col-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={`${inputClass} h-auto py-2`} />
        </Field>
        </fieldset>

        {error && <p role="alert" className="rounded-md bg-destructive-soft text-destructive-soft-foreground px-3 py-2 text-secundario">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </form>
    </Dialogo>
  );
}

/* ─────────────────────────── baja ─────────────────────────── */

export function BajaDialog({ colaborador, alCerrar, alGuardar }: {
  colaborador: Colaborador; alCerrar: () => void; alGuardar: () => void;
}) {
  const [desde, setDesde] = useState(mesActual());
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      await facturasColaboradorApi.darDeBaja(colaborador.id, desde);
      toast({ title: `${colaborador.nombre}, de baja desde ${desde}` });
      alGuardar();
    } catch (err) {
      toast({ title: 'No se pudo dar de baja', description: errorDe(err), variant: 'destructive' });
    } finally { setGuardando(false); }
  }
  return (
    <Dialogo titulo={`Dar de baja · ${colaborador.nombre}`} alCerrar={alCerrar}>
      <div className="space-y-4">
        <Field label="Desde qué mes deja de recibir el enlace" htmlFor="baja-desde" required>
          <input id="baja-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button variant="destructive" onClick={guardar} disabled={guardando || !esMes(desde)}>Dar de baja</Button>
        </div>
      </div>
    </Dialogo>
  );
}

/** Volver a darlo de alta, desde un mes («desde qué mes entra»). */
export function AltaDialog({ colaborador, alCerrar, alGuardar }: {
  colaborador: Colaborador; alCerrar: () => void; alGuardar: () => void;
}) {
  const [desde, setDesde] = useState(mesActual());
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      await facturasColaboradorApi.volverDeAlta(colaborador.id, desde);
      toast({ title: `${colaborador.nombre}, de alta otra vez desde ${desde}` });
      alGuardar();
    } catch (err) {
      toast({ title: 'No se pudo dar de alta', description: errorDe(err), variant: 'destructive' });
    } finally { setGuardando(false); }
  }
  return (
    <Dialogo titulo={`Volver a dar de alta · ${colaborador.nombre}`} alCerrar={alCerrar}>
      <div className="space-y-4">
        <Field label="Desde qué mes vuelve a recibir el enlace" htmlFor="alta-desde" required>
          <input id="alta-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || !esMes(desde)}>Dar de alta</Button>
        </div>
      </div>
    </Dialogo>
  );
}

/* ─────────────────────────── anular ─────────────────────────── */

export function AnularDialog({ facturaId, quien, alCerrar, alGuardar }: {
  facturaId: number; quien: string; alCerrar: () => void; alGuardar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      await facturasColaboradorApi.anular(facturaId, motivo.trim());
      toast({ title: 'Factura anulada', description: 'Se le manda un enlace nuevo para subirla otra vez.' });
      alGuardar();
    } catch (err) {
      toast({ title: 'No se pudo anular', description: errorDe(err), variant: 'destructive' });
    } finally { setGuardando(false); }
  }
  return (
    <Dialogo titulo={`Anular la factura · ${quien}`} alCerrar={alCerrar}>
      <div className="space-y-4">
        <p className="text-secundario text-muted-foreground">
          El archivo no se borra: queda marcado como anulado. Al colaborador le llega un enlace nuevo para subirla otra vez.
        </p>
        <Field label="Motivo" htmlFor="anular-motivo" required>
          <textarea id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
            placeholder="Por ejemplo: subió la de agosto" className={`${inputClass} h-auto py-2`} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button variant="destructive" onClick={guardar} disabled={guardando || motivo.trim().length < 3}>Anular</Button>
        </div>
      </div>
    </Dialogo>
  );
}

/* ─────────────────────────── el pago (segunda parte) ─────────────────────────── */

// Hoy en hora local, «AAAA-MM-DD» (con `toISOString` de 00:00 a 02:00 en Madrid salía ayer).
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * «Marcar pagada» («Añadido 01/10 (tarde)»): la fecha (hoy por defecto), la
 * forma de pago y, si se quiere, el justificante. Una o varias a la vez.
 */
export function PagarDialog({ facturas, alCerrar, alGuardar }: {
  facturas: { id: number; quien: string; importe: number | string | null }[];
  alCerrar: () => void; alGuardar: () => void;
}) {
  const [fecha, setFecha] = useState(hoy());
  const [forma, setForma] = useState<FormaPago>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [justificante, setJustificante] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const total = facturas.reduce((s, f) => s + (f.importe === null ? 0 : Number(f.importe)), 0);

  async function guardar() {
    setGuardando(true);
    try {
      await facturasColaboradorApi.pagar(facturas.map((f) => f.id), { fecha, forma_pago: forma, referencia_pago: referencia.trim() }, justificante);
      toast({
        title: facturas.length === 1 ? 'Factura pagada' : `${facturas.length} facturas pagadas`,
        description: 'Se le avisa al colaborador.',
      });
      alGuardar();
    } catch (err) {
      toast({ title: 'No se pudo marcar pagada', description: errorDe(err), variant: 'destructive' });
    } finally { setGuardando(false); }
  }

  return (
    <Dialogo titulo={facturas.length === 1 ? `Marcar pagada · ${facturas[0].quien}` : `Marcar pagadas · ${facturas.length} facturas`} alCerrar={alCerrar}>
      <div className="space-y-4">
        {facturas.length > 1 && (
          <ul className="max-h-32 overflow-y-auto text-secundario text-muted-foreground space-y-0.5">
            {facturas.map((f) => <li key={f.id}>{f.quien} · {euros(f.importe)}</li>)}
          </ul>
        )}
        <p className="text-sm">Total: <strong className="tabular-nums">{euros(total)}</strong></p>
        <FilaCampos>
          <Field label="Fecha del pago" htmlFor="pago-fecha" required>
            <input id="pago-fecha" type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Forma de pago" required>
            <Select<FormaPago> value={forma} onChange={setForma} ariaLabel="Forma de pago"
              options={FORMAS_PAGO.map((f) => ({ value: f, label: FORMA_PAGO_ES[f] }))} />
          </Field>
        </FilaCampos>
        <Field label="Referencia" htmlFor="pago-referencia" hint="Opcional: la de la transferencia, por ejemplo">
          <input id="pago-referencia" value={referencia} maxLength={100} onChange={(e) => setReferencia(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Justificante" htmlFor="pago-justificante" hint="Opcional: PDF o foto (JPG, PNG), hasta 10 MB">
          <input id="pago-justificante" type="file" accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setJustificante(e.target.files?.[0] ?? null)} className="text-sm" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || !fecha}>{guardando ? 'Guardando…' : 'Marcar pagada'}</Button>
        </div>
      </div>
    </Dialogo>
  );
}

/** «Se puede deshacer con motivo»: vuelve a «por pagar». */
export function DeshacerPagoDialog({ facturaId, quien, alCerrar, alGuardar }: {
  facturaId: number; quien: string; alCerrar: () => void; alGuardar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      await facturasColaboradorApi.deshacerPago(facturaId, motivo.trim());
      toast({ title: 'Pago deshecho', description: 'Vuelve a «por pagar».' });
      alGuardar();
    } catch (err) {
      toast({ title: 'No se pudo deshacer el pago', description: errorDe(err), variant: 'destructive' });
    } finally { setGuardando(false); }
  }
  return (
    <Dialogo titulo={`Deshacer el pago · ${quien}`} alCerrar={alCerrar}>
      <div className="space-y-4">
        <p className="text-secundario text-muted-foreground">
          La factura vuelve a «por pagar». La fecha, la forma y la referencia del pago quedan en el registro.
        </p>
        <Field label="Motivo" htmlFor="deshacer-motivo" required>
          <textarea id="deshacer-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
            placeholder="Por ejemplo: la transferencia era de otra factura" className={`${inputClass} h-auto py-2`} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button variant="destructive" onClick={guardar} disabled={guardando || motivo.trim().length < 3}>Deshacer el pago</Button>
        </div>
      </div>
    </Dialogo>
  );
}

/* ─────────────────────────── registro ─────────────────────────── */

const EVENTO: Record<string, string> = {
  alta: 'Alta en la lista', baja: 'Baja de la lista', cambio: 'Cambio en la ficha',
  enviado: 'Correo enviado', no_enviado: 'No se pudo enviar', abierto: 'Enlace abierto',
  recibida: 'Factura recibida', acuse: 'Acuse enviado', recordatorio: 'Recordatorio enviado',
  anulada: 'Factura anulada', reenviado: 'Enlace nuevo', caducado: 'Enlace caducado',
  pagada: 'Factura pagada', pago_deshecho: 'Pago deshecho', aviso_pago: 'Aviso de pago enviado',
};

const CAMPO: Record<string, string> = {
  nombre: 'nombre', email: 'correo', nif: 'NIF', area: 'área', notas: 'notas', user_id: 'usuario', alta_desde: 'desde',
};
const valor = (k: string, v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'area') return AREA_ES[v as Area] || String(v);
  if (k === 'alta_desde') return String(v).slice(0, 7);
  return String(v);
};
/** «nombre: prueba → prueba editada»; las empresas, con su importe acordado. */
function cambiosDe(d: Record<string, any>) {
  return Object.entries(d).map(([k, c]) => {
    if (k === 'empresas') {
      const lista = (l: any[]) => (l || []).map((e) => (e.importe_acordado === null ? `#${e.issuer_id}` : `#${e.issuer_id} ${euros(e.importe_acordado)}`)).join(', ') || '—';
      return `empresas: ${lista(c?.antes)} → ${lista(c?.despues)}`;
    }
    return `${CAMPO[k] || k}: ${valor(k, c?.antes)} → ${valor(k, c?.despues)}`;
  }).join(' · ');
}

/** «88.12.x.x», como en la definición: basta para reconocerla sin enseñarla entera. */
const ipCorta = (ip: string) => {
  const v4 = ip.replace(/^::ffff:/, '').match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  return v4 ? `${v4[1]}.${v4[2]}.x.x` : ip;
};

/** «factura-sept.pdf (214 KB) · 600,00 € · n.º F-2026-09», como en la definición. */
function detalleDe(l: LineaRegistro) {
  const d = l.detalle || {};
  const partes: string[] = [];
  if (d.archivo) partes.push(`${d.archivo}${d.tamano ? ` (${Math.ceil(Number(d.tamano) / 1024)} KB)` : ''}`);
  if (d.importe !== undefined && d.importe !== null) partes.push(euros(d.importe as number));
  if (d.numero_factura) partes.push(`n.º ${d.numero_factura}`);
  if (d.numero_recepcion) partes.push(String(d.numero_recepcion));
  // El desglose y el pago (segunda parte).
  if (d.cuadra === false) partes.push(`no cuadra (el desglose da ${euros(d.total as number)})`);
  if (d.forma_pago) partes.push(`${FORMA_PAGO_ES[d.forma_pago as FormaPago] || d.forma_pago} del ${diaDelPago(String(d.fecha))}`);
  if (d.referencia_pago) partes.push(`ref. ${d.referencia_pago}`);
  if (d.justificante) partes.push(`justificante ${d.justificante}`);
  if (d.junto_con) partes.push(`junto con otras ${Number(d.junto_con) - 1}`);
  const antes = d.antes as { fecha?: string; forma_pago?: FormaPago } | undefined;
  if (antes?.fecha) partes.push(`era ${(antes.forma_pago && FORMA_PAGO_ES[antes.forma_pago]) || 'pago'} del ${diaDelPago(antes.fecha)}`);
  if (d.motivo) partes.push(`«${d.motivo}»`);
  if (d.desde) partes.push(`desde ${String(d.desde).slice(0, 7)}`);
  if (d.para) partes.push(`a ${d.para}`);
  if (l.evento === 'cambio') return [cambiosDe(d), l.usuario_nombre ? `por ${l.usuario_nombre}` : null, l.ip ? ipCorta(l.ip) : null].filter(Boolean).join(' · ');
  if (l.usuario_nombre) partes.push(`por ${l.usuario_nombre}`);
  if (l.ip) partes.push(ipCorta(l.ip));
  return partes.join(' · ');
}

/**
 * El desglose de una factura, arriba del registro (segunda parte): «Administración lo ve
 * todo». Las líneas que declaró el colaborador y lo que calculó el CRM con su IVA e IRPF.
 */
function DesgloseDeLaFactura({ d }: { d: DesgloseDeFactura }) {
  return (
    <div className="mb-4 rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border text-sm">
        <strong>Desglose</strong>
        {d.cuadra === false && (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-warning-soft text-warning-soft-foreground">
            No cuadra: su factura dice {euros(d.importe)}
          </span>
        )}
        {d.cuadra === true && (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-success-soft text-success-soft-foreground">Cuadra con su factura</span>
        )}
      </div>
      <table className="w-full text-tabla">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5">Encargo</th><th className="px-3 py-1.5">Campus</th>
            <th className="px-3 py-1.5 text-right">Horas</th><th className="px-3 py-1.5 text-right">Tarifa</th><th className="px-3 py-1.5 text-right">Importe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {d.lineas.map((l) => (
            <tr key={l.orden}>
              <td className="px-3 py-1.5">{l.concepto}</td>
              <td className="px-3 py-1.5">{l.campus ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.horas === null ? '—' : l.horas.toLocaleString('es-ES')}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.tarifa === null ? '—' : `${euros(l.tarifa)}/h`}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{euros(l.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 border-t border-border px-3 py-2 text-sm tabular-nums">
        <dt className="text-muted-foreground">Base</dt><dd className="text-right">{euros(d.base)}</dd>
        <dt className="text-muted-foreground">IVA</dt><dd className="text-right">{euros(d.iva)}</dd>
        <dt className="text-muted-foreground">IRPF</dt><dd className="text-right">{d.irpf ? `−${euros(d.irpf)}` : euros(d.irpf)}</dd>
        <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{euros(d.total)}</dd>
      </dl>
    </div>
  );
}

export function RegistroDialog({ titulo, cargar, cargarDesglose, alCerrar }: {
  titulo: string; cargar: () => Promise<LineaRegistro[]>; alCerrar: () => void;
  /** Si la factura tiene desglose, se enseña arriba del registro. */
  cargarDesglose?: () => Promise<DesgloseDeFactura>;
}) {
  const [lineas, setLineas] = useState<LineaRegistro[] | null>(null);
  const [desglose, setDesglose] = useState<DesgloseDeFactura | null>(null);
  useEffect(() => {
    cargar().then(setLineas).catch((err) => {
      toast({ title: 'No se pudo cargar el registro', description: errorDe(err), variant: 'destructive' });
      setLineas([]);
    });
  }, [cargar]);
  useEffect(() => {
    if (!cargarDesglose) return;
    cargarDesglose().then(setDesglose).catch(() => setDesglose(null));
  }, [cargarDesglose]);
  return (
    <Dialogo titulo={titulo} alCerrar={alCerrar} ancho="max-w-2xl">
      {desglose && desglose.lineas.length > 0 && <DesgloseDeLaFactura d={desglose} />}
      {!lineas ? <p className="text-muted-foreground">Cargando…</p>
        : lineas.length === 0 ? <p className="text-muted-foreground">Todavía no hay nada.</p>
          : (
            <ol className="space-y-2 border-l-2 border-border pl-4">
              {lineas.map((l) => (
                <li key={l.id} className="text-sm">
                  <span className="font-mono text-secundario text-muted-foreground mr-2">{fechaHora(l.creado_at)}</span>
                  <strong>{EVENTO[l.evento] || l.evento}</strong>
                  {detalleDe(l) && <span className="text-muted-foreground"> · {detalleDe(l)}</span>}
                </li>
              ))}
            </ol>
          )}
    </Dialogo>
  );
}
