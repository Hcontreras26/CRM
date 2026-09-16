import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '@/shared/api/client';
import { Eye, EyeSlash, Check, X, ShieldCheck } from '@phosphor-icons/react';

const RULES = [
  { id: 'length', label: 'Mínimo 8 caracteres', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'Al menos una mayúscula', test: (v) => /[A-Z]/.test(v) },
  { id: 'number', label: 'Al menos un número', test: (v) => /\d/.test(v) },
  { id: 'match', label: 'Las contraseñas coinciden', test: (v, c) => v.length > 0 && v === c },
];

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const checks = useMemo(() =>
    RULES.map((r) => ({ ...r, passed: r.test(password, confirm) })),
    [password, confirm]
  );

  const allPassed = checks.every((c) => c.passed);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allPassed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await client.post('/auth/set-password', {
        token,
        password,
        confirmPassword: confirm,
      });

      if (res.success) {
        setSuccess(true);
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(res.error || 'Error al guardar la contraseña');
      }
    } catch (err) {
      setError(err.message || 'Error al guardar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-success text-white flex items-center justify-center shadow-sm mb-4">
            <ShieldCheck size={22} weight="bold" />
          </div>
          <h1 className="font-semibold text-base">MultiCRM</h1>
        </div>

        <div className="bg-card rounded-xl border border-border p-7">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Establece tu contraseña</h2>
            <p className="text-muted-foreground text-sm mt-1">Crea una contraseña segura para acceder al CRM.</p>
          </div>

          {success ? (
            <div className="text-center py-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-success" weight="bold" />
              </div>
              <h2 className="text-lg font-semibold">Contraseña guardada</h2>
              <p className="text-muted-foreground text-sm mt-2">Redirigiendo al login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="sp-password" className="text-xs font-medium text-muted-foreground mb-1.5 block px-1">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    id="sp-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoFocus
                    className="w-full h-11 px-4 pr-11 rounded-lg border border-border bg-background text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                  >
                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="sp-confirm" className="text-xs font-medium text-muted-foreground mb-1.5 block px-1">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <input
                    id="sp-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full h-11 px-4 pr-11 rounded-lg border border-border bg-background text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                  >
                    {showConfirm ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="bg-muted/40 border border-border rounded-lg p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Requisitos</p>
                {checks.map((check) => (
                  <div key={check.id} className="flex items-center gap-2.5 text-xs">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                      check.passed ? 'bg-success scale-100' : 'bg-border scale-95'
                    }`}>
                      {check.passed
                        ? <Check size={11} weight="bold" className="text-white" />
                        : <X size={11} weight="bold" className="text-muted-foreground/50" />
                      }
                    </div>
                    <span className={`font-medium transition-colors ${
                      check.passed ? 'text-success-soft-foreground' : 'text-muted-foreground'
                    }`}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <div role="alert" className="text-sm text-destructive-soft-foreground bg-destructive-soft border border-destructive/30 rounded-lg px-4 py-2.5 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!allPassed || loading}
                className="w-full h-12 bg-success text-white rounded-lg font-semibold text-sm hover:bg-success transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-sm hover:shadow-md focus:outline-none focus:ring-4 focus:ring-success/20"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </span>
                ) : (
                  'Guardar contraseña'
                )}
              </button>
            </form>
          )}
        </div>

        {!token && (
          <div role="alert" className="mt-4 flex items-start gap-2 text-xs text-warning-soft-foreground bg-warning-soft rounded-lg px-4 py-3 font-medium border border-warning/30">
            <X size={14} weight="bold" className="flex-shrink-0 mt-0.5" />
            <span>Token no detectado — esta página normalmente se accede desde el email de invitación.</span>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          &copy; 2026 CRM MultiProyecto · v0.1.0 Beta
        </p>
      </div>
    </div>
  );
}
