<?php
/**
 * file-store.php — FALLBACK STORAGE FOR THE TEST, AND NOTHING ELSE.
 *
 * THIS FILE IS NOT PRODUCTION CODE. It goes nowhere but the temporary folder
 * the runner builds, and it is used only when the machine playing the test has
 * no MySQL to hand. When MySQL is there, it is
 * server/webroot/internal/store.php — the real one — that gets copied, and
 * this file is not opened at all.
 *
 * WHY IT EXISTS. The shipped store requires pdo_mysql, and requiring a
 * database in order to run a test makes the test optional — therefore never
 * run. store.php's header explicitly plans for the replacement: "whoever wants
 * to plug the tool onto something else — a file, another engine, an API —
 * replaces THIS file and nothing else". That is what we do, holding the
 * contract it states, method for method.
 *
 * WHAT YOU NEED TO KNOW WHEN READING A TEST RESULT: with this store, the
 * PERSISTENCE layer is not the one that runs in production. All the rest of
 * the server is — api.php, input.php, origins.php, rate-limit.php,
 * text-export.php, config.php are the shipped files, copied as they are. The
 * test says so in as many words in its report, and it has to be believed: a
 * test that keeps quiet about what it did not exercise lies better than it
 * checks.
 *
 * IT DOES NOT TRY TO BE FAST OR CONCURRENT. The whole file is reread and
 * rewritten at every write, under an exclusive lock. That is the behaviour
 * that is easiest to reread, and simplicity is the only quality that counts
 * here: a subtle test storage starts having defects of its own, and you spend
 * the day looking in the protocol for a defect that is in the sandbox.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

class ApStore
{
    /** @var array effective configuration */
    private $config;

    /** @var string path of the storage file */
    private $file;

    /** @var string storage label, the equivalent of a table name */
    private $table;

    /** @var string label of the rate counter */
    private $rateTable;

    public function __construct(array $config)
    {
        $this->config = $config;

        // The same check as the shipped store: the prefix comes from a
        // configuration file written by hand, and this is where we know where
        // it ends up.
        $prefix = isset($config['table_prefix']) ? (string) $config['table_prefix'] : '';
        if (!preg_match('/^[A-Za-z0-9_]*$/', $prefix)) {
            throw new ApFailure(
                "Invalid configuration: table_prefix can only contain letters, digits "
                . "and underscores.",
                500);
        }
        $this->table     = $prefix . 'notes';
        $this->rateTable = $prefix . 'rate';

        $db = isset($config['database']) && is_array($config['database']) ? $config['database'] : array();
        $path = isset($db['file']) ? (string) $db['file'] : '';
        if ($path === '') {
            throw new ApFailure(
                "The test store expects database.file: the absolute path of the "
                . "storage file.", 500);
        }
        $this->file = $path;
    }

    /** No PHP extension beyond the core: that is the whole point. */
    public static function requiredExtensions()
    {
        return array();
    }

    public function table()
    {
        return $this->table;
    }

    /* -- The file ---------------------------------------------------------
       One single structure: the id counter, the notes, the rate counters. The
       counter is GLOBAL to the server, as the shipped table's AUTO_INCREMENT
       is — the leak described by FORMAT.md section 2.4 is therefore
       reproduced, and not fixed along the way. A sandbox more virtuous than
       production tests something other than production. */

    private function load()
    {
        if (!is_file($this->file)) {
            return array('next' => 1, 'notes' => array(), 'rate' => array());
        }
        $raw = file_get_contents($this->file);
        $read = $raw === false || $raw === '' ? null : json_decode($raw, true);
        if (!is_array($read) || !isset($read['notes'])) {
            return array('next' => 1, 'notes' => array(), 'rate' => array());
        }
        return $read;
    }

    /**
     * Write through a temporary file then rename: a concurrent read sees the
     * old content or the new one, never half of either.
     */
    private function save(array $data)
    {
        $temporary = $this->file . '.' . getmypid() . '.tmp';
        $written = file_put_contents($temporary,
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        if ($written === false || !rename($temporary, $this->file)) {
            throw new ApFailure(
                "The test storage file could not be written: " . $this->file, 503);
        }
    }

    /**
     * Reads, lets you modify, rewrites — all under an exclusive lock.
     *
     * The lock is on a neighbouring file and not on the data file: that one is
     * replaced by rename() at every write, and a lock held on an inode that
     * has just been replaced protects nothing any more.
     */
    private function transaction(callable $work)
    {
        $lock = fopen($this->file . '.lock', 'c');
        if ($lock === false) {
            throw new ApFailure("Storage lock impossible to open.", 503);
        }
        flock($lock, LOCK_EX);
        try {
            $data = $this->load();
            $result = $work($data);
            $this->save($data);
            return $result;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /* -- Schema -----------------------------------------------------------
       There is no schema to guarantee: a note is an object, its keys are the
       ones add() writes. The method exists because the contract demands it and
       because api.php calls it indirectly everywhere. */

    public function ensureSchema()
    {
        if (!is_file($this->file)) {
            $this->transaction(function (&$data) { return null; });
        }
    }

    public function attachOrphans()
    {
        // Nothing to attach: this store never carried a 1.2.0 database. We
        // return 0 rather than throw — the backfill action has to be able to
        // answer.
        return 0;
    }

    /* -- Rate ------------------------------------------------------------- */

    public function consumeRate($key, $window)
    {
        return $this->transaction(function (&$data) use ($key, $window) {
            $index = (string) $key . '/' . (int) $window;
            if (!isset($data['rate'][$index])) {
                $data['rate'][$index] = 0;
            }
            $data['rate'][$index] += 1;
            return (int) $data['rate'][$index];
        });
    }

    /* -- Reading ---------------------------------------------------------- */

    public function note($id, $project)
    {
        $data = $this->load();
        foreach ($data['notes'] as $row) {
            if ((int) $row['id'] === (int) $id && (string) $row['project'] === (string) $project) {
                return $this->normalise($row);
            }
        }
        return null;
    }

    public function byPage($project, $index)
    {
        $data = $this->load();
        $kept = array();
        foreach ($data['notes'] as $row) {
            if ((string) $row['project'] === (string) $project
                && (string) $row['page_index'] === (string) $index) {
                $kept[] = $row;
            }
        }
        usort($kept, function ($a, $b) { return (int) $a['id'] - (int) $b['id']; });

        $parents = array();
        $replies = array();
        foreach ($kept as $row) {
            $note = $this->normalise($row);
            if ($note['reply_to'] === null) {
                $note['replies'] = array();
                $parents[$note['id']] = $note;
            } else {
                $replies[] = $note;
            }
        }
        foreach ($replies as $reply) {
            if (isset($parents[$reply['reply_to']])) {
                $parents[$reply['reply_to']]['replies'][] = $reply;
            }
        }
        return array_values($parents);
    }

    /**
     * Every note of a project, in the exact order of the export.
     *
     * The order reproduces the shipped store's ORDER BY:
     *   page, then page_index, then the thread COALESCE(reply_to, id), then
     *   the parent before its replies, then the order of creation.
     * It matters: the text export is a contract, and its order is part of it.
     */
    public function all($project)
    {
        $data = $this->load();
        $kept = array();
        foreach ($data['notes'] as $row) {
            if ((string) $row['project'] === (string) $project) {
                $kept[] = $row;
            }
        }
        usort($kept, function ($a, $b) {
            $c = strcmp((string) $a['page'], (string) $b['page']);
            if ($c !== 0) return $c;
            $c = strcmp((string) $a['page_index'], (string) $b['page_index']);
            if ($c !== 0) return $c;
            $threadA = $a['reply_to'] === null ? (int) $a['id'] : (int) $a['reply_to'];
            $threadB = $b['reply_to'] === null ? (int) $b['id'] : (int) $b['reply_to'];
            if ($threadA !== $threadB) return $threadA - $threadB;
            $isReplyA = $a['reply_to'] === null ? 0 : 1;
            $isReplyB = $b['reply_to'] === null ? 0 : 1;
            if ($isReplyA !== $isReplyB) return $isReplyA - $isReplyB;
            return (int) $a['id'] - (int) $b['id'];
        });

        // A generator, like the shipped store: text-export.php writes as it
        // goes and must not depend on a complete array.
        $normalise = array($this, 'normalise');
        return (function () use ($kept, $normalise) {
            foreach ($kept as $row) {
                yield call_user_func($normalise, $row);
            }
        })();
    }

    public function count($project)
    {
        $n = 0;
        foreach ($this->load()['notes'] as $row) {
            if ((string) $row['project'] === (string) $project) $n++;
        }
        return $n;
    }

    public function modeBreakdown($project)
    {
        $out = array('plain' => 0, 'encrypted' => 0);
        foreach ($this->load()['notes'] as $row) {
            if ((string) $row['project'] !== (string) $project) continue;
            $key = ((string) $row['mode'] === 'encrypted') ? 'encrypted' : 'plain';
            $out[$key] += 1;
        }
        return $out;
    }

    public function pagesWithoutIndex($project)
    {
        $pages = array();
        foreach ($this->load()['notes'] as $row) {
            if ((string) $row['project'] === (string) $project
                && (string) $row['page_index'] === ''
                && (string) $row['page'] !== '') {
                $pages[(string) $row['page']] = true;
            }
        }
        $list = array_keys($pages);
        sort($list);
        return $list;
    }

    public function assignIndex($project, $page, $index)
    {
        return $this->transaction(function (&$data) use ($project, $page, $index) {
            $touched = 0;
            foreach ($data['notes'] as $position => $row) {
                if ((string) $row['project'] === (string) $project
                    && (string) $row['page'] === (string) $page
                    && (string) $row['page_index'] === '') {
                    $data['notes'][$position]['page_index'] = (string) $index;
                    $data['notes'][$position]['format'] = AP_FORMAT;
                    $touched++;
                }
            }
            return $touched;
        });
    }

    /* -- Writing ---------------------------------------------------------- */

    public function add(array $note)
    {
        $id = $this->transaction(function (&$data) use ($note) {
            $id = (int) $data['next'];
            $data['next'] = $id + 1;
            $data['notes'][] = array(
                'id'                 => $id,
                'project'            => (string) $note['project'],
                'page_index'         => (string) $note['page_index'],
                'format'             => (int) $note['format'],
                'mode'               => (string) $note['mode'],
                'page'               => (string) $note['page'],
                'selector'           => (string) $note['selector'],
                'fingerprint'        => (string) $note['fingerprint'],
                'excerpt'            => (string) $note['excerpt'],
                'author'             => (string) $note['author'],
                'text'               => (string) $note['text'],
                'version'            => (string) $note['version'],
                'environment'        => (string) $note['environment'],
                'viewport'           => (string) $note['viewport'],
                'payload'            => (string) $note['payload'],
                'resolution_payload' => '',
                // UTC, written by PHP and never by the storage engine: that is
                // the rule of FORMAT.md section 2.1, and it holds here too.
                'created_at'         => gmdate('Y-m-d H:i:s'),
                'resolved_at'        => null,
                'resolved_by'        => '',
                'resolved_version'   => '',
                'reply_to'           => $note['reply_to'] === null ? null : (int) $note['reply_to'],
            );
            return $id;
        });
        return $this->note($id, $note['project']);
    }

    public function resolve($id, $project, $by, $version, $resolutionPayload, $resolved = true)
    {
        $this->transaction(function (&$data) use ($id, $project, $by, $version, $resolutionPayload, $resolved) {
            foreach ($data['notes'] as $position => $row) {
                if ((int) $row['id'] !== (int) $id
                    || (string) $row['project'] !== (string) $project) {
                    continue;
                }
                if (!$resolved) {
                    // Reopening clears both forms at once: it is the same
                    // information under two modes, and a mixed database must
                    // not keep half of a cancelled resolution.
                    $data['notes'][$position]['resolved_at'] = null;
                    $data['notes'][$position]['resolved_by'] = '';
                    $data['notes'][$position]['resolved_version'] = '';
                    $data['notes'][$position]['resolution_payload'] = '';
                } else {
                    $data['notes'][$position]['resolved_at'] = gmdate('Y-m-d H:i:s');
                    $data['notes'][$position]['resolved_by'] = (string) $by;
                    $data['notes'][$position]['resolved_version'] = (string) $version;
                    $data['notes'][$position]['resolution_payload'] = (string) $resolutionPayload;
                }
                return null;
            }
            return null;
        });
        return $this->note($id, $project);
    }

    /* -- Diagnostic ------------------------------------------------------- */

    public function state()
    {
        $state = array(
            'connection' => is_dir(dirname($this->file)),
            'file'       => $this->file,
            'present'    => is_file($this->file),
            'notes'      => null,
            'message'    => null,
        );
        if ($state['present']) {
            $state['notes'] = count($this->load()['notes']);
        }
        return $state;
    }

    public function diagnosticLines()
    {
        $state = $this->state();
        $lines = array();
        $lines[] = array('storage.type', 'file (test store, NOT production)');
        $lines[] = array('storage.file', $state['file']);
        $lines[] = array('storage.table', $this->table);
        $lines[] = array('storage.rate_table', $this->rateTable);
        $lines[] = array('', '');
        $lines[] = array('storage.connection', $state['connection'] ? 'SUCCEEDED' : 'FAILED');
        $lines[] = array('storage.table_present', $state['present'] ? 'yes' : 'NO');
        if ($state['notes'] !== null) {
            $lines[] = array('storage.notes', $state['notes']);
        }
        $lines[] = array('', '');
        $lines[] = array('verdict', $state['connection']
            ? 'operational (test file storage).'
            : 'the storage folder is UNREACHABLE.');
        return $lines;
    }

    /**
     * The single shape of a note — COPIED from the shipped store, key for key.
     *
     * It is this file's one accepted duplication, and it is deliberate: this
     * shape is the contract between the store and all the rest of the server.
     * If it diverged, the test would be checking a server that does not exist.
     */
    private function normalise(array $row)
    {
        return array(
            'id'         => (int) $row['id'],
            'project'    => isset($row['project']) ? (string) $row['project'] : '',
            'page_index' => isset($row['page_index']) ? (string) $row['page_index'] : '',
            'format'     => isset($row['format']) && (int) $row['format'] > 0
                            ? (int) $row['format'] : 1,
            'mode'       => isset($row['mode']) && (string) $row['mode'] !== ''
                            ? (string) $row['mode'] : 'plain',
            'page'        => (string) $row['page'],
            'selector'    => (string) $row['selector'],
            'fingerprint' => (string) $row['fingerprint'],
            'excerpt'     => (string) $row['excerpt'],
            'author'      => (string) $row['author'],
            'text'        => (string) $row['text'],
            'created_at'  => ap_iso_date($row['created_at']),
            'version'     => isset($row['version']) ? (string) $row['version'] : '',
            'environment' => isset($row['environment']) ? (string) $row['environment'] : '',
            'viewport'    => isset($row['viewport']) ? (string) $row['viewport'] : '',
            'payload'            => isset($row['payload']) && $row['payload'] !== null
                                    ? (string) $row['payload'] : '',
            'resolution_payload' => isset($row['resolution_payload']) && $row['resolution_payload'] !== null
                                    ? (string) $row['resolution_payload'] : '',
            'resolved_at'      => isset($row['resolved_at']) && $row['resolved_at'] !== null
                                  ? ap_iso_date($row['resolved_at']) : null,
            'resolved_by'      => isset($row['resolved_by']) ? (string) $row['resolved_by'] : '',
            'resolved_version' => isset($row['resolved_version']) ? (string) $row['resolved_version'] : '',
            'reply_to' => $row['reply_to'] === null ? null : (int) $row['reply_to'],
        );
    }
}

/**
 * UTC DATETIME -> ISO 8601 with an explicit offset.
 * Same function, same name as in the shipped store: it is defined by the
 * store, so replacing that store carries the duty of providing it.
 */
function ap_iso_date($utcDatetime)
{
    try {
        $d = new DateTime((string) $utcDatetime, new DateTimeZone('UTC'));
        return $d->format('c');
    } catch (Exception $e) {
        return (string) $utcDatetime;
    }
}
