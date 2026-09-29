
import { inputClass } from '@/shared/lib/ui';import { useState, useEffect, lazy, Suspense } from 'react';
import { Key, X } from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import client from '@/shared/api/client';
import SkeletonTable from '@/shared/components/ui/SkeletonTable';
import { toast } from '@/shared/hooks/useToast';
import { SERVICES_CATALOG } from './shared';
import { lista } from '@/shared/lib/lista';

const ConfirmDialog = lazy(() => import('@/shared/components/ui/ConfirmDialog'));

export default function ApisTab() {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogService, setDialogService] = useState(null);
  const [dialogProjectId, setDialogProjectId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await client.get('/credentials');
      if (res.success) setCredentials(lista(res.data));
    } catch (err) {
      if (err.status !== 403) toast({ title: 'Error', description: err?.data?.error || err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function getCredFor(service, projectId) {
    return credentials.find(c => c.service === service && c.project_id === projectId);
  }

  async function handleTest(id) {
    try {
      const res = await client.post(`/credentials/${id}/test`);
      toast({ title: 'Test', description: res.data?.message || 'OK' });
      await load();
    } catch (err) {
      toast({ title: 'Test fallo', description: err?.data?.error || err.message, variant: 'destructive' });
    }
  }

  function handleDelete(id) { setPendingDelete(id); }
  async function doDelete() {
    try {
      await client.delete(`/credentials/${pendingDelete}`);
      toast({ title: 'Credencial eliminada' });
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' });
    } finally { setPendingDelete(null); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-seccion">APIs globales</h2>
        <p className="text-normal text-muted-foreground mt-0.5">Credenciales compartidas por todos los proyectos (ej: Claude AI para reportes). Las APIs por proyecto se configuran en Proyectos &gt; Configurar &gt; APIs.</p>
      </div>

      {loading ? (
        <SkeletonTable rows={6} columns={1} />
      ) : (
        <div className="space-y-3">
          {SERVICES_CATALOG.filter(s => s.global).map((svc) => {
            const cred = getCredFor(svc.service, null);
            return (
              <CredentialCard
                key={svc.service}
                service={svc}
                projectName="Global (todos los proyectos)"
                credential={cred}
                onConfigure={() => { setDialogService(svc); setDialogProjectId(null); }}
                onTest={() => cred && handleTest(cred.id)}
                onDelete={() => cred && handleDelete(cred.id)}
              />
            );
          })}
        </div>
      )}

      <CredentialDialog
        open={!!dialogService}
        onClose={() => { setDialogService(null); setDialogProjectId(null); }}
        service={dialogService}
        projectId={dialogProjectId}
        existing={dialogService ? getCredFor(dialogService.service, dialogProjectId) : null}
        onSaved={load}
      />
      <Suspense fallback={null}>
        <ConfirmDialog open={pendingDelete !== null} title="¿Eliminar credencial?" message="La credencial será eliminada permanentemente." onConfirm={doDelete} onCancel={() => setPendingDelete(null)} />
      </Suspense>
    </div>
  );
}

function CredentialCard({ service, projectName, credential, onConfigure, onTest, onDelete }) {
  return (
    <div className="bg-card p-5 rounded-lg border border-border flex items-center gap-4">
      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
        <Key size={18} className="text-muted-foreground" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm">{service.name}</p>
        <p className="text-secundario text-muted-foreground">
          {service.description} - {projectName}
          {credential && <> - <span className="font-mono">{credential.masked_value}</span></>}
        </p>
      </div>
      {credential ? (
        <>
          <span className={`px-2.5 py-1 rounded-full text-secundario font-medium ${
            credential.last_test_result === 'ok'
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
          }`}>{credential.last_test_result || 'sin probar'}</span>
          <button onClick={onTest} className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-semibold">Test</button>
          <button onClick={onConfigure} className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted">Editar</button>
          <button onClick={onDelete} aria-label="Eliminar credencial" className="p-2 rounded-lg hover:bg-red-50 text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40"><X size={14} /></button>
        </>
      ) : (
        <>
          <span className="px-2.5 py-1 rounded-full text-secundario font-medium bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">sin configurar</span>
          <button onClick={onConfigure} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90">Configurar</button>
        </>
      )}
    </div>
  );
}

function CredentialDialog({ open, onClose, service, projectId, existing, onSaved }) {
  const [value, setValue] = useState('');
  const [metadata, setMetadata] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue('');
      setMetadata(existing?.metadata ? JSON.stringify(existing.metadata, null, 2) : '');
    }
  }, [open, existing]);

  if (!open || !service) return null;

  async function handleSave(e) {
    e.preventDefault();
    if (!value) return;
    setSaving(true);
    try {
      let parsedMeta = null;
      if (metadata.trim()) {
        try { parsedMeta = JSON.parse(metadata); }
        catch { toast({ title: 'Metadata JSON invalido', variant: 'destructive' }); setSaving(false); return; }
      }
      await client.post('/credentials', {
        project_id: projectId,
        service: service.service,
        value,
        metadata: parsedMeta,
      });
      toast({ title: 'Credencial guardada', description: `${service.name} configurado` });
      onSaved?.();
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error || err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  }


  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[80] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-card rounded-lg border border-border w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{existing ? 'Editar' : 'Configurar'} {service.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-muted"><X size={18} /></button>
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-secundario font-medium text-muted-foreground mb-1 block">API Key / Token *</label>
              <input type="password" value={value} onChange={e => setValue(e.target.value)} placeholder={service.placeholder} className={inputClass + ' font-mono'} required autoFocus />
              <p className="text-secundario text-muted-foreground mt-1">Se cifra con AES-256-GCM antes de guardar</p>
            </div>
            <div>
              <label className="text-secundario font-medium text-muted-foreground mb-1 block">Metadata (JSON opcional)</label>
              <textarea value={metadata} onChange={e => setMetadata(e.target.value)} placeholder='{"account_id": "12345", "refresh_token": "..."}' rows={3} className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-xs outline-none font-mono resize-none focus:border-primary" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-semibold hover:bg-muted">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
