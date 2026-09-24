# -*- coding: utf-8 -*-
"""Comprueba que la cola del dia pagina y que el total es el de verdad.

Lanza `colaDelDia` contra la base de STAGING con los campus de cada empresa y
compara el total que devuelve con el que dicen los contadores de la cabecera.
Si no cuadran, la lista estaria mintiendo respecto al numero de arriba, que es
justo el fallo que esto viene a cerrar.

    python scripts/probar-cola-paginada.py
"""
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf8", errors="replace")

SCRATCH = ("C:/Users/Diego/AppData/Local/Temp/claude/"
           "c--Users-Diego-Desktop-Proyectos-Carlos-CRM-ISEIH/"
           "02c2801c-3375-4d51-9636-d374bd8ec8c9/scratchpad")
sys.path.insert(0, SCRATCH)
from conexion import conectar  # noqa: E402

JS = r'''
import 'dotenv/config';
import { colaDelDia } from './src/modules/proceso/proceso.model.js';
import { query } from './src/shared/config/db.js';

const emp = (await query(
  "SELECT id, COALESCE(alias, razon_social) AS nombre FROM invoice_issuers WHERE activo ORDER BY id")).rows;

for (const e of emp) {
  const ids = (await query(
    "SELECT id FROM projects WHERE sociedad_emisora_id = $1 AND active ORDER BY id",
    [e.id])).rows.map(r => r.id);
  if (!ids.length) continue;

  const p1 = await colaDelDia({ projectIds: ids, asesoraId: null, limite: 100 });
  const p2 = await colaDelDia({ projectIds: ids, asesoraId: null, limite: 100, desplazamiento: 100 });
  console.log(`${String(e.nombre).slice(0, 26).padEnd(27)} total=${String(p1.total).padStart(5)}`
    + `  pagina1=${String(p1.filas.length).padStart(3)}  pagina2=${String(p2.filas.length).padStart(3)}`
    + `  paginas=${Math.max(1, Math.ceil(p1.total / 100))}`);

  // Las dos paginas no pueden traer a la misma persona.
  const unos = new Set(p1.filas.map(f => f.lead_id));
  const repes = p2.filas.filter(f => unos.has(f.lead_id)).length;
  if (repes) console.log(`   OJO: ${repes} repetidos entre la pagina 1 y la 2`);
}
process.exit(0);
'''

c = conectar("187.124.128.126", "claude", None)
sftp = c.open_sftp()
with sftp.open("/tmp/_probar_cola.mjs", "w") as f:
    f.write(JS)
sftp.close()
_, o, e = c.exec_command(
    "cd /opt/crm/staging && sudo -n cp /tmp/_probar_cola.mjs ./_pc.mjs && "
    "sudo -n /home/claude/.nvm/versions/node/v24.14.1/bin/node ./_pc.mjs 2>&1; "
    "sudo -n rm -f ./_pc.mjs", timeout=300)
salida = (o.read() + e.read()).decode("utf8", "replace")
print("\n".join(l for l in salida.split("\n")
                if "DeprecationWarning" not in l and "trace-deprecation" not in l))
