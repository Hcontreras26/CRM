# Versión 3.0.0: lo que llevará

Diego, 29/09/2026: «anota eso para la versión 3.0.0 en un doc, para que cuando la hagamos sea eso».

Todo lo de esta lista **ya está en producción** desde el 29/09. Todavía no tiene número de versión ni Novedades. La 3.0.0 es ponerle nombre, contarlo al equipo y dejar `main` al día. Si se añade algo antes de sacarla, se apunta aquí.

## Lo principal: la sección Conexión

Diego, 29/09: «lo de Claude MCP, ese formulario pasa a esa parte de MCP en conexión, y todo lo que sea conexión con WordPress y eso pase allí, a la sección de conexión del menú; que funcione por empresa y todos los proyectos y puedas ver quién gestiona o quién creó un MCP y en dónde».

- **Menú.** La sección Conexión tiene **MCP** y **Conectores**. Conectores sale de Captación, y `/captacion/conectores` lleva a `/conexion/conectores`.
- **Conexión → MCP.** Arriba están las **Conexiones de Claude**, con su botón «Nueva conexión con Claude», que antes era un tipo más de «Nuevo conector». De cada conexión se ve:
  - para quién es: todo el sistema, una empresa o un campus;
  - quién la creó y cuándo;
  - cuánta gente tiene URL, y quiénes;
  - el último uso de Claude;
  - tu URL.

  Debajo sigue la URL personal de cada uno, que cubre todo lo que ve esa persona.
- **Conexión → Conectores.** Solo WordPress, WooCommerce y APIs. Cada uno dice para quién es y quién lo creó.
- **Con cualquier ámbito.** Las dos páginas funcionan con «Todos los proyectos», con una empresa o con un campus. Ya no sale el muro de «Selecciona un proyecto».
- **Quién ve qué** (en el servidor, no solo en la pantalla):
  - el super admin lo ve todo;
  - un admin ve lo de sus campus y sus empresas. Lo de «todo el sistema» no lo ve ni lo abre, aunque antes sí lo veía.
  - «Antonio solo puede consultar y ver los de su empresa; Manuel Casas, TODO en todos lados».
- **Base.** Migración `185_conectores_creador.sql` (`project_connectors.created_by`). Las conexiones de Claude que ya existían se atribuyen a quien sacó la primera URL.
- **Dónde está.** Rama `feat/conexion-mcp-conectores`, PR #183.

## También desde la 2.0.1 (en producción, sin versión)

- **«Cobrada» en las proformas.** Apunta el cobro en la venta y la proforma pasa a ser la factura, con el mismo número y conservando su fecha. Nació de que Yolanda no podía pasar una proforma a pagada. PR #181.
- **Resúmenes del equipo.** La fila de cada empresa lleva el logo de su marca, no el sello de facturación. El resumen del día dice qué horas cuenta «hoy», en hora de España, y que «vs. ayer» compara con el día entero. PR #182.

## También el 30/09

- **Ranking de gestoras por lo facturado.** «Cómo voy», el podio, los correos y Claude miden a las gestoras por el total de las facturas emitidas en el periodo, IVA incluido. Los abonos restan y las ventas compartidas se reparten. Antes se medía por número de ventas. PR #201.

## El día que se saque

1. **Fusionar en `main`, por este orden:** #181, #182, #183 y #201. Hasta entonces producción va por delante de `main`: **no subir producción desde `main`**, o se pierden estos cambios.
2. **Novedades.** Añadir la entrada `3.0.0` al principio de `VERSIONES`, en `backend/src/modules/novedades/versiones.js`, con un botón a cada pantalla:
   - Conexión → MCP y Conexión → Conectores;
   - Facturación → Proformas;
   - una nota sobre los resúmenes.

   Con `NOVEDADES_AUTO=1` en producción, **el correo al equipo sale solo al arrancar**: subirlo cuando se quiera que llegue.
3. **Etiqueta y release** `v3.0.0` en GitHub, con las notas sacadas de las Novedades.
4. **ISEIE.** «Cobrada» y los resúmenes ya están allí. Conectores y MCP no: es la diferencia de paridad pendiente. Decidir si la 3.0.0 de ISEIE espera a tenerlos o sale sin ellos.
