import { X } from '@phosphor-icons/react';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { toast } from '@/shared/hooks/useToast';

interface Props {
  email: string;
  url: string;
  onClose: () => void;
}

/**
 * El alta manda un correo con el enlace para poner contraseña. Hoy el CRM no
 * tiene clave de Brevo, asi que ese correo no sale: sin este recuadro, el
 * usuario recien creado no puede entrar y nadie se entera. El enlace caduca en
 * 24h — si caduca, hoy no hay forma de regenerarlo sin tocar la base.
 */
export default function InviteLinkBanner({ email, url, onClose }: Props) {
  async function copiar() {
    const ok = await copyToClipboard(url);
    toast(ok ? { title: 'Link copiado' } : { title: 'No se pudo copiar', variant: 'destructive' });
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs">
          <p className="font-semibold text-warning-soft-foreground">Invitación pendiente para {email}</p>
          <p className="text-warning-soft-foreground/80 mt-0.5">
            Si el envío por email no está activo, copia este link y pásaselo. Caduca en 24h.
            Al abrirlo el usuario define su propia contraseña.
          </p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="text-warning-soft-foreground/60 hover:text-warning-soft-foreground">
          <X size={14} weight="bold" />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 h-8 px-2 rounded-md border border-warning/30 bg-white/80 dark:bg-black/30 text-secundario font-mono"
        />
        <button onClick={copiar} className="h-8 px-3 rounded-md bg-warning text-warning-foreground text-xs font-semibold hover:bg-warning/90">
          Copiar
        </button>
      </div>
    </div>
  );
}
