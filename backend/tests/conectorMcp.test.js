import { describe, it, expect, vi } from 'vitest';

// El conector «Servidor MCP» (Diego, 29/09): el CRM se conecta a un servidor MCP
// de fuera con las limitaciones del MCP de Diana. Aquí, las reglas que no
// necesitan un servidor de verdad; la llamada real se prueba contra /testeo.
vi.mock('../src/modules/mcp/mcp.model.js', () => ({ registrarAuditoria: vi.fn(async () => {}) }));

const { esDeSoloLectura, ipPrivada, comprobarUrl, traerDatos, LIMITES } = await import('../src/modules/connectors/connectors.mcp.js');

describe('solo consulta', () => {
  it('solo vale una herramienta que el servidor marca de solo lectura', () => {
    expect(esDeSoloLectura({ annotations: { readOnlyHint: true } })).toBe(true);
    expect(esDeSoloLectura({ annotations: { readOnlyHint: true, destructiveHint: false } })).toBe(true);
  });

  it('sin la marca, o destructiva, no — aunque el nombre suene inofensivo', () => {
    expect(esDeSoloLectura({ name: 'listar_cursos' })).toBe(false);
    expect(esDeSoloLectura({ annotations: {} })).toBe(false);
    expect(esDeSoloLectura({ annotations: { readOnlyHint: true, destructiveHint: true } })).toBe(false);
    expect(esDeSoloLectura({ annotations: { readOnlyHint: 'true' } })).toBe(false);
  });
});

describe('solo servidores públicos', () => {
  it('reconoce las direcciones internas', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.16.0.1', '172.31.255.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      expect(ipPrivada(ip), ip).toBe(true);
    }
  });

  it('y deja pasar las públicas', () => {
    for (const ip of ['187.124.128.126', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
      expect(ipPrivada(ip), ip).toBe(false);
    }
  });

  it('rechaza http, localhost y una IP interna escrita a mano', async () => {
    await expect(comprobarUrl('http://example.com/mcp')).rejects.toThrow(/https/);
    await expect(comprobarUrl('https://localhost:3001/api/mcp')).rejects.toThrow(/red interna/);
    await expect(comprobarUrl('https://127.0.0.1/api/mcp')).rejects.toThrow(/red interna/);
    await expect(comprobarUrl('https://[::1]/mcp')).rejects.toThrow(/red interna/);
    await expect(comprobarUrl('esto no es una url')).rejects.toThrow(/no es válida/);
  });
});

describe('lo que hay que decirle', () => {
  it('sin herramienta no llama a nada', async () => {
    await expect(traerDatos({ url: 'https://example.com/mcp' })).rejects.toThrow(/herramienta/);
  });

  it('los argumentos tienen que ser un objeto JSON', async () => {
    await expect(traerDatos({ url: 'https://example.com/mcp', herramienta: 'x', argumentos: '{mal' })).rejects.toThrow(/JSON/);
    await expect(traerDatos({ url: 'https://example.com/mcp', herramienta: 'x', argumentos: '[1,2]' })).rejects.toThrow(/objeto/);
  });

  it('los topes son los acordados', () => {
    expect(LIMITES).toMatchObject({ TIEMPO_MS: 20000, MAX_CARACTERES: 5000000, MAX_ELEMENTOS: 5000, LLAMADAS_POR_MINUTO: 20 });
  });
});
