import { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import client, { setAccessToken, setOnAuthFailure } from '@/shared/api/client';

const AuthContext = createContext(null);

// Sentinel para el modo "Todos los proyectos" (vista agregada).
export const ALL_PROJECTS_ID = -1;
const ALL_PROJECTS_PSEUDO = { id: ALL_PROJECTS_ID, nombre: 'Todos los proyectos', isAll: true, type: 'multi' };

// La sociedad elegida sobrevive a recargar, igual que el proyecto: si no,
// cada F5 devolveria a Carlos a «todos los proyectos» sin decirle nada.
const CLAVE_SOCIEDAD = 'crm_active_issuer_id';

/** El nombre corto de una empresa: su alias («Solvenic») o la primera palabra («CEDIA»). */
export function nombreCortoDeEmpresa({ alias = null, razon_social: razonSocial = '' } = {}) {
  const a = String(alias || '').trim();
  if (a) return a;
  return String(razonSocial || '').trim().split(/[\s,]+/)[0] || 'Empresa';
}

// Dev-only bypass: fake superadmin user + proyectos seed para validar UI sin backend.
const BYPASS = String(import.meta.env.VITE_DEV_BYPASS_AUTH || '').toLowerCase() === 'true';
const FAKE_USER = { id: 1, userId: 1, nombre: 'Dev Bypass', email: 'dev@local', role: 'superadmin' };
const FAKE_PROJECTS = [
  { id: 1, nombre: 'Psiko Aprende', slug: 'psiko-aprende', type: 'multi' },
  { id: 2, nombre: 'ISEIH', slug: 'iseih', type: 'multi' },
  { id: 3, nombre: 'Fono Aprende', slug: 'fono-aprende', type: 'multi' },
  { id: 4, nombre: 'ICTESS', slug: 'ictess', type: 'multi' },
];


/**
 * El proyecto que pide la direccion, si la persona lo tiene (#132).
 *
 * Los enlaces del resumen de mañana llevan `?projectId=N&qf=...`, y el numero
 * del correo se calcula PARA ESE proyecto. Sin esto, el enlace abriria el
 * listado con el proyecto que estuviera activo de antes: el correo diria «7» y
 * la pantalla enseñaria otra cosa, que es lo que el ticket prohibe.
 *
 * Se lee de `window.location` y no del router porque esto corre por encima de
 * el. Y se comprueba contra los proyectos de la persona: un id en la barra de
 * direcciones no da acceso a nada — solo elige entre lo que ya tiene.
 */
function proyectoDeLaUrl(proyectos) {
  try {
    const pedido = Number(new URLSearchParams(window.location.search).get('projectId'));
    if (!Number.isInteger(pedido) || pedido <= 0) return null;
    return proyectos?.find((p) => p.id === pedido)?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * La empresa guardada, si la persona tiene algún campus de ella (#120). Si no,
 * null: una empresa que ya no le toca no se restaura.
 */
function sociedadGuardadaDe(proyectos) {
  try {
    const guardada = localStorage.getItem(CLAVE_SOCIEDAD);
    if (guardada === null) return null;
    const id = Number(guardada);
    return proyectos?.some((p) => Number(p.sociedad_emisora_id) === id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * LA EMPRESA Y EL CAMPUS NO VAN A LA VEZ (11/11).
 *
 * Con una empresa elegida el proyecto activo es «todos» (-1). Al entrar, el
 * login cogía el proyecto guardado —y si era -1, que no está en la lista, el
 * primero: en CEDIA, por orden alfabético, Fono Aprende— pero dejaba la empresa
 * guardada. El selector decía «CEDIA · 8 campus» y el menú, el logo y el color
 * de Fono Aprende. Ahora: si la dirección pide un campus, manda el campus y se
 * olvida la empresa; si no y hay empresa guardada que siga siendo suya, se
 * entra en la empresa; si no, como siempre.
 */
export function eleccionAlEntrar({ proyectos, deLaUrl = null, guardado = null, delServidor = null }) {
  const sociedad = sociedadGuardadaDe(proyectos);
  if (deLaUrl) return { projectId: deLaUrl, issuerId: null };
  if (sociedad !== null && proyectos?.length > 1) return { projectId: ALL_PROJECTS_ID, issuerId: sociedad };
  const num = Number(guardado);
  const valido = num === ALL_PROJECTS_ID
    ? ALL_PROJECTS_ID
    : proyectos?.find((p) => p.id === num)?.id;
  return { projectId: valido || delServidor || proyectos?.[0]?.id || null, issuerId: null };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(BYPASS ? FAKE_USER : null);
  const [projects, setProjects] = useState(BYPASS ? FAKE_PROJECTS : []);
  const [activeProjectId, setActiveProjectId] = useState(BYPASS ? FAKE_PROJECTS[0].id : null);

  // Null salvo que se haya elegido una sociedad entera (#120).
  const [activeIssuerId, setActiveIssuerId] = useState(() => {
    const guardada = localStorage.getItem(CLAVE_SOCIEDAD);
    return guardada === null ? null : Number(guardada);
  });
  const [loading, setLoading] = useState(!BYPASS); // bypass salta el loader

  // Deja puesto lo que dice `eleccionAlEntrar`, en el estado y en lo guardado.
  const aplicarEleccion = useCallback(({ projectId, issuerId }) => {
    setActiveProjectId(projectId);
    setActiveIssuerId(issuerId);
    try {
      if (projectId) localStorage.setItem('crm_active_project_id', String(projectId));
      if (issuerId === null) localStorage.removeItem(CLAVE_SOCIEDAD);
      else localStorage.setItem(CLAVE_SOCIEDAD, String(issuerId));
    } catch { /* sin almacenamiento, solo en memoria */ }
  }, []);

  // LOS PERMISOS DE CADA UNO, los que calcula el backend.
  //
  // `/auth/me` los manda desde hace tiempo --rol, rol a medida y lo que se le
  // da a una persona suelta-- y aqui no se guardaban: la pantalla solo sabia el
  // rol. Ana, Dayana y Yosbely tenian «venta sin gestora» dado en el panel de
  // permisos y el boton no les salia nunca. Ana, 28/09.
  const [permissions, setPermissions] = useState(null);
  const initialized = useRef(false);

  // Al montar, intentar restaurar sesión con refresh token (cookie httpOnly)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function restoreSession() {
      try {
        // Intentar refresh para obtener nuevo accessToken
        const apiBase = (import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '') + '/api';
        const refreshRes = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!refreshRes.ok) {
          setLoading(false);
          return;
        }

        const refreshData = await refreshRes.json();
        if (refreshData.success && refreshData.data.accessToken) {
          setAccessToken(refreshData.data.accessToken);

          // Obtener datos del usuario
          const meRes = await client.get('/auth/me');
          if (meRes.success) {
            setUser(meRes.data.user);
            setPermissions(meRes.data.permissions || null);
            setProjects(meRes.data.projects || []);
            // Restaurar proyecto activo de localStorage o usar el primero.
            // La direccion manda sobre lo guardado: si vienes de un enlace del
            // correo, tiene que abrirse el proyecto de ese enlace (#132).
            const deLaUrl = proyectoDeLaUrl(meRes.data.projects);
            aplicarEleccion(eleccionAlEntrar({
              proyectos: meRes.data.projects,
              deLaUrl,
              guardado: localStorage.getItem('crm_active_project_id'),
            }));
          }
        }
      } catch {
        // Sin sesión valida — no hacer nada
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, [aplicarEleccion]);

  // Configurar callback de fallo de auth para limpiar estado
  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null);
      setPermissions(null);
      setProjects([]);
      setActiveProjectId(null);
      setAccessToken(null);
    });
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await client.post('/auth/login', { email, password });

    if (!res.success) {
      throw new Error(res.error || 'Error al iniciar sesión');
    }

    const { accessToken: token, user: userData, projects: userProjects, activeProjectId: apiProjectId, permissions: mapa } = res.data;
    // El mapa de permisos llega ya con el login (#423): no hay tabla de respaldo.
    if (mapa) setPermissions(mapa);

    setAccessToken(token);
    setUser(userData);
    setProjects(userProjects || []);

    // El proyecto (o la empresa) con el que se entra: el de la dirección, la
    // empresa guardada, el proyecto guardado, el del login o el primero.
    aplicarEleccion(eleccionAlEntrar({
      proyectos: userProjects,
      deLaUrl: proyectoDeLaUrl(userProjects),
      guardado: localStorage.getItem('crm_active_project_id'),
      delServidor: apiProjectId,
    }));

    // Y /auth/me, que trae lo mismo y lo que se haya cambiado desde entonces.
    // Y el usuario: el alcance comercial (#704) solo viene aquí.
    client.get('/auth/me')
      .then((me) => {
        if (!me.success) return;
        setPermissions(me.data.permissions || null);
        if (me.data.user) setUser((antes) => (antes ? { ...antes, ...me.data.user } : antes));
      })
      .catch(() => {});

    return userData;
  }, [aplicarEleccion]);

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout');
    } catch {
      // Ignorar errores de logout — limpiar estado igual
    }
    setAccessToken(null);
    setUser(null);
    setPermissions(null);
    setProjects([]);
    setActiveProjectId(null);
    // La empresa también: si no, quien entra después en este navegador se
    // encontraba la empresa de antes con el primer campus de la lista (11/11).
    setActiveIssuerId(null);
    localStorage.removeItem('crm_active_project_id');
    localStorage.removeItem(CLAVE_SOCIEDAD);
  }, []);

  const switchProject = useCallback((projectId) => {
    // Elegir un proyecto sale del modo sociedad: son excluyentes.
    setActiveIssuerId(null);
    localStorage.removeItem(CLAVE_SOCIEDAD);
    if (projectId === ALL_PROJECTS_ID) {
      setActiveProjectId(ALL_PROJECTS_ID);
      localStorage.setItem('crm_active_project_id', String(ALL_PROJECTS_ID));
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setActiveProjectId(projectId);
      localStorage.setItem('crm_active_project_id', String(projectId));
    }
  }, [projects]);

  /**
   * Elegir una sociedad entera: sus campus sumados (#120).
   *
   * Va JUNTO al proyecto activo, no en su lugar. `activeProject` se queda como
   * «todos los proyectos», que es lo que ya sabe manejar el resto del CRM: hay
   * 310 sitios que leen `activeProject.id` y meterles ahi el id de una sociedad
   * seria mandar un numero de sociedad donde se espera uno de proyecto.
   *
   * Quien entiende de sociedades lee `activeIssuerId`. Ya no es solo
   * Reportes: prospectos, clientes, el pipeline y el dashboard tambien
   * acotan por empresa (via useIdsDelAmbito).
   */
  const switchIssuer = useCallback((issuerId) => {
    const tiene = projects.some((p) => Number(p.sociedad_emisora_id) === Number(issuerId));
    if (!tiene && issuerId !== null) return;
    setActiveIssuerId(issuerId === null ? null : Number(issuerId));
    setActiveProjectId(ALL_PROJECTS_ID);
    localStorage.setItem('crm_active_project_id', String(ALL_PROJECTS_ID));
    if (issuerId === null) localStorage.removeItem(CLAVE_SOCIEDAD);
    else localStorage.setItem(CLAVE_SOCIEDAD, String(issuerId));
  }, [projects]);

  const isAuthenticated = !!user;

  // UN SOLO CAMPUS, Y SE VE DIRECTAMENTE (#220). Con uno no hay «todos» ni
  // empresa que sumar: el selector ya no ofrecia «Todos los proyectos», pero si
  // en ese navegador se habia quedado guardado (-1, o una empresa) de cuando la
  // persona tenia mas, entraba a la vista global de un solo campus. Se ignora
  // lo guardado sin borrarlo: si mañana le dan otro, vuelve a valer.
  const unSoloCampus = projects.length === 1;
  const activeProject = unSoloCampus
    ? projects[0]
    : activeProjectId === ALL_PROJECTS_ID
      ? ALL_PROJECTS_PSEUDO
      : projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  const isAllProjects = !unSoloCampus && activeProjectId === ALL_PROJECTS_ID;
  // La empresa solo cuenta con «todos» puesto: con un campus elegido, manda el
  // campus. Así no puede volver a verse una empresa en el selector y un campus
  // en el menú (11/11).
  const issuerEfectivo = unSoloCampus || activeProjectId !== ALL_PROJECTS_ID ? null : activeIssuerId;

  // La sociedad elegida, con sus campus. Si se queda sin ninguno —porque
  // cambiaron las asignaciones— sigue siendo la elegida y con la lista vacia:
  // la pantalla tiene que poder decir «no tiene campus asignados» en vez de
  // pintar una tabla vacia.
  const activeIssuer = issuerEfectivo === null ? null : (() => {
    const campus = projects.filter((p) => Number(p.sociedad_emisora_id) === issuerEfectivo);
    const s = campus[0] || {};
    return {
      id: issuerEfectivo,
      nombre: s.sociedad_nombre || 'Sociedad',
      // La marca de la empresa, para el menú (11/11): su nombre corto y su logo
      // si lo tiene. Nunca el de uno de sus campus.
      nombreCorto: nombreCortoDeEmpresa({ alias: s.sociedad_alias, razon_social: s.sociedad_nombre }),
      logo_url: s.sociedad_logo_url || null,
      logo_subido: !!s.sociedad_logo_subido,
      campus,
    };
  })();

  const refreshUser = useCallback(async () => {
    try {
      const res = await client.get('/auth/me');
      if (res.success) {
        setUser(res.data.user);
        setPermissions(res.data.permissions || null);
        setProjects(res.data.projects || []);
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      permissions,
      projects,
      activeProject,
      activeProjectId: activeProject?.id || null,
      isAllProjects,
      activeIssuer,
      activeIssuerId: issuerEfectivo,
      switchIssuer,
      isAuthenticated,
      loading,
      login,
      logout,
      switchProject,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
