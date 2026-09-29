# -*- coding: utf-8 -*-
"""Construye el frontend y lo sube, negandose si la ruta base sale mal.

POR QUE EXISTE. El 24/09 /testeo se quedo en blanco. La causa no fue el codigo:
fue construirlo desde Git Bash con `VITE_BASE_PATH=/testeo/ npm run build`. MSYS
convierte cualquier argumento que parezca una ruta de Unix, asi que a Vite le
llego `C:/Program Files/Git/testeo/` y el index.html quedo pidiendo sus ficheros
de una carpeta que no existe en ningun sitio. La pagina cargaba, el servidor no
daba error, y no se pintaba nada.

Lo peor no fue el fallo sino la comprobacion. Se miro con
`grep -o '/testeo/assets/...'`, que encuentra ese trozo DENTRO de la ruta mala
y da el visto bueno igual. Una comprobacion que no puede fallar no comprueba
nada, y por eso el despliegue se dio por bueno dos veces seguidas.

QUE HACE DISTINTO:

  1. La variable la pone Python en el entorno del proceso hijo, no el shell.
     Asi no hay conversion posible, se lance desde donde se lance.
  2. Revisa el index.html construido con el ATRIBUTO ENTERO --src="/testeo/
     assets/..."-- y no con un trozo. Si no cuadra, no sube nada.
  3. Despues de subir, pide la pagina y TODOS los ficheros que declara. Si
     alguno no da 200, lo dice con su nombre y falla.

    python scripts/desplegar-frontend.py                 a /testeo
    python scripts/desplegar-frontend.py produccion      a /crm  (pregunta antes)
"""
import os
import posixpath
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
DIST = os.path.join(RAIZ, 'frontend', 'dist')
IP = '187.124.128.126'
USUARIO = 'claude'
HOST = 'https://360crm.tech'
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0 Safari/537.36'

ENTORNOS = {
    'staging': {'base': '/testeo/', 'remoto': '/var/www/crm/staging/frontend',
                'url': HOST + '/testeo/'},
    'produccion': {'base': '/crm/', 'remoto': '/var/www/crm/production/frontend',
                   'url': HOST + '/crm/'},
}

# Los que no llevan huella en el nombre. Hay que pisarlos siempre: si no, el
# navegador sigue pidiendo los de antes y el despliegue no se nota.
SIN_HUELLA = ('index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest')


