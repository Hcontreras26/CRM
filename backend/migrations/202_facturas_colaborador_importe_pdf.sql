-- Facturas de colaboradores (#202): el total que pone el PDF
--
-- Corrección de Diego (13/10): «el monto es que coincida el PDF y lo que se
-- escribió de factura ahí». Una factura cuadra cuando el total que pone el PDF
-- subido es el mismo que el importe que el colaborador escribe en la casilla.
-- Hasta ahora `cuadra` comparaba lo escrito con el total del desglose; el
-- desglose se sigue guardando, pero ya no decide.
--
-- El servidor lee el total del PDF al subirlo y lo guarda aquí. NULL: no se
-- pudo leer (escaneado, roto, cifrado) o el archivo es una foto; entonces
-- `cuadra` también es NULL, que es «No se pudo leer el PDF», no «No cuadra».
--
-- 202: la 201 es la segunda PR de las facturas de colaboradores (el desglose y
-- el pago), y la 203, la del admin con la empresa entera (#220), que entró
-- antes en staging dejando este número para esta.
-- Se puede pasar dos veces sin romper nada. No toca ninguna fila: las subidas
-- de antes se quedan sin `importe_pdf` y con el `cuadra` que tenían.

BEGIN;

ALTER TABLE facturas_colaborador
    ADD COLUMN IF NOT EXISTS importe_pdf NUMERIC(12, 2);

COMMENT ON COLUMN facturas_colaborador.importe_pdf IS
    'Total leído del PDF al subirlo; NULL si no se pudo leer o no es un PDF (#202, 13/10)';
COMMENT ON COLUMN facturas_colaborador.cuadra IS
    'El total del PDF (importe_pdf) es el importe escrito; NULL si no se pudo leer el PDF (#202, 13/10)';

COMMIT;
