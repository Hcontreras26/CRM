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
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_crm\burbuja;
use local_crm\chat_directo;
use local_crm\chat_grupo;

/**
 * La burbuja pregunta por los mensajes nuevos de su chat con las tutoras (1.11.0).
 *
 * Abierta, cada pocos segundos; cerrada, cada medio minuto y solo para el contador. La
 * primera lectura con la burbuja abierta (desde = 0) repasa quién está dentro, como hace
 * «Entrar al chat»; las demás solo leen, para que preguntar a menudo no cueste.
 */
class burbuja_leer extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'El curso'),
            'desde'    => new external_value(PARAM_INT, 'El último mensaje que ya tiene (0: los últimos)', VALUE_DEFAULT, 0),
            'abierto'  => new external_value(PARAM_BOOL, 'La burbuja está abierta: los marca como leídos', VALUE_DEFAULT, false),
        ]);
    }

    public static function execute(int $courseid, int $desde = 0, bool $abierto = false): array {
        global $USER;
        $p = self::validate_parameters(self::execute_parameters(),
            ['courseid' => $courseid, 'desde' => $desde, 'abierto' => $abierto]);
        $contexto = \context_course::instance($p['courseid']);
        self::validate_context($contexto);
        $yo = (int) $USER->id;
        $vacio = ['disponible' => false, 'conversacionid' => 0, 'sintutora' => false, 'mensajes' => [],
            'ultimo' => $p['desde'], 'noleidos' => 0];
        if (!burbuja::activa() || !burbuja::es_alumno($p['courseid'], $yo)) {
            return $vacio;
        }
        if ($p['abierto'] && $p['desde'] === 0) {
            // Al abrir: como «Entrar al chat», con los miembros al día, pero sin crearla
            // todavía (la crea el primer mensaje): una conversación vacía no la lee nadie.
            $conv = chat_grupo::conversacion($p['courseid'], $yo, false);
            $sintutora = $conv
                ? \core_message\api::count_conversation_members($conv) < 2
                : !chat_directo::tutoras($contexto);
        } else {
            $conv = burbuja::conversacion_existente($p['courseid'], $yo);
            $sintutora = false;
        }
        if (!$conv) {
            return ['disponible' => true, 'sintutora' => $sintutora] + $vacio;
        }
        if (!$p['abierto']) {
            // Cerrada: solo el contador. Los mensajes se leen (y se marcan leídos) al abrirla.
            return ['disponible' => true, 'conversacionid' => $conv, 'sintutora' => false, 'mensajes' => [],
                'ultimo' => $p['desde'], 'noleidos' => burbuja::no_leidos($conv, $yo)];
        }
        $mensajes = burbuja::mensajes($conv, $yo, $p['desde'], $contexto);
        if ($mensajes) {
            \core_message\api::mark_all_messages_as_read($yo, $conv);
        }
        $ultimo = $mensajes ? end($mensajes)['id'] : $p['desde'];
        return [
            'disponible'     => true,
            'conversacionid' => $conv,
            'sintutora'      => $sintutora,
            'mensajes'       => $mensajes,
            'ultimo'         => $ultimo,
            'noleidos'       => 0,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'disponible'     => new external_value(PARAM_BOOL, 'La burbuja se puede usar en este curso'),
            'conversacionid' => new external_value(PARAM_INT, 'La conversación (0 si aún no hay)'),
            'sintutora'      => new external_value(PARAM_BOOL, 'No hay ninguna tutora disponible ahora'),
            'mensajes'       => self::estructura_mensajes(),
            'ultimo'         => new external_value(PARAM_INT, 'El id del último mensaje'),
            'noleidos'       => new external_value(PARAM_INT, 'Mensajes de las tutoras sin leer'),
        ]);
    }

    /** La forma de los mensajes, compartida con burbuja_enviar. */
    public static function estructura_mensajes(): external_multiple_structure {
        return new external_multiple_structure(new external_single_structure([
            'id'    => new external_value(PARAM_INT, 'Id del mensaje'),
            'mio'   => new external_value(PARAM_BOOL, 'Lo escribió el alumno'),
            'de'    => new external_value(PARAM_TEXT, 'Quién lo escribió'),
            'html'  => new external_value(PARAM_RAW, 'El texto, en HTML ya limpio'),
            'fecha' => new external_value(PARAM_INT, 'Cuándo (unix)'),
        ]));
    }
}
