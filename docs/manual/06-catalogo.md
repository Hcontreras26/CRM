# Catálogo

Menú: sección **Catálogo**, con **Productos**, **Cursos pendientes**,
**WooCommerce**, **Productos por categoría** y **Árbol de categorías**. Atajo
**G** y después **P**. Dentro, las pestañas son **Catálogo**, **Por
categoría**, **Árbol de categorías**, **Cursos pendientes** y **WooCommerce**.

## Para qué sirve

Es la lista de formaciones a la venta de cada campus (en el CRM se llaman
**productos**): precio, enlaces de pago, dossier en PDF, plazas de la
convocatoria y temario. De aquí salen los productos que se eligen al registrar
una venta y los datos que rellenan las plantillas.

La mayoría de productos se traen de la tienda **WooCommerce** de cada campus;
también se pueden crear a mano.

---

## 1. Productos

**Productos** enseña el catálogo del campus elegido, con filtros por estado y
categoría. Los que no tienen dossier salen con **Sin dossier**.

### Crear o editar un producto

1. Elige un campus arriba (sin él: **Un producto se crea en un campus:
   elígelo arriba.**).
2. **Nuevo Producto** (o la tecla **N**), o **Editar** en uno que exista.
3. Rellena por bloques:
   - **Categorización**: su categoría en el árbol.
   - **Imagen**: PNG, JPG, WEBP o SVG, máximo 5 MB.
   - **Precio y venta**: el precio (como mucho 2 decimales) y los **enlaces de
     pago**. **Añadir enlace** y elige su etiqueta (**Pago completo**, **2
     cuotas**, **3 cuotas**, **Personalizado**) y la dirección completa,
     empezando por https://. Estos enlaces son los que salen al registrar una
     venta, en **Enlace de pago para compartir**.
   - **Datos del programa** (importados de la web, editables).
   - **Convocatoria**: fechas y plazas. Las plazas salen en las plantillas del
     proceso comercial.
   - **Contenido del programa**.
4. Guarda. Sale **Producto actualizado** o el producto nuevo en la lista.

**Desactivar** un producto lo esconde, pero no lo borra: **El producto dejará de
estar visible pero no se eliminará.**

### El dossier

En la ficha del producto, **Dossier PDF**: **Subir** (solo PDF, máximo 20 MB).
Cada versión nueva deja la anterior como **Inactiva**: nunca se borra.
**Descargar** baja la versión activa.

### Las plazas

En la ficha del producto, la **Convocatoria** enseña las plazas libres. **Las
ocupadas se cuentan de las ventas. Este es el número de ahora: compruébalo antes
de cada envío.**

### La ficha del producto

Enseña lo que se ha sacado de su página pública: **Presentación**,
**Objetivos**, **Beneficios**, **A quién va dirigido**, **Módulos / Temario**…
Si no tiene secciones, hay que configurar el mapeo en **WooCommerce** y volver a
importar.

---

## 2. Productos por categoría y Árbol de categorías

- **Productos por categoría**: a la izquierda las **Categorías**, a la derecha
  sus productos con **Campus**, **SKU** y **Precio**. Sirve para buscar.
- **Árbol de categorías**: la jerarquía. **Crear la primera** si está vacío;
  en cada rama, **Crear subcategoría**, **Editar** y **Borrar**. Se filtra por
  origen (**Solo manuales**, **Solo WC**, **Solo del menú WP**) y **Ocultar
  vacías**. Con una empresa o todos los campus elegidos, sale el árbol de cada
  campus con **Entrar**.

---

## 3. Cursos pendientes

Las formaciones que se han vendido y todavía hay que montar o habilitar: por
campus, con su tutora y su fecha comprometida.

- Arriba, las cifras: **abiertos**, **retrasados**, **alumnas esperando** y
  **sin tutora**.
- Filtros: **Solo retrasados**, **Ver cerrados y cancelados** y **Todas las
  tutoras**.
