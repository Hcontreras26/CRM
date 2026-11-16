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

namespace local_crm\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use local_crm\burbuja;
use local_crm\chat_grupo;

/**
 * El alumno escribe desde la burbuja (1.11.0).
 *
 * Es un mensaje normal de la mensajería de Moodle en su chat de grupo con las tutoras: lo
 * envía Moodle como si lo escribiera en «Mensajes», así que salta el mismo evento y el
 * observador lo manda al CRM, igual que siempre.
 */
class burbuja_enviar extends external_api {
    /** Lo más largo que se acepta (como un mensaje largo de la mensajería). */
    const MAXIMO = 4000;

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'El curso'),
            'texto'    => new external_value(PARAM_RAW, 'Lo que escribe el alumno, en texto'),
            'desde'    => new external_value(PARAM_INT, 'El último mensaje que ya tiene', VALUE_DEFAULT, 0),
        ]);
    }

    public static function execute(int $courseid, string $texto, int $desde = 0): array {
        global $USER;
        $p = self::validate_parameters(self::execute_parameters(),
            ['courseid' => $courseid, 'texto' => $texto, 'desde' => $desde]);
        $contexto = \context_course::instance($p['courseid']);
        self::validate_context($contexto);
        $yo = (int) $USER->id;
        if (!burbuja::activa() || !burbuja::es_alumno($p['courseid'], $yo)) {
            throw new \moodle_exception('burbuja_no', 'local_crm');
        }
        $texto = trim(clean_param($p['texto'], PARAM_NOTAGS));
        if ($texto === '') {
            throw new \moodle_exception('burbuja_vacio', 'local_crm');
        }
        $texto = \core_text::substr($texto, 0, self::MAXIMO);
        // La crea si no existe (solo si hay alguna tutora disponible) y repasa quién está.
        $conv = chat_grupo::conversacion($p['courseid'], $yo, true);
        if (!$conv) {
            throw new \moodle_exception('chat_sin_tutora', 'local_crm');
        }
        if (!\core_message\api::can_send_message_to_conversation($yo, $conv)) {
            throw new \moodle_exception('burbuja_no', 'local_crm');
        }
        // Como la mensajería de Moodle: texto sin etiquetas (ya quitadas) y los saltos de línea,
        // que FORMAT_MOODLE convierte en <br>.
        \core_message\api::send_message_to_conversation($yo, $conv, $texto, FORMAT_MOODLE);
        $mensajes = burbuja::mensajes($conv, $yo, $p['desde'], $contexto);
        \core_message\api::mark_all_messages_as_read($yo, $conv);
        return [
            'conversacionid' => $conv,
            'mensajes'       => $mensajes,
            'ultimo'         => $mensajes ? end($mensajes)['id'] : $p['desde'],
            'sintutora'      => \core_message\api::count_conversation_members($conv) < 2,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'conversacionid' => new external_value(PARAM_INT, 'La conversación'),
            'mensajes'       => burbuja_leer::estructura_mensajes(),
            'ultimo'         => new external_value(PARAM_INT, 'El id del último mensaje'),
            'sintutora'      => new external_value(PARAM_BOOL, 'No hay ninguna tutora dentro ahora'),
        ]);
    }
}