def construir(cfg):
    entorno = dict(os.environ)
    # AQUI esta el arreglo: la variable se pone en el proceso hijo, sin pasar
    # por ningun shell que pueda reescribirla.
    entorno['VITE_BASE_PATH'] = cfg['base']
    print('construyendo con base %s ...' % cfg['base'])
    r = subprocess.run(['npm', 'run', 'build'],
                       cwd=os.path.join(RAIZ, 'frontend'),
                       env=entorno, shell=(os.name == 'nt'),
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    salida = r.stdout.decode('utf-8', 'replace')
    if r.returncode != 0:
        print(salida[-3000:])
        raise SystemExit('la construccion ha fallado')
    hechas = [l.strip() for l in salida.split('\n') if 'built in' in l]
    print('   ' + (hechas[-1] if hechas else 'construido'))


def revisar_lo_construido(cfg):
    """El atributo ENTERO, no un trozo: aqui se caza la ruta reescrita."""
    html = open(os.path.join(DIST, 'index.html'), encoding='utf-8').read()
    refs = re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', html)
    if not refs:
        raise SystemExit('el index.html construido no referencia ningun fichero')
    malas = [r for r in refs if not r.startswith(cfg['base'])]
    if malas:
        print('\nLA RUTA BASE HA SALIDO MAL. Tenian que empezar por %s:' % cfg['base'])
        for m in malas:
            print('   %s' % m)
        raise SystemExit('no subo nada')
    sucios = []
    for n in os.listdir(DIST):
        if n.endswith(('.html', '.js', '.webmanifest')):
            t = open(os.path.join(DIST, n), encoding='utf-8', errors='ignore').read()
            if 'Program Files' in t:
                sucios.append(n)
    if sucios:
        raise SystemExit('quedan rutas de Windows dentro de: %s' % ', '.join(sucios))
    print('   index.html correcto: %d ficheros, todos bajo %s' % (len(refs), cfg['base']))


def subir(cfg):
    import paramiko
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(IP, username=USUARIO, timeout=45, banner_timeout=120, auth_timeout=60)

    def correr(orden, espera=600):
        _, o, e = c.exec_command(orden, timeout=espera)
        return (o.read() + e.read()).decode('utf-8', 'replace')

    locales = {}
    for raiz, _, ficheros in os.walk(DIST):
        for f in ficheros:
            rel = os.path.relpath(os.path.join(raiz, f), DIST).replace(os.sep, '/')
            locales[rel] = os.path.join(raiz, f)

    ya = set(correr('cd %s && find . -type f | cut -c3-' % cfg['remoto']).split())
    pendientes = [r for r in locales if r not in ya or r in SIN_HUELLA]
    print('subiendo %d de %d ficheros' % (len(pendientes), len(locales)))

    correr('rm -rf /home/claude/_front && mkdir -p /home/claude/_front')
    sftp = c.open_sftp()
    carpetas = set()
    for rel in sorted(pendientes):
        destino = posixpath.join('/home/claude/_front', rel)
        carpeta = posixpath.dirname(destino)
        if carpeta not in carpetas:
            correr('mkdir -p %s' % carpeta)
            carpetas.add(carpeta)
        sftp.put(locales[rel], destino)
    sftp.close()
    correr('sudo -n cp -r /home/claude/_front/. %s/ && '
           'sudo -n chown -R www-data:www-data %s && '
           'rm -rf /home/claude/_front' % (cfg['remoto'], cfg['remoto']))
    c.close()
    print('   copiado')


def pedir(u):
    try:
        r = urllib.request.Request(u + ('&' if '?' in u else '?') + 'nc=%f' % time.time(),
                                   headers={'User-Agent': UA, 'Cache-Control': 'no-cache'})
        x = urllib.request.urlopen(r, context=CTX, timeout=90)
        return x.getcode(), x.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''


def revisar_lo_servido(cfg):
    """Lo que de verdad importa: que el navegador pueda pedirlo TODO."""
    cod, html = pedir(cfg['url'])
    print('index servido: HTTP %s' % cod)
    if cod != 200:
        raise SystemExit('la pagina no responde')
    refs = re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', html)
    fallan = []
    for r in refs:
        u = HOST + r if r.startswith('/') else cfg['url'] + r
        c2, _ = pedir(u)
        if c2 != 200:
            fallan.append((r, c2))
    if fallan:
        for r, c2 in fallan:
            print('   FALTA %s -> HTTP %s' % (r, c2))
        raise SystemExit('LA PAGINA SE VERA EN BLANCO: faltan ficheros')
    print('   los %d ficheros del arranque responden 200' % len(refs))


if __name__ == '__main__':
    cual = sys.argv[1] if len(sys.argv) > 1 else 'staging'
    if cual not in ENTORNOS:
        raise SystemExit('entorno: staging o produccion')
    cfg = ENTORNOS[cual]
    if cual == 'produccion':
        # Produccion la estan usando las gestoras. Que cueste un paso mas.
        if input('Vas a subir a PRODUCCION (%s). Escribe SI: ' % cfg['url']).strip() != 'SI':
            raise SystemExit('cancelado')
    print('=' * 60)
    print('%s  ->  %s' % (cual, cfg['url']))
    print('=' * 60)
    construir(cfg)
    revisar_lo_construido(cfg)
    subir(cfg)
    revisar_lo_servido(cfg)
    print('\nlisto: %s' % cfg['url'])
