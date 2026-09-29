import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CabeceraContext = createContext(null);

/**
 * El puente entre la pantalla y la barra de arriba.
 *
 * El problema que resuelve: el titulo vivia DENTRO del contenido, uno por
 * pantalla y cada uno a su manera. Al poner una cabecera arriba, el titulo
 * salia dos veces. La otra salida —que cada pantalla se adapte— son 80
 * ficheros y ninguna garantia de que la 40 se parezca a la 3.
 *
 * Asi que la pantalla no decide donde va su cabecera: la pinta dentro de un
 * hueco que le presta el marco. Una sola vez, para todas.
 *
 * Quien lo hace es `PageHeader`, que ya usan 58 pantallas: no hay que tocar
 * ninguna. Las que ponen su `<h1>` a mano se van pasando a `PageHeader`.
 *
 * Va por hueco y no por estado a proposito. Guardar la cabecera en el estado
 * parece lo natural, pero `actions` es JSX: un objeto distinto en cada render.
 * Publicarlo provoca un render, que crea otro objeto, que se vuelve a
 * publicar — un bucle infinito. `ocupado` si es estado porque es un booleano:
 * se pone al montar la pantalla y se quita al salir, y React descarta el
 * cambio cuando el valor no varia.
 */
export function CabeceraProvider({ children }) {
  const [hueco, setHueco] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const registrarHueco = useCallback((nodo) => setHueco(nodo), []);
  const marcarOcupado = useCallback((valor) => setOcupado(valor), []);

  const valor = useMemo(
    () => ({ hueco, ocupado, registrarHueco, marcarOcupado }),
    [hueco, ocupado, registrarHueco, marcarOcupado],
  );

  return <CabeceraContext.Provider value={valor}>{children}</CabeceraContext.Provider>;
}

/**
 * Fuera del provider devuelve null.
 *
 * Pasa en las pantallas sin marco —el acceso, poner contrasena, el formulario
 * embebido—, y ahi `PageHeader` tiene que seguir pintandose donde esta en vez
 * de romper.
 */
export function useCabecera() {
  return useContext(CabeceraContext);
}

export default CabeceraContext;
