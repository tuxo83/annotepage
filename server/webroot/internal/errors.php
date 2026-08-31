<?php
/**
 * errors.php -- A BLANK SCREEN IS NEVER AN ANSWER.
 *
 * A non-technical team annotating a site has no way to tell "the server
 * returned nothing" from "my notes are saved". Every failure must therefore
 * COME OUT, in readable text, with a correct HTTP code.
 *
 * Three nets, because none of them covers the three cases on its own:
 *   - set_exception_handler()      : uncaught exceptions;
 *   - set_error_handler()          : non-fatal errors (logged);
 *   - register_shutdown_function() : FATAL errors and compile errors in an
 *     included file, which the first two never see.
 *
 * Absolute rule of this file: no message sent to the network ever copies a
 * credential, a password or a connection string. Storage driver messages are
 * truncated BEFORE logging: they commonly carry the host, the storage name and
 * the user, and a log is reread more often than one thinks.
 *
 * ADDED BY THIS PORT: an error response may travel to ANOTHER origin (relay
 * mode). The sharing headers are therefore set here too, through a callback
 * point that the origin lock fills in -- without it the browser would hide the
 * message from the client and the team would see a silent failure, which is
 * exactly what this file exists to prevent.
 *
 * This file names no particular site.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

/** Maximum length of a driver message copied into a log. */
if (!defined('AP_LOG_TRUNCATION')) {
    define('AP_LOG_TRUNCATION', 120);
}

/**
 * A failure fit to announce: carries the HTTP code to return and a message
 * already written for a human reader. Everything thrown with this class is
 * meant to be DISPLAYED; everything else is a programming defect and comes out
 * as a 500 with a generic message.
 */
class ApFailure extends Exception
{
    private $status;

    public function __construct($message, $status = 500, $previous = null)
    {
        parent::__construct($message, 0, $previous);
        $this->status = (int) $status;
    }

    public function status()
    {
        return $this->status;
    }
}

/**
 * Headers to set again on EVERY response, errors included.
 *
 * The origin lock (origins.php) drops the sharing line it computed here. This
 * file does not know what an origin is; it only knows that an error must reach
 * the reviewer's screen, even when it crosses an origin boundary.
 *
 * @param string|null $headers complete lines, or null to read only
 * @return array
 */
function ap_cors_headers($headers = null)
{
    static $memory = array();
    if ($headers !== null) {
        $memory = $headers;
    }
    return $memory;
}

/**
 * Truncates a technical message before handing it to the log.
 * A driver message can contain a host, a database name, a user.
 */
function ap_truncate($message)
{
    $message = (string) $message;
    $message = str_replace(array("\r", "\n"), ' ', $message);
    if (strlen($message) > AP_LOG_TRUNCATION) {
        $message = substr($message, 0, AP_LOG_TRUNCATION) . '...';
    }
    return $message;
}

/** Logs through PHP's own mechanism, already configured by the host. */
function ap_log($message)
{
    error_log('[annotepage] ' . ap_truncate($message));
}

/**
 * Returns an error response and stops.
 *
 * Two situations, handled differently:
 *  - nothing has gone out yet: we drop what is buffered, set the HTTP code and
 *    the type, and write the message alone;
 *  - the response has already started (streamed export): the HTTP code can no
 *    longer be changed, so we append an error line to the stream, which beats
 *    a silent truncation taken for a normal ending.
 */
function ap_respond_error($status, $message)
{
    if (!headers_sent()) {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        http_response_code((int) $status);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow');
        header('X-Content-Type-Options: nosniff');
        foreach (ap_cors_headers() as $line) {
            header($line);
        }
        echo $message . "\n";
    } else {
        echo "\nERROR " . (int) $status . ' : ' . $message . "\n";
        echo "This export is INCOMPLETE.\n";
    }
    exit;
}

/**
 * Installs the three nets. Called once, at the very start of the entry point,
 * BEFORE including anything else: a compile error in an included file would
 * not be caught otherwise.
 */
function ap_install_handlers()
{
    // The detail goes to the log, never to the screen: it can contain
    // fragments of configuration.
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    error_reporting(E_ALL);

    set_exception_handler('ap_handle_exception');
    set_error_handler('ap_handle_error');
    register_shutdown_function('ap_handle_shutdown');
}

function ap_handle_exception($e)
{
    if ($e instanceof ApFailure) {
        ap_log($e->getMessage());
        ap_respond_error($e->status(), $e->getMessage());
        return;
    }

    // Programming defect: the detail to the log, one sentence to the screen.
    ap_log(get_class($e) . ' : ' . $e->getMessage()
        . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')');
    ap_respond_error(500,
        "Internal failure of the notes tool. Your notes may not have been saved.\n"
        . "The detail is in the server's PHP error log.");
}

/**
 * Non-fatal errors: logged, never displayed, and execution continues. Making a
 * mere warning fatal would turn an annoyance into an outage -- and the tool
 * writes nothing to disk, where a warning would be serious.
 */
function ap_handle_error($level, $message, $file = '', $line = 0)
{
    if ((error_reporting() & $level) === 0) {
        return true;
    }
    ap_log('PHP error (' . $level . ') ' . $message
        . ' (' . basename((string) $file) . ':' . (int) $line . ')');

    // Only fatal-level errors interrupt the response.
    $fatal = E_USER_ERROR | E_RECOVERABLE_ERROR;
    if (($level & $fatal) !== 0) {
        ap_respond_error(500,
            "Internal failure of the notes tool. Your notes may not have been saved.");
    }
    return true;
}

/**
 * Last net: fatal error, memory exhausted, time limit passed, or compile error
 * in an included file. It is the only one that covers the case where PHP stops
 * without having written anything -- that is, the blank screen.
 */
function ap_handle_shutdown()
{
    $last = error_get_last();
    if ($last === null) {
        return;
    }
    $fatal = array(E_ERROR, E_PARSE, E_CORE_ERROR, E_CORE_WARNING,
                   E_COMPILE_ERROR, E_COMPILE_WARNING, E_USER_ERROR);
    if (!in_array($last['type'], $fatal, true)) {
        return;
    }
    ap_log('fatal shutdown : ' . $last['message']
        . ' (' . basename($last['file']) . ':' . $last['line'] . ')');
    ap_respond_error(500,
        "Internal failure of the notes tool (the script stopped early).\n"
        . "Your notes may not have been saved.\n"
        . "The detail is in the server's PHP error log.");
}