- Columnas: **Formación**, **Alumnas**, **Fecha comprometida**, **Días**,
  **Estado**, **Avance** y **Tutora**.
- Abajo: **Carga por tutora** y **Tiempos, por campus** (desde la venta hasta
  que la alumna queda habilitada).

Para crear uno: **Nuevo pendiente** › **Campus**, **Formación** y **Tipo** ›
guardar. Sale **Pendiente creado** — **Ahora hay que asignarle una tutora.** Si
esa formación ya tiene uno abierto en ese campus, sale **Ya había uno
abierto** y no se duplica.

Una tutora ve solo los suyos; administración los supervisa todos.

---

## 4. WooCommerce

La conexión con la tienda de cada campus. Con una empresa elegida sale el
estado de cada campus (**Sin conectar**, **Conectada · pausada**, **Conectada**)
con **Entrar**.

Dentro de un campus (administración):

- **Credenciales** de la tienda.
- **Divisa por defecto**: se aplica a todos los productos importados de esa
  tienda.
- **Sincronización automática** y **Cada cuantos minutos**.
- **Estrategia de origen**: **Solo WooCommerce** o **WC + Custom Post Types**
  (cursos, másters, diplomados…) para webs que guardan los cursos aparte.
- El mapeo de campos y la importación.

Desde **Productos** también se lanza la sincronización: sale **Sincronización
iniciada — Se está descargando WooCommerce…**.

---

## Permisos

| Acción | Gestora | Admin | Soporte | Project manager | Tutor |
|---|---|---|---|---|---|
| Ver el catálogo y los dossieres | Sí | Sí | Sí | Sí | No |
| Crear, editar y borrar productos | No | Sí | Sí | No | No |
| Subir dossieres | No | Sí | Sí | No | No |
| Árbol de categorías (cambiar) | No | Sí | Sí | No | No |
| Exportar el catálogo | Sí | Sí | Sí | Sí | No |
| WooCommerce: ver | No | Sí | Sí | Sí | No |
| WooCommerce: configurar e importar | No | Sí | Sí | No | No |
| Cursos pendientes | Sí | Sí | Sí | Sí | Los suyos (ver [descuadres.md](descuadres.md)) |

En el menú, **Productos**, **Productos por categoría**, **Árbol de categorías** y
**WooCommerce** solo salen a administración. La gestora solo ve **Cursos
pendientes**; los productos los consulta al registrar una venta.

## Errores frecuentes

| Lo que ves | Qué pasa y qué hacer |
|---|---|
| **Falta el nombre** / **El nombre debe tener al menos 2 caracteres** | Ponle nombre al producto. |
| **La URL no es válida: cópiala entera, empezando por https://** | El enlace de pago está incompleto. |
| **Solo se permiten archivos PDF** | El dossier tiene que ser PDF. |
| **Este producto no tiene enlaces configurados** (al vender) | Añade los enlaces de pago editando el producto. |
| **Este producto no tiene secciones extraídas** | Revisa el mapeo en WooCommerce y vuelve a importar. |
| **Ya había uno abierto** | Esa formación ya tiene un curso pendiente abierto en ese campus. |

## Guion del vídeo (3 minutos)

1. **(0:00–0:20)** «El catálogo son las formaciones a la venta de cada campus.
   La mayoría vienen solas de la tienda.»
2. **(0:20–1:10)** **Productos**: buscar uno, **Editar**, enseñar **Precio y
   venta** y **Añadir enlace**. Explicar que esos enlaces salen al vender.
3. **(1:10–1:40)** **Dossier PDF**: subir una versión nueva de prueba y ver la
   anterior como **Inactiva**.
4. **(1:40–2:00)** Las plazas de la convocatoria: «compruébalas antes de cada
   envío».
5. **(2:00–2:40)** **Cursos pendientes**: las cifras de arriba, **Solo
   retrasados**, **Nuevo pendiente**.
6. **(2:40–3:00)** **Árbol de categorías** y **WooCommerce**, solo para enseñar
   dónde están.
