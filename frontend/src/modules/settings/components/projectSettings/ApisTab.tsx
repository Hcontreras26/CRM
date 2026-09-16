import { useState, useEffect, useCallback } from 'react';
import { Key, X } from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { SectionTitle, useConfirm, PROJECT_SERVICES } from './shared';

export default function ApisTab({ project }) {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogSvc, setDialogSvc] = useState(null);
  const { ask, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get(`/credentials?projectId=${project.id}`);
      if (res.success) setCredentials(res.data || []);
    } catch (err) {
      if (err.status !== 403) toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  function getCred(service) { return credentials.find(c => c.service === service); }

  async function handleTest(id) {
    try {
      const res = await client.post(`/credentials/${id}/test`);
      toast({ title: 'Test OK', description: res.data?.message });
      await load();
    } catch (err) { toast({ title: 'Test fallo', description: err?.data?.error, variant: 'destructive' }); }
  }

  async function handleDelete(id) {
    ask('¿Eliminar credencial?', 'La credencial será eliminada permanentemente.', async () => {
      try { await client.delete(`/credentials/${id}`); await load(); }
      catch (err) { toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' }); }
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <SectionTitle title={`APIs de ${project.nombre}`} subtitle="Credenciales especificas de este proyecto, encriptadas con AES-256-GCM" />

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="space-y-2">
          {PROJECT_SERVICES.map(svc => {
            const cred = getCred(svc.service);
            return (
              <div key={svc.service} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Key size={16} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{svc.name}</p>
                  <p className="text-secundario text-muted-foreground">{svc.description}</p>
                  {cred && <p className="text-secundario font-mono text-muted-foreground mt-0.5">{cred.masked_value}</p>}
                </div>
                {cred ? (
                  <>
                    <span className={`px-2 py-0.5 rounded-full text-secundario font-medium ${
                      cred.last_test_result === 'ok'
                        ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                    }`}>{cred.last_test_result || 'sin probar'}</span>
                    <button onClick={() => handleTest(cred.id)} className="text-secundario px-2 py-1 rounded bg-info-soft text-info font-semibold">Test</button>
                    <button onClick={() => setDialogSvc(svc)} className="text-secundario px-2 py-1 rounded border border-border font-semibold">Editar</button>
                    <button onClick={() => handleDelete(cred.id)} aria-label="Eliminar credencial" className="p-1 rounded hover:bg-destructive-soft text-destructive"><X size={14} /></button>
                  </>
                ) : (
                  <button onClick={() => setDialogSvc(svc)} className="text-secundario px-3 py-1.5 rounded-lg bg-primary text-white font-semibold">Configurar</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialogSvc && (
        <CredentialQuickDialog
          project={project}
          service={dialogSvc}
          existing={getCred(dialogSvc.service)}
          onClose={() => setDialogSvc(null)}
          onSaved={() => { setDialogSvc(null); load(); }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function CredentialQuickDialog({ project, service, existing, onClose, onSaved }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (!value) return;
    setSaving(true);
    try {
      await client.post('/credentials', { project_id: project.id, service: service.service, value });
      toast({ title: 'Guardado' });
      onSaved();
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[80] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/60" onClick={onClose} />
        <form onSubmit={handleSave} className="relative bg-card rounded-lg border border-border w-full max-w-md p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{existing ? 'Editar' : 'Configurar'} {service.name}</h3>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded hover:bg-muted"><X size={18} /></button>
          </div>
          <p className="text-xs text-muted-foreground">{service.description}</p>
          <div>
            <label className="text-secundario font-medium text-muted-foreground block mb-1">
              {existing ? 'Nuevo valor (si no lo cambias, deja vacio y cancela)' : 'API Key / Token'}
            </label>
            <input
              type="password" required value={value} onChange={e => setValue(e.target.value)}
              placeholder={service.placeholder} autoComplete="off"
              className="w-full h-10 px-3 rounded-lg border border-border bg-muted/50 text-sm font-mono outline-none focus:border-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-semibold hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
