import { ShieldCheck } from '@phosphor-icons/react';

const ITEMS = [
  { label: 'Encriptacion de credenciales API', value: 'AES-256-GCM' },
  { label: 'Hash de contraseñas', value: 'bcrypt (cost factor 12)' },
  { label: 'JWT Access Token TTL', value: '15 minutos' },
  { label: 'Refresh Token TTL', value: '30 dias (httpOnly cookie)' },
  { label: 'CORS', value: 'Por dominio de proyecto' },
  { label: 'PostgreSQL', value: 'Solo acceso local (no expuesto)' },
  { label: 'Certificado SSL', value: "Let's Encrypt (auto-renewal)" },
  { label: 'Pre-signed URLs', value: '15 min expiracion' },
];

export default function SecurityTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-seccion">Seguridad</h2>
        <p className="text-normal text-muted-foreground mt-0.5">Configuración de seguridad del sistema</p>
      </div>
      <div className="space-y-3">
        {ITEMS.map((s) => (
          <div key={s.label} className="bg-card p-4 rounded-lg border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-success-soft">
                <ShieldCheck size={16} className="text-success" weight="regular" />
              </div>
              <div>
                <p className="text-normal font-semibold">{s.label}</p>
                <p className="text-secundario text-muted-foreground">{s.value}</p>
              </div>
            </div>
            <span className="bg-success-soft text-success-soft-foreground px-2.5 py-1 rounded-full text-secundario font-medium">OK</span>
          </div>
        ))}
      </div>
    </div>
  );
}
