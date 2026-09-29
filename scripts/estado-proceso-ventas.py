# -*- coding: utf-8 -*-
"""Que pieza del proceso de ventas esta en produccion y cual solo en /testeo.

Mira el CODIGO desplegado en cada entorno, no el repo: produccion ejecuta una
rama distinta de la que tenemos delante, asi que preguntarle al repo daria una
respuesta bonita y falsa.

    python scripts/estado-proceso-ventas.py
"""
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf8", errors="replace")

SCRATCH = ("C:/Users/Diego/AppData/Local/Temp/claude/"
           "c--Users-Diego-Desktop-Proyectos-Carlos-CRM-ISEIH/"
           "02c2801c-3375-4d51-9636-d374bd8ec8c9/scratchpad")
sys.path.insert(0, SCRATCH)
from conexion import conectar  # noqa: E402

PIEZAS = [
    ("los cinco pasos y la cola",   "src/modules/proceso/proceso.model.js",     "colaDelDia"),
    ("repaso de fin de mes",        "src/modules/proceso/proceso.model.js",     "baseDeSeguimiento"),
    ("filtros del repaso",          "src/modules/proceso/proceso.controller.js", "filtrosDelRepaso"),
    ("cola paginada",               "src/modules/proceso/proceso.model.js",     "desplazamiento"),
    ("descarga Wasapi del repaso",  "src/modules/proceso/proceso.controller.js", "wasapiSeguimiento"),
    ("ambito por empresa",          "src/modules/proceso/proceso.ambito.js",    "ambitoDelProceso"),
    ("mi puesto",                   "src/modules/reports/report.model.js",      "export async function miPuesto"),
    ("ranking para el jefe",        "src/modules/reports/report.model.js",      "esJefe"),
    ("filtro por paso",             "src/modules/leads/lead.model.js",          "pasoProceso"),
    ("agenda al dar de alta",       "src/modules/leads/lead.service.js",        "alta manual"),
    ("plantilla por paso",          "src/modules/whatsapp/whatsapp.model.js",   "paso_clave"),
    ("plantillas por numero",       "src/modules/whatsapp/whatsapp.controller.js", "duenoDeLasPersonales"),
]

ENTORNOS = [("PROD", "/opt/crm/production"), ("TESTEO", "/opt/crm/staging")]

c = conectar("187.124.128.126", "claude", None)


def hay(base, ruta, aguja):
    cmd = ("sudo -n test -f %s/%s && sudo -n grep -cF %s %s/%s | head -1"
           % (base, ruta, "'" + aguja + "'", base, ruta))
    _, o, _ = c.exec_command(cmd, timeout=60)
    s = o.read().decode().strip()
    return s.isdigit() and int(s) > 0


print("  %-28s %-7s %s" % ("pieza", "PROD", "TESTEO"))
print("  " + "-" * 45)
for etiqueta, ruta, aguja in PIEZAS:
    fila = ["si" if hay(base, ruta, aguja) else "NO" for _, base in ENTORNOS]
    print("  %-28s %-7s %s" % (etiqueta, fila[0], fila[1]))
