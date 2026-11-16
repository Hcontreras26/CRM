<?php
// This file is part of Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * local_crm: la mensajería del campus, unida al CRM (CRM #679).
 *
 * @package    local_crm
 * @copyright  2026 ISEIE Innovation School
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_crm;

defined('MOODLE_INTERNAL') || die();

/**
 * La burbuja del chat (1.11.0): el chat de grupo del alumno con las tutoras de su curso,
 * abierto desde cualquier página del curso, sin salir de ella.
 *
 * No es otro chat: es la MISMA conversación de grupo de chat_grupo (la de «Entrar al chat»).
 * Por eso todo lo de antes sigue igual: cada mensaje llega al CRM por el observador, la
 * tutora responde desde el CRM o desde la mensajería de Moodle, y la respuesta sale aquí.
 *
 * Solo la ve el alumno (matriculado en el curso, sin ser tutora ni poder editar el curso).
 * La tutora sigue en su mensajería, donde están las conversaciones de todos sus alumnos.
 */
class burbuja {

    /** Cuántos mensajes trae la primera lectura (los últimos). */
    const PRIMEROS = 50;

    /** Las páginas en las que no se pinta: las que no tienen el marco del curso. */
    const SIN_BURBUJA = ['embedded', 'popup', 'frametop', 'print', 'redirect', 'maintenance', 'secure'];

    /**
     * Las páginas de hacer un cuestionario (las preguntas y el resumen antes de enviar): durante
     * un examen no se chatea. La revisión, con el intento ya enviado, sí la lleva.
     */
    const PAGINAS_SIN_BURBUJA = ['mod-quiz-attempt', 'mod-quiz-summary'];

    /** ¿Encendida? Hace falta el chat de grupo y su propio ajuste («burbuja»). De serie, no. */
    public static function activa(): bool {
        return chat_grupo::activo() && (bool) get_config('local_crm', 'burbuja');
    }

    /** ¿Es un alumno de ese curso, que puede usar la burbuja? */
    public static function es_alumno(int $courseid, int $userid): bool {
        if ($courseid <= SITEID || !$userid || isguestuser($userid)) {
            return false;
        }
        $contexto = \context_course::instance($courseid, IGNORE_MISSING);
        if (!$contexto || !is_enrolled($contexto, $userid, '', true)) {
            return false;
        }
        return !self::da_clase($contexto, $userid)
            && !has_capability('moodle/course:update', $contexto, $userid);
    }

    /**
     * ¿Tiene rol de profesora (con o sin edición) en el curso? Una sola consulta, porque se
     * mira en cada página del curso: chat_directo::tutoras() carga a todos los matriculados.
     * Sin excluir nombres: una cuenta «Inspector…» tampoco es alumna.
     */
    private static function da_clase(\context_course $contexto, int $userid): bool {
        global $DB;
        $roles = chat_directo::roles_tutora();
        if (!$roles) {
            return false;
        }
        [$insql, $params] = $DB->get_in_or_equal($roles, SQL_PARAMS_NAMED);
        $params += ['ctx' => $contexto->id, 'yo' => $userid];
        return $DB->record_exists_sql(
            "SELECT 1 FROM {role_assignments} WHERE contextid = :ctx AND userid = :yo AND roleid $insql", $params);
    }

    /** La conversación que ya tiene el alumno en ese curso, sin crearla ni repasar miembros. */
    public static function conversacion_existente(int $courseid, int $userid): ?int {
        global $DB;
        $id = $DB->get_field('local_crm_conversaciones', 'conversationid', ['courseid' => $courseid, 'userid' => $userid]);
        return $id ? (int) $id : null;
    }

