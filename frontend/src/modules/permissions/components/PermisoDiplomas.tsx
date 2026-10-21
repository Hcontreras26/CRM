import { useCallback, useEffect, useState } from 'react';
import { SealCheck } from '@phosphor-icons/react';
import Select from '@/shared/components/ui/Select';
import { toast } from '@/shared/hooks/useToast';
import * as api from '../api/permissions.api';
import type { PersonaConClave } from '../api/permissions.api';

/**
 * «Diplomas (Certifex) · Ver», por rol y por persona (#384).
 *
 * Diego: «Adriana, Daniela, Yosbely, Dayana, Mireia y Ana deben de tener para ver
 * los de Certifex». Da la pantalla Diplomas en SOLO LECTURA y solo con los campus
 * de cada uno. Aprobar, emitir, enviar, rechazar, corregir y revocar siguen siendo
 * de administración.
 *
 * El rol entero lo cambia el superadmin (un rol es de todas las empresas); a una
 * persona se lo dan el superadmin y el admin (este, a gente de sus campus). Se
 * guarda al cambiar: cada persona lo tiene al volver a cargar el CRM.
 */

const CLAVE_DIPLOMAS = 'diplomas.view';

type Valor = 'rol' | 'si' | 'no';
const deExcepcion = (e: boolean | null): Valor => (e === true ? 'si' : e === false ? 'no' : 'rol');
const aExcepcion = (v: Valor): boolean | null => (v === 'si' ? true : v === 'no' ? false : null);

interface Props {
  roleKey: string;
  rolLabel: string;
  /** Solo el superadmin cambia el rol entero. */
  puedeCambiarRol: boolean;
  onGuardado?: () => void;
}

export default function PermisoDiplomas({ roleKey, rolLabel, puedeCambiarRol, onGuardado }: Props) {
  const [delRol, setDelRol] = useState<boolean | null>(null);
  const [personas, setPersonas] = useState<PersonaConClave[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [r, p] = await Promise.all([
        api.getClaveDeRol(CLAVE_DIPLOMAS, roleKey),
        api.personasDeLaClave(CLAVE_DIPLOMAS, roleKey),
      ]);
      setDelRol(r);
      setPersonas(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar');
    }
  }, [roleKey]);

  useEffect(() => { setDelRol(null); setPersonas(null); cargar(); }, [cargar]);

  async function cambiarRol(permitido: boolean) {
    setGuardando('rol');
    try {
      setDelRol(await api.setClaveDeRol(CLAVE_DIPLOMAS, roleKey, permitido));
      toast({
        title: permitido ? `Todo el rol ${rolLabel} ve Diplomas` : `El rol ${rolLabel} ya no ve Diplomas`,
        description: 'En solo lectura y con sus campus. Cada persona lo tiene al volver a cargar el CRM.',
      });
      await cargar();
      onGuardado?.();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    } finally { setGuardando(null); }
  }

  async function cambiarPersona(p: PersonaConClave, v: Valor) {
    setGuardando(`p${p.id}`);
    try {
      const r = await api.setClaveDePersona(CLAVE_DIPLOMAS, p.id, aExcepcion(v));
      setPersonas((xs) => (xs || []).map((x) => (x.id === p.id ? { ...x, excepcion: r.excepcion, puede: r.puede } : x)));
      toast({
        title: r.puede ? `${p.nombre} ve Diplomas` : `${p.nombre} no ve Diplomas`,
        description: 'Lo tendrá al volver a cargar el CRM.',
      });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    } finally { setGuardando(null); }
  }

  const opciones = [
    { value: 'rol' as Valor, label: `Como su rol (${delRol ? 'sí' : 'no'})` },
    { value: 'si' as Valor, label: 'Sí, la ve' },
    { value: 'no' as Valor, label: 'No la ve' },
  ];

  return (
    <section className="rounded-xl border border-border p-3 space-y-3" aria-labelledby={`diplomas-${roleKey}`}>
      <header>
        <h3 id={`diplomas-${roleKey}`} className="text-sm font-bold flex items-center gap-1.5">
          <SealCheck size={15} weight="bold" /> Diplomas (Certifex) · Ver
        </h3>
        <p className="text-[11px] text-muted-foreground">
          La pantalla Diplomas en solo lectura, con sus campus. Aprobar, emitir, enviar, corregir y revocar
          sigue siendo de administración.
        </p>
      </header>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : delRol === null || personas === null ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <label className={`flex items-start gap-2 text-sm ${puedeCambiarRol ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
            <input
              type="checkbox"
              checked={delRol}
              disabled={!puedeCambiarRol || guardando !== null}
              onChange={(e) => cambiarRol(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
            />
            <span>
              Todo el rol {rolLabel}
              <span className="block text-[11px] text-muted-foreground">
                {puedeCambiarRol ? 'Para todas las personas con este rol.' : 'Un rol entero lo cambia el superadmin; tú puedes dárselo a una persona.'}
              </span>
            </span>
          </label>

          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Por persona</p>
            {personas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nadie con este rol{puedeCambiarRol ? '' : ' en tus campus'}.</p>
            ) : (
              <ul className="divide-y divide-border">
                {personas.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.nombre}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.email} · {p.puede ? 'la ve' : 'no la ve'}</p>
                    </div>
                    <Select<Valor>
                      value={deExcepcion(p.excepcion)}
                      onChange={(v) => cambiarPersona(p, v)}
                      options={opciones}
                      size="sm"
                      ariaLabel={`Diplomas para ${p.nombre}`}
                      disabled={guardando !== null}
                      className="w-48"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
