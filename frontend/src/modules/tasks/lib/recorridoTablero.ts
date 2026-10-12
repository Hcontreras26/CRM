import type { PasoRecorrido } from '@/shared/components/ui/RecorridoGuiado';

/**
 * El recorrido del tablero del equipo (Diego, 12/10: «un tutorial guiado, para verlo y
 * todo»). Cada paso señala algo de la pantalla con `data-recorrido`; lo que esa persona
 * no tiene (un colaborador no ve «Todo el equipo» ni «Configurar tablero») se salta solo.
 */
export const CLAVE_RECORRIDO_TABLERO = 'tablero-recorrido-visto-v1';

export const PASOS_TABLERO: PasoRecorrido[] = [
  {
    titulo: 'El tablero del equipo de desarrollo',
    texto: 'Aquí van las tareas del equipo —web, SEO, Meta, diseño, Moodle—, cada una con su responsable. Avanzan de «Por hacer» a «En curso», «En revisión» y «Hecha». Solo lo usan superadmin, admin y colaboradores: las gestoras no lo ven. En {pasos} pasos te enseño cada cosa.',
  },
  {
    donde: '[data-recorrido="vista"]',
    titulo: 'Qué tablero ves',
    texto: '«Mi tablero» son tus tareas. Si ves a todo el equipo, aquí cambias a «Todo el equipo» o al tablero de una persona concreta. «Por revisar» sale si puedes aprobar tareas.',
  },
  {
    donde: '[data-recorrido="metricas"]',
    titulo: 'Cómo va cada uno',
    texto: 'Por persona o por área: cuántas tareas tiene abiertas, cuántas vencidas y cuántas cerró esta semana. Pulsa a alguien para abrir su tablero.',
  },
  {
    donde: '[data-recorrido="areas"]',
    titulo: 'Las áreas',
    texto: 'Meta, WEB · WordPress · SEO, Diseño, Campus y Moodle… Pulsa una para ver solo sus tareas. Las áreas se crean en «Configurar tablero».',
  },
  {
    donde: '[data-recorrido="filtros"]',
    titulo: 'Buscar y filtrar',
    texto: 'Busca por título o descripción, y filtra por campus, proyecto propio (Opynio, YourCVPassport…), prioridad, etiqueta o fechas; «Solo vencidas» deja lo que ya pasó de fecha. Los campus que salen son los de la empresa elegida arriba; con «Todos los proyectos», todos, agrupados por empresa.',
  },
  {
    donde: '[data-recorrido="columnas"]',
    titulo: 'Las columnas',
    texto: 'Arrastra una tarjeta para avanzarla o para ordenarla dentro de su columna (en el móvil, ábrela y cambia su estado). Cuando termines una tarea, llévala a «En revisión»: solo quien aprueba la pasa a «Hecha».',
  },
  {
    donde: '[data-recorrido="tarjeta"]',
    titulo: 'Una tarea',
    texto: 'Cada tarjeta dice su prioridad, su fecha límite, de quién es y cuánto lleva de su lista. Ábrela para ver y cambiar todo: descripción, lista de comprobación, comentarios, enlaces, etiquetas y el historial de quién hizo qué.',
  },
  {
    donde: '[data-recorrido="nueva"]',
    titulo: 'Crear una tarea',
    texto: 'Título, responsable, fecha límite, prioridad, área y campus o proyecto propio. Un admin solo asigna a gente de sus campus. A quien se la asignas le llega un aviso en la campana y un correo con la marca del campus.',
  },
  {
    donde: 'a[href*="tareas/revisar"]',
    titulo: 'Por revisar',
    texto: 'Las tareas que el equipo dio por terminadas. Apruébalas para pasarlas a «Hecha», o devuélvelas con el motivo: vuelven a «En curso» y el motivo queda como comentario.',
  },
  {
    donde: '[data-recorrido="configurar"]',
    titulo: 'Configurar el tablero',
    texto: 'Las columnas (puedes añadir «Bloqueada», por ejemplo), las áreas y quién va en cada una, y los proyectos propios. Los permisos de cada rol, en Configuración › Roles.',
  },
  {
    titulo: 'Y cada mañana',
    texto: 'Quien tiene tareas para hoy o vencidas recibe un correo con ellas. Los avisos también llegan a la campana. Este recorrido vuelve con el botón «Recorrido» de arriba cuando quieras.',
  },
];
