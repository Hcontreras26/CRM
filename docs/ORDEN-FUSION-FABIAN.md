# Fusionar tu rama con `staging` · para Fabián

Revisado el **2026-09-11**. Diego: «revisa lo de Fabián y dale orden».

> **ACTUALIZADO el 11/09 por la tarde: la fusión ya está hecha, la hice yo.**
> No tienes que resolver nada. Salta al final, a «Qué te toca a ti ahora».
> Lo de arriba se queda porque explica **qué se decidió en cada conflicto** y,
> sobre todo, **el error que tenía este mismo documento** y que casi te borra un
> arreglo tuyo por segunda vez.

## Lo primero: tu trabajo está bien

`integracion/fabian` está **al día con el tronco** (`integracion/todo`): tus 88
commits encima y sin faltarte ni uno. Has trabajado como toca.

**El atasco no era tuyo.** `integracion/todo` lleva parado desde el 7 de
septiembre y `staging` estaba 212 commits por detrás. Y yo me salí del flujo:
trabajé en `release/reportes-empresa` y el 11/09 la subí directamente a
`staging`. Es mi parte de culpa y por eso te escribo la orden yo.

## Cómo quedó cada conflicto

De los 83 ficheros que tocamos los dos, git resolvió 79 solo. Los cuatro
restantes, así:

### 1. `backend/src/modules/conversions/conversion.model.js` → **las dos partes**

**Aquí este documento estaba MAL.** Decía «quédate con `staging`» y
`git checkout --theirs`. Eso te habría **borrado otra vez el arreglo del IVA**:

```js
const isIncluido = iva_incluido === undefined || iva_incluido === null
  ? true
  : iva_incluido !== false;
```

Tu propio comentario encima ya avisaba: *«esto ya estaba arreglado y la fusión lo
deshizo»*. Tenías razón, y por poco pasa por tercera vez. Ese trozo venía
**fuera** de las marcas de conflicto —git lo daba por fusionado— así que
resolver el fichero entero de un lado se lo llevaba por delante sin avisar.

Lección, y va para mí: **`--ours` y `--theirs` son de fichero entero, no de
bloque.** En un fichero que los dos hemos reescrito, resolver así tira trabajo
que git ya había casado bien.

Lo que quedó: mis 428 líneas (ventas compartidas, filtro por gestora vía
`conversion_reparto`, columna `compartida`, plazas) **más tu arreglo del IVA**,
verificado a mano después de fusionar.

### 2. `frontend/src/modules/accounting/pages/IncomePage.tsx` → **de `staging`**

Aquí sí: tu bloque y el de staging eran **el mismo código con el mismo
comentario**, incluido el `OJO CON EL -1`. Staging tiene además los atajos de
fecha, las seis tarjetas, la lista que distingue venta de cuota, el reparto por
proyecto y los tutoriales.

### 3. `frontend/src/shared/components/layout/Sidebar.jsx` → **LO TUYO**

Mandas tú: 197 líneas nuevas y 335 quitadas, el rediseño del menú y que el
proceso comercial cuelgue de Prospectos. Se quedaron tus subtítulos —«Lista,
pipeline y más», «A quién le toca hoy», «Los cinco pasos»— y encima el
renombrado a «Lista de prospectos», que era lo único mío que valía la pena.

### 4. `frontend/src/shared/components/layout/AppLayout.jsx` → **de `staging`**

`CON_SOCIEDAD_OK` dice qué pantallas se pueden ver con una sociedad elegida en
vez de un proyecto. La de staging es la tuya **más** `/finanzas/facturas`, así
que con quedarse la larga están las dos:

```js
const CON_SOCIEDAD_OK = [
  /^\/informes$/,
  /^\/ventas$/,
  /^\/finanzas\/ventas$/,
  // Facturacion: el listado ya filtra por issuer_id --la sociedad que emite la
  // factura-- y las ventas sin factura por sus campus.
  /^\/finanzas\/facturas$/,
];
```

## Lo que se comprobó en /testeo después de fusionar

No basta con que compile. Contra la API de /testeo, con las cinco del guion:

| | Resultado |
|---|---|
| **`/prospectos/cola`** | 200, con formación y plazas en cada fila |
| **Ficha del prospecto** | 200 · lead 2468, 4 pasos, «ahora le toca: Última plaza y facilidades de pago» |
| **`/prospectos/proceso`** (tu pantalla) | 200, los cinco pasos enteros |
| **`/finanzas/ventas`** con CEDIA (7 campus) | **377 filas** de 447 · antes salía a cero |
| **Plantillas con imagen** | 9, una por proyecto, con su pista de Opynio |

Y de propina: 433 ventas en la vista de reparto, ninguna suma distinta de 1.

**Un hallazgo del camino.** /testeo tenía `conversion.validation.js` **más viejo
que las dos ramas**: le faltaban las dos líneas de `issuerId`. Por eso al elegir
una empresa salía todo a cero — la validación se comía el parámetro antes de
llegar al modelo. Ya está subido.

## Qué te toca a ti ahora

La fusión está en `staging` y desplegada en /testeo. Tú solo tienes que ponerte
encima:

```bash
git fetch origin
git checkout integracion/fabian
git merge origin/staging      # deberia entrar limpio
git push origin integracion/fabian
```

Si ahí sale algún conflicto, es de algo que hayas tocado después del 11/09: mira
el bloque, no el fichero entero. Y si toca `conversion.model.js`, comprueba el
IVA antes de dar por bueno nada:

```bash
grep -n "iva_incluido === undefined" backend/src/modules/conversions/conversion.model.js
```

## Ojo con las migraciones

Las **149 a la 153 ya están aplicadas** en las cuatro bases (producción y
staging de los dos CRMs). No las vuelvas a pasar; son idempotentes, pero no hace
falta. Lo que traen:

| | |
|---|---|
| 149 | búsqueda de tutor por formación |
| 150 | ventas compartidas (`conversion_vendedoras` + vista `conversion_reparto`) |
| 151 | las plantillas del proceso comercial |
| 152 | el día 4 sin CETLAT y el enlace de Opynio |
| 153 | plantillas que piden imagen, y su pista |

## Lo que sigue sin resolverse

**Los 28 commits de Ángel** siguen en esa misma línea sin llegar a staging. Esta
fusión no los arrastra. Habrá que hacer lo mismo con los suyos, y conviene
hacerlo pronto: cuanto más esperan, más caros salen —esta ha costado una tarde
por llevar cuatro días de retraso.
