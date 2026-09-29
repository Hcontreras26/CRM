import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Foto } from '@/modules/whatsapp/pages/ChatPage';

/**
 * La foto del chat, y por qué se perdía al abrirlo (#112, punto 2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE PASABA
 *
 * Diego lo vio en producción: en la lista de la izquierda la conversación sale
 * con su foto, y al abrirla la cabecera pone la inicial en un círculo gris. Los
 * dos sitios pintan lo mismo con este mismo componente.
 *
 * El issue —lo escribí yo— decía que «el objeto de la conversación abierta
 * llega sin avatar_url». Es falso: las dos consultas son `SELECT c.*` de la
 * misma tabla y las dos lo traen. Reproducido en local, el dato llega bien.
 *
 * Lo que estaba viejo era el ESTADO. Esto era:
 *
 *     const [rota, setRota] = useState(false);
 *     if (url && !rota) return <img ... onError={() => setRota(true)} />;
 *
 * y ese booleano vive mientras viva el componente. En la lista da igual: cada
 * fila tiene su propia Foto, así que una caducada solo se estropea a sí misma.
 * En la cabecera hay UNA que sobrevive al cambiar de conversación — y las
 * direcciones que da WhatsApp caducan. Con abrir un chat de foto caducada, la
 * cabecera se quedaba en la inicial para todos los siguientes.
 *
 * Por eso la prueba que importa es la tercera: fallar y DESPUÉS cambiar de url.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe('la foto de una conversación', () => {
  it('con dirección, pinta la imagen', () => {
    render(<Foto nombre="Dieguis" url="https://ejemplo/foto.jpg" />);
    expect(screen.getByRole('img', { name: 'Dieguis' })).toBeInTheDocument();
  });

  it('sin dirección, las iniciales', () => {
    render(<Foto nombre="Laura Garcia" url={null} />);
    expect(screen.getByText('LG')).toBeInTheDocument();
  });

  it('si la imagen no carga, cae a las iniciales', () => {
    render(<Foto nombre="Ana Rota" url="https://pps.whatsapp.net/caducada.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Ana Rota' }));
    expect(screen.getByText('AR')).toBeInTheDocument();
  });

  it('un grupo sin foto se distingue de una persona sin foto', () => {
    const { container } = render(<Foto nombre="Fantasy" url={null} grupo />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText('F')).toBeNull();
  });
});

describe('cambiar de conversación', () => {
  it('una foto caducada NO deja ciega a la siguiente', () => {
    // Este es el fallo de Diego, en tres líneas: la cabecera es un solo
    // componente que se reutiliza al cambiar de chat. Con un booleano «rota»
    // suelto, la segunda conversación heredaba el fallo de la primera y
    // enseñaba la inicial teniendo su foto perfectamente.
    const { rerender } = render(<Foto nombre="Ana Rota" url="https://caducada.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Ana Rota' }));
    expect(screen.getByText('AR')).toBeInTheDocument();

    rerender(<Foto nombre="Dieguis" url="https://buena.jpg" />);
    expect(screen.getByRole('img', { name: 'Dieguis' })).toBeInTheDocument();
    expect(screen.queryByText('D')).toBeNull();
  });

  it('la que falló sigue fallando si se vuelve a ella, sin reintentar en bucle', () => {
    // Lo contrario también importa: reiniciar del todo haría que volver al chat
    // roto pidiera la imagen otra vez cada vez que se pinta.
    const { rerender } = render(<Foto nombre="Ana Rota" url="https://caducada.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Ana Rota' }));

    rerender(<Foto nombre="Dieguis" url="https://buena.jpg" />);
    rerender(<Foto nombre="Ana Rota" url="https://caducada.jpg" />);
    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
