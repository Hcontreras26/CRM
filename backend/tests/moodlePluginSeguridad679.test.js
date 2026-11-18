import { describe, it, expect, afterEach } from 'vitest';
import { esArchivoDelCampus } from '../src/modules/tutores/tutor.correccion.js';
import { alumnosDe } from '../src/modules/tutores/tutor.micampus.js';
import { ipInterna, sitioPermitido } from '../src/modules/consultas/consultas.conexion.js';
import { firmar, firmaValida, mismaDireccion } from '../src/modules/consultas/consultas.plugin.js';
import { porCorregir } from '../src/shared/services/moodle.client.js';

/*
  Lo que salió en la auditoría de #679/#681 (05/11): el proxy de archivos de
  «Corregir desde el CRM», la conexión con código, la firma de los avisos del
  plugin, cuándo una entrega está «por corregir» y a qué alumnos ve cada profesora
  con grupos separados.
*/

describe('#681 · el proxy de archivos solo sirve archivos del campus', () => {
  const base = 'https://campus.iseih.com';
  it('mismo origen y ruta de pluginfile: vale', () => {
    expect(esArchivoDelCampus(new URL(`${base}/webservice/pluginfile.php/12/assignsubmission_file/x.pdf`), base)).toBe(true);
    expect(esArchivoDelCampus(new URL(`${base}/pluginfile.php/12/x.pdf`), base)).toBe(true);
  });
  it('un dominio que solo EMPIEZA igual no vale (se llevaría el token)', () => {
    expect(esArchivoDelCampus(new URL('https://campus.iseih.com.evil.net/webservice/pluginfile.php/1/x'), base)).toBe(false);
    expect(esArchivoDelCampus(new URL('https://campus.iseih.comevil.net/pluginfile.php/1/x'), base)).toBe(false);
  });
  it('otra ruta del mismo campus, u otro protocolo o puerto, no vale', () => {
    expect(esArchivoDelCampus(new URL(`${base}/admin/settings.php?x=/pluginfile.php/`), base)).toBe(false);
    expect(esArchivoDelCampus(new URL('http://campus.iseih.com/pluginfile.php/1/x'), base)).toBe(false);
    expect(esArchivoDelCampus(new URL('https://campus.iseih.com:8443/pluginfile.php/1/x'), base)).toBe(false);
  });
  it('un campus en subcarpeta: la ruta va bajo su carpeta', () => {
    const sub = 'https://web.com/campus';
    expect(esArchivoDelCampus(new URL('https://web.com/campus/pluginfile.php/1/x'), sub)).toBe(true);
    expect(esArchivoDelCampus(new URL('https://web.com/otro/pluginfile.php/1/x'), sub)).toBe(false);
  });
});

describe('#679 · conectar con código: a dónde llama el CRM', () => {
  const antes = { local: process.env.MOODLE_PERMITIR_RED_LOCAL, env: process.env.NODE_ENV };
  afterEach(() => { process.env.MOODLE_PERMITIR_RED_LOCAL = antes.local; process.env.NODE_ENV = antes.env; });
  const resuelve = (ip) => async () => [{ address: ip }];

  it('red interna: no', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(ipInterna(ip), ip).toBe(true);
    }
    expect(ipInterna('187.124.128.126')).toBe(false);
  });
  it('https y pública: sí; http, interna o con usuario en la URL: no', async () => {
    delete process.env.MOODLE_PERMITIR_RED_LOCAL;
    expect((await sitioPermitido('https://campus.iseih.com', { resolver: resuelve('8.8.8.8') })).ok).toBe(true);
    expect((await sitioPermitido('http://campus.iseih.com', { resolver: resuelve('8.8.8.8') })).ok).toBe(false);
    expect((await sitioPermitido('https://interno.local', { resolver: resuelve('10.1.2.3') })).ok).toBe(false);
    expect((await sitioPermitido('https://a:b@campus.iseih.com', { resolver: resuelve('8.8.8.8') })).ok).toBe(false);
    expect((await sitioPermitido('no es una url')).ok).toBe(false);
  });
  it('el permiso de red local no vale en producción', async () => {
    process.env.MOODLE_PERMITIR_RED_LOCAL = 'true';
    process.env.NODE_ENV = 'development';
    expect((await sitioPermitido('http://localhost:8085')).ok).toBe(true);
    process.env.NODE_ENV = 'production';
    expect((await sitioPermitido('http://localhost:8085', { resolver: resuelve('127.0.0.1') })).ok).toBe(false);
  });
  it('misma dirección con o sin protocolo y barra final', () => {
    expect(mismaDireccion('https://Campus.iseih.com/', 'https://campus.iseih.com')).toBe(true);
    expect(mismaDireccion('https://campus.iseih.com', 'https://campus.psiko.com')).toBe(false);
  });
});