    /**
     * Los mensajes de la conversación posteriores a `$desde` (o los últimos, si es 0), del
     * más antiguo al más reciente, sin los que el alumno ha borrado.
     *
     * @return array[]
     */
    public static function mensajes(int $conversationid, int $userid, int $desde, \context $contexto): array {
        global $DB;
        $params = ['conv' => $conversationid, 'desde' => $desde, 'yo' => $userid,
            'borrado' => \core_message\api::MESSAGE_ACTION_DELETED];
        $sql = "SELECT m.id, m.useridfrom, m.fullmessage, m.fullmessageformat, m.fullmessagehtml, m.timecreated
                  FROM {messages} m
             LEFT JOIN {message_user_actions} a ON a.messageid = m.id AND a.userid = :yo AND a.action = :borrado
                 WHERE m.conversationid = :conv AND m.id > :desde AND a.id IS NULL
              ORDER BY m.id " . ($desde ? 'ASC' : 'DESC');
        // La primera vez, los últimos; después, los siguientes en orden (si hubiera más de
        // PRIMEROS de golpe, el resto llega en la lectura siguiente sin saltarse ninguno).
        $filas = array_values($DB->get_records_sql($sql, $params, 0, self::PRIMEROS));
        if (!$desde) {
            $filas = array_reverse($filas);
        }
        $nombres = [];
        $salida = [];
        foreach ($filas as $m) {
            $de = (int) $m->useridfrom;
            if (!isset($nombres[$de])) {
                $u = \core_user::get_user($de, implode(', ', array_merge(['id', 'deleted'],
                    \core_user\fields::for_name()->get_required_fields())));
                $nombres[$de] = $u && !$u->deleted ? fullname($u) : '';
            }
            $salida[] = [
                'id'     => (int) $m->id,
                'mio'    => $de === $userid,
                'de'     => $nombres[$de],
                'html'   => self::html($m, $contexto),
                'fecha'  => (int) $m->timecreated,
            ];
        }
        return $salida;
    }

    /** Los mensajes de otros que el alumno no ha leído en esa conversación. */
    public static function no_leidos(int $conversationid, int $userid): int {
        global $DB;
        return (int) $DB->count_records_sql(
            "SELECT COUNT(1)
               FROM {messages} m
          LEFT JOIN {message_user_actions} a ON a.messageid = m.id AND a.userid = :yo
              WHERE m.conversationid = :conv AND m.useridfrom <> :yo2 AND a.id IS NULL",
            ['conv' => $conversationid, 'yo' => $userid, 'yo2' => $userid]);
    }

    /**
     * El texto del mensaje, en HTML limpio (format_text quita lo peligroso). Con su formato
     * de origen: la respuesta del CRM viene en HTML y lo del alumno en texto con saltos de línea.
     */
    private static function html(\stdClass $m, \context $contexto): string {
        if (trim((string) $m->fullmessage) !== '') {
            return format_text($m->fullmessage, $m->fullmessageformat, ['context' => $contexto, 'para' => false]);
        }
        return format_text((string) $m->fullmessagehtml, FORMAT_HTML, ['context' => $contexto, 'para' => false]);
    }

    /**
     * El script de la burbuja, al pie de cada página del curso, o '' si no toca: apagada,
     * fuera de un curso, en páginas sin marco, en la mensajería o para quien no es alumno.
     */
    public static function script(): string {
        global $PAGE, $USER, $CFG;
        if (!self::activa() || !isloggedin() || isguestuser() || empty($PAGE->course->id)
                || (int) $PAGE->course->id === SITEID || in_array($PAGE->pagelayout, self::SIN_BURBUJA, true)
                || in_array((string) $PAGE->pagetype, self::PAGINAS_SIN_BURBUJA, true)
                || strpos((string) $PAGE->pagetype, 'message-') === 0 || !aviso::configurado()) {
            return '';
        }
        $courseid = (int) $PAGE->course->id;
        if (!self::es_alumno($courseid, (int) $USER->id)) {
            return '';
        }
        $textos = [];
        foreach (['burbuja_abrir', 'burbuja_cerrar', 'burbuja_titulo', 'burbuja_subtitulo', 'burbuja_escribe',
                'burbuja_enviar', 'burbuja_vacio', 'burbuja_error', 'burbuja_nuevo', 'chat_sin_tutora'] as $clave) {
            $textos[$clave] = get_string($clave, 'local_crm');
        }
        $config = json_encode([
            'ajax'     => $CFG->wwwroot . '/lib/ajax/service.php',
            'sesskey'  => sesskey(),
            'curso'    => $courseid,
            'textos'   => $textos,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
        $js = file_get_contents(__DIR__ . '/../burbuja/burbuja.js');
        $css = file_get_contents(__DIR__ . '/../burbuja/burbuja.css');
        return "<style>{$css}</style>\n<script>window.LOCAL_CRM_BURBUJA = {$config};\n{$js}</script>";
    }
}
