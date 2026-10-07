import { useState } from 'react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { SectionTitle, MODULES_REGISTRY } from './shared';

export default function ModulosTab({ project, onSaved }) {
  const [modules, setModules] = useState(project.modules || {});
  const [saving, setSaving] = useState(false);

  function toggle(key) {
    setModules((m) => ({ ...m, [key]: !m[key] }));
  }

  function applyPreset(name) {
    if (name === 'crm') {
      setModules({ leads: true, clients: true, products: true, conversions: true, commissions: true, matriculas: false, forms: true, woocommerce: false, platform_users: false, accounting_income: true, accounting_expenses: true, accounting_receivable: true, accounting_payable: true, payroll: false, reports: true });
    } else if (name === 'ia') {
      setModules({ leads: false, clients: false, products: true, conversions: true, commissions: false, matriculas: false, forms: false, woocommerce: false, platform_users: true, accounting_income: true, accounting_expenses: true, accounting_receivable: false, accounting_payable: false, payroll: false, reports: true });
    } else if (name === 'minimal') {
      setModules({ leads: true, products: true, conversions: true, accounting_income: true, accounting_expenses: true, reports: true });
    }
  }

  function isDisabled(item) {
    if (!item.requires) return false;
    return item.requires.some((r) => !modules[r]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await client.patch(`/projects/${project.id}`, { modules });
      toast({ title: 'Modulos actualizados', description: 'Recarga el navegador para ver el nuevo sidebar' });
      onSaved?.();
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error || err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionTitle
        title="Modulos activos"
        subtitle="Define que secciones del CRM estan disponibles para este proyecto. El sidebar y los endpoints respetan estos toggles."
      />

      <div className="p-3 rounded-md bg-muted/30 border border-border">
        <p className="text-xs font-medium text-muted-foreground mb-2">Aplicar preset</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button onClick={() => applyPreset('crm')} className="px-3 py-2 rounded-md bg-card border border-border text-xs font-semibold hover:bg-muted">CRM Formacion</button>
          <button onClick={() => applyPreset('ia')} className="px-3 py-2 rounded-md bg-card border border-border text-xs font-semibold hover:bg-muted">Plataforma IA</button>
          <button onClick={() => applyPreset('minimal')} className="px-3 py-2 rounded-md bg-card border border-border text-xs font-semibold hover:bg-muted">Minimal</button>
        </div>
      </div>

      {Object.entries(MODULES_REGISTRY).map(([groupKey, group]) => (
        <div key={groupKey} className="bg-muted/20 rounded-md border border-border overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/40">
            <p className="text-secundario font-medium text-muted-foreground">{group.label}</p>
          </div>
          <div className="divide-y divide-border">
            {group.items.map((item) => {
              const disabled = isDisabled(item);
              const checked = !!modules[item.key];
              return (
                <div key={item.key} className={`flex items-center justify-between px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    {item.requires && (
                      <p className="text-secundario text-muted-foreground">Requiere: {item.requires.join(', ')}</p>
                    )}
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(item.key)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar modulos'}
        </button>
      </div>
    </div>
  );
}