describe('#679 · la firma de los avisos', () => {
  const clave = 'a'.repeat(64);
  const cuerpo = Buffer.from('{"evento":"mensaje"}');
  it('la firma buena vale; otro cuerpo, otra clave o fuera de 5 minutos, no', () => {
    const ahora = Date.now();
    const t = Math.floor(ahora / 1000);
    const firma = firmar(cuerpo, clave, t);
    expect(firmaValida(firma, cuerpo, clave, ahora)).toBe(true);
    expect(firmaValida(firma, Buffer.from('{"evento":"otro"}'), clave, ahora)).toBe(false);
    expect(firmaValida(firma, cuerpo, 'b'.repeat(64), ahora)).toBe(false);
    expect(firmaValida(firma, cuerpo, clave, ahora + 6 * 60_000)).toBe(false);
    expect(firmaValida('t=1,v1=zz', cuerpo, clave, ahora)).toBe(false);
    expect(firmaValida(null, cuerpo, clave, ahora)).toBe(false);
  });
});

// La ficha de la consulta (#679) enseña las entregas sin corregir del alumno.
describe('#679/#681 · cuándo una entrega está por corregir', () => {
  const dia = (d) => new Date(`2026-11-0${d}T10:00:00Z`);
  it('entregada sin nota: sí; sin entregar: no', () => {
    expect(porCorregir({ estado: 'submitted', gradingstatus: 'notgraded', entregadaAt: dia(2) }, undefined)).toBe(true);
    expect(porCorregir({ estado: 'new', gradingstatus: 'notgraded', entregadaAt: null }, undefined)).toBe(false);
  });
  it('calificada: no; con flujo de calificación, «released» también es corregida', () => {
    expect(porCorregir({ estado: 'submitted', gradingstatus: 'graded', entregadaAt: dia(2) }, { nota: 8, at: dia(3) })).toBe(false);
    expect(porCorregir({ estado: 'submitted', gradingstatus: 'released', entregadaAt: dia(2) }, { nota: 8, at: dia(3) })).toBe(false);
  });
  it('vuelta a entregar DESPUÉS de la nota: otra vez por corregir', () => {
    expect(porCorregir({ estado: 'submitted', gradingstatus: 'graded', entregadaAt: dia(4) }, { nota: 8, at: dia(3) })).toBe(true);
  });
});

describe('#681 · grupos separados: a quién ve cada profesora', () => {
  const gente = [
    { id: 1, roles: ['teacher'], grupos: [10] },
    { id: 2, roles: ['student'], grupos: [10] },
    { id: 3, roles: ['student'], grupos: [20] },
    { id: 4, roles: ['alumno'], grupos: [] },
    { id: 5, roles: ['editingteacher'], grupos: [] },
  ];
  it('sin permiso de edición y con grupo: solo los de su grupo', () => {
    expect(alumnosDe(gente, gente[0]).map((a) => a.id)).toEqual([2]);
  });
  it('con permiso de edición, o sin grupo: todos los alumnos (también con rol propio)', () => {
    expect(alumnosDe(gente, gente[4]).map((a) => a.id)).toEqual([2, 3, 4]);
    expect(alumnosDe(gente, { id: 9, roles: ['teacher'], grupos: [] }).map((a) => a.id)).toEqual([2, 3, 4]);
  });
});
