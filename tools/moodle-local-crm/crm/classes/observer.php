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
 * El mensaje no se manda al CRM aquí: se encola. Así el alumno no espera a que el
 * CRM conteste al enviar su mensaje, y si el CRM está caído la tarea se reintenta
 * sola (las tareas ad hoc de Moodle se reintentan con espera creciente).
 */
class observer {
    /** Un mensaje privado: todos van al CRM (él decide cuáles son consultas). */
    public static function mensaje_enviado(\core\event\message_sent $evento): void {
        if (!aviso::configurado()) {
            return;
        }
        self::encolar((int) $evento->objectid);
    }

    /**
     * Un mensaje en una conversación de grupo (1.9.0). Va al CRM si es uno de los chats de
     * grupo del plugin o, además, cualquier conversación de grupo de un curso (p. ej. la de un
     * grupo del curso) en la que haya una tutora de ese curso: todos los chats de la tutora.
     */
    public static function mensaje_de_grupo(\core\event\group_message_sent $evento): void {
        if (!aviso::configurado()) {
            return;
        }
        $conversacion = (int) ($evento->other['conversationid'] ?? 0);
        if (!$conversacion) {
            return;
        }
        if (!chat_grupo::de_conversacion($conversacion)) {
            $curso = chat_grupo::curso_de_conversacion($conversacion);
            if (!$curso || !chat_grupo::tutoras_dentro($conversacion, $curso)) {
                return;
            }
        }
        self::encolar((int) $evento->objectid);
    }

    /**
     * Encola el aviso y, con «Avisar al CRM al momento» (1.11.0, de serie encendido), además lo
     * intenta mandar al terminar la petición, sin esperar al cron. Si sale bien, la tarea ya no
     * hace falta y se quita; si no (CRM caído o lento), la tarea lo manda como siempre. Si
     * salieran los dos, el CRM no lo apunta dos veces: reconoce el id del mensaje.
     */
    private static function encolar(int $mensajeid): void {
        $tarea = new task\avisar_crm();
        $tarea->set_custom_data(['mensajeid' => $mensajeid]);
        $tareaid = \core\task\manager::queue_adhoc_task($tarea);
        // No en una llamada del servicio web: ahí escribe el propio CRM (la respuesta de la
        // tutora), que ya tiene el mensaje, y esperaría a que el campus le avisara a él mismo.
        $ws = defined('WS_SERVER') && WS_SERVER;
        if (!CLI_SCRIPT && !$ws && get_config('local_crm', 'aviso_inmediato') !== '0') {
            \core_shutdown_manager::register_function([self::class, 'avisar_ahora'], [$mensajeid, (int) $tareaid]);
        }
    }

    /**
     * El aviso al momento: al final de la petición (el mensaje ya está guardado), con poco
     * tiempo de espera para no hacer esperar a quien escribe. Nunca falla hacia fuera.
     */
    public static function avisar_ahora(int $mensajeid, int $tareaid): void {
        global $DB;
        try {
            $aviso = aviso::del_mensaje($mensajeid);
            if ($aviso) {
                aviso::enviar($aviso, 4);
            }
            // Solo ESA tarea: la de este plugin y este mensaje (por si queue_adhoc_task no
            // devolviera el id en alguna versión).
            $DB->delete_records_select('task_adhoc',
                'id = :id AND classname = :clase AND ' . $DB->sql_compare_text('customdata') . ' = ' . $DB->sql_compare_text(':datos'),
                ['id' => $tareaid, 'clase' => '\\' . task\avisar_crm::class,
                    'datos' => json_encode(['mensajeid' => $mensajeid])]);
        } catch (\Throwable $e) {
            // La tarea sigue en la cola y lo manda con el cron.
            debugging('local_crm: aviso al momento sin hacer, va con el cron: ' . $e->getMessage(), DEBUG_DEVELOPER);
        }
    }
}
