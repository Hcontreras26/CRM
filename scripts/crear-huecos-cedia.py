# -*- coding: utf-8 -*-
"""Crea en produccion las 8 facturas que faltan de la serie CEDIA.

Hace UNA sola cosa y nada mas: sube `crear_huecos_cedia.sql` al VPS y lo lanza
contra `crm_prod_db`. Existe como fichero propio para que el permiso de Bash que
lo autoriza sea una linea exacta y no un comodin sobre Python entero.

El SQL lleva `WHERE NOT EXISTS`, asi que volver a lanzarlo no duplica nada.

    python scripts/crear-huecos-cedia.py
"""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf8", errors="replace")

SCRATCH = ("C:/Users/Diego/AppData/Local/Temp/claude/"
           "c--Users-Diego-Desktop-Proyectos-Carlos-CRM-ISEIH/"
           "02c2801c-3375-4d51-9636-d374bd8ec8c9/scratchpad")
SQL = os.path.join(SCRATCH, "crear_huecos_cedia.sql")

sys.path.insert(0, SCRATCH)
from conexion import conectar  # noqa: E402

if not os.path.exists(SQL):
    print("No encuentro el SQL en " + SQL)
    sys.exit(1)

cuerpo = io.open(SQL, encoding="utf8").read()
print("SQL: %d caracteres" % len(cuerpo))

c = conectar("187.124.128.126", "claude", None)
sftp = c.open_sftp()
with sftp.open("/tmp/_crear_huecos.sql", "w") as f:
    f.write(cuerpo)
sftp.close()

_, salida, err = c.exec_command(
    "cd /tmp && sudo -n -u postgres psql -d crm_prod_db -v ON_ERROR_STOP=1 "
    "-f /tmp/_crear_huecos.sql 2>&1; rm -f /tmp/_crear_huecos.sql",
    timeout=300)
print((salida.read() + err.read()).decode("utf8", "replace"))

# Y se comprueba como quedo, que es la mitad del trabajo.
_, salida, err = c.exec_command(
    "cd /tmp && sudo -n -u postgres psql -d crm_prod_db -c \""
    "SELECT g AS hueco FROM generate_series(1, (SELECT COALESCE(MAX(numero),0) "
    "FROM invoices WHERE ano=2026 AND serie='CEDIA')) g "
    "WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.ano=2026 "
    "AND i.serie='CEDIA' AND i.numero=g) ORDER BY g\"", timeout=180)
print("=== huecos que quedan ===")
print((salida.read() + err.read()).decode("utf8", "replace"))
