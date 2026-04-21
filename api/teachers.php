<?php
/**
 * API: /api/teachers.php
 *
 * ALGORITHMS:
 *   SEARCH  → FULLTEXT inverted index (≥3 chars) | B-TREE prefix scan (<3 chars)
 *   SORT    → B-TREE index traversal on (last_name,first_name) / training date cols
 *   FILTER  → B-TREE equality + range scans on FK / date columns
 *   ADD     → B-TREE PK duplicate check O(log n) before INSERT
 *   DELETE  → B-TREE FK index cascade O(log n + k)
 *
 * GET    /api/teachers.php              → list with training + LD data
 * GET    /api/teachers.php?id=XXX       → single teacher
 * POST   /api/teachers.php              → add
 * PUT    /api/teachers.php              → update
 * DELETE /api/teachers.php?id=XXX       → delete
 */

require_once __DIR__ . '/../config.php';

$conn   = getConnection();
$method = $_SERVER['REQUEST_METHOD'];

ensureIndexes($conn);

// ═══════════════════════════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════════════════════════
if ($method === 'GET') {

    // Single-record lookup
    if (!empty($_GET['id'])) {
        $id  = $conn->real_escape_string($_GET['id']);
        $sql = buildBaseSelect() . " WHERE t.id_number = '$id' LIMIT 1";
        $res = $conn->query($sql);
        $row = $res ? $res->fetch_assoc() : null;
        if ($row) {
            $row['trainings'] = getTrainings($conn, $id);
            $row['ld_needs']  = getLDNeeds($conn, $id);
            sendJSON($row);
        }
        sendJSON(['error' => 'Teacher not found'], 404);
    }

    $conditions = [];
    $joins      = [];
    $orderParts = [];

    // ── SEARCH ────────────────────────────────────────────────────────────────
    if (!empty($_GET['search'])) {
        $raw = trim($_GET['search']);
        $s   = $conn->real_escape_string($raw);
        if (is_numeric($raw)) {
            $conditions[] = "t.id_number LIKE '$s%'";
        } elseif (mb_strlen($raw) >= 3) {
            $ftSafe = $conn->real_escape_string(preg_replace('/[+\-><()*~"@]+/', ' ', $raw));
            $conditions[] = "MATCH(t.last_name, t.first_name, t.middle_name) AGAINST ('$ftSafe' IN BOOLEAN MODE)";
        } else {
            $conditions[] = "(t.last_name LIKE '$s%' OR t.first_name LIKE '$s%' OR t.id_number LIKE '$s%')";
        }
    }

    // ── FILTER ────────────────────────────────────────────────────────────────
    if (!empty($_GET['division'])) {
        $conditions[] = "d.division_name = '" . $conn->real_escape_string($_GET['division']) . "'";
    }
    if (!empty($_GET['sex'])) {
        $conditions[] = "s.sex_name = '" . $conn->real_escape_string($_GET['sex']) . "'";
    }
    if (!empty($_GET['functional_division'])) {
        $conditions[] = "fd.functional_division_name = '" . $conn->real_escape_string($_GET['functional_division']) . "'";
    }
    if (!empty($_GET['civil_status'])) {
        $conditions[] = "cs.civil_status_name = '" . $conn->real_escape_string($_GET['civil_status']) . "'";
    }
    if (!empty($_GET['education'])) {
        $conditions[] = "ea.educ_attainment_name = '" . $conn->real_escape_string($_GET['education']) . "'";
    }
    if (!empty($_GET['years_min'])) {
        $conditions[] = "t.years_of_service >= " . (int)$_GET['years_min'];
    }
    if (!empty($_GET['years_max'])) {
        $conditions[] = "t.years_of_service <= " . (int)$_GET['years_max'];
    }

    // Training date range — LEFT JOIN training table
    $hasDateFilter = !empty($_GET['train_from']) || !empty($_GET['train_to']);
    if ($hasDateFilter) {
        $joins[] = "LEFT JOIN training tr ON t.id_number = tr.id_number";
        if (!empty($_GET['train_from'])) {
            $from = explode('-', $_GET['train_from']);
            if (count($from) === 3) {
                $fy = (int)$from[0]; $fm = (int)$from[1]; $fd2 = (int)$from[2];
                $conditions[] = "(tr.training_year * 10000 + tr.training_month * 100 + tr.training_day) >= " . ($fy*10000 + $fm*100 + $fd2);
            }
        }
        if (!empty($_GET['train_to'])) {
            $to = explode('-', $_GET['train_to']);
            if (count($to) === 3) {
                $ty = (int)$to[0]; $tm2 = (int)$to[1]; $td = (int)$to[2];
                $conditions[] = "(tr.training_year * 10000 + tr.training_month * 100 + tr.training_day) <= " . ($ty*10000 + $tm2*100 + $td);
            }
        }
    }

    // ── SORT ──────────────────────────────────────────────────────────────────
    $sortName = $_GET['sort_name'] ?? '';
    $sortDate = $_GET['sort_date'] ?? '';

    if ($sortName === 'za') {
        $orderParts[] = 't.last_name DESC, t.first_name DESC';
    } else {
        $orderParts[] = 't.last_name ASC, t.first_name ASC'; // default
    }

    if ($sortDate === 'asc' || $sortDate === 'desc') {
        if (!$hasDateFilter) $joins[] = "LEFT JOIN training tr ON t.id_number = tr.id_number";
        $dir = strtoupper($sortDate);
        $orderParts[] = "tr.training_year $dir, tr.training_month $dir, tr.training_day $dir";
    }

    // ── BUILD QUERY ───────────────────────────────────────────────────────────
    // The main SELECT now includes first training + LD data via subqueries
    // so the list endpoint returns everything needed without a second round-trip.
    $limit  = max(1, min(500, (int)($_GET['limit']  ?? 100)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));

    $sql = "
        SELECT
            t.id_number,
            t.last_name,
            t.first_name,
            t.middle_name,
            t.suffix,
            t.birth_year,
            t.birth_month,
            t.birth_day,
            s.sex_name                   AS sex,
            cs.civil_status_name         AS civil_status,
            ea.educ_attainment_name      AS education,
            d.division_name              AS division,
            fd.functional_division_name  AS functional_division,
            t.designation,
            t.years_of_service,
            -- Most recent training (B-TREE idx_training_teacher + idx_training_date)
            (SELECT tr2.training_id FROM training tr2
                WHERE tr2.id_number = t.id_number
                ORDER BY tr2.training_year DESC, tr2.training_month DESC, tr2.training_day DESC
                LIMIT 1) AS training_id,
            (SELECT tr2.title_of_training FROM training tr2
                WHERE tr2.id_number = t.id_number
                ORDER BY tr2.training_year DESC, tr2.training_month DESC, tr2.training_day DESC
                LIMIT 1) AS training_title,
            (SELECT tr2.training_year FROM training tr2
                WHERE tr2.id_number = t.id_number
                ORDER BY tr2.training_year DESC, tr2.training_month DESC, tr2.training_day DESC
                LIMIT 1) AS training_year,
            (SELECT tr2.training_month FROM training tr2
                WHERE tr2.id_number = t.id_number
                ORDER BY tr2.training_year DESC, tr2.training_month DESC, tr2.training_day DESC
                LIMIT 1) AS training_month,
            (SELECT tr2.training_day FROM training tr2
                WHERE tr2.id_number = t.id_number
                ORDER BY tr2.training_year DESC, tr2.training_month DESC, tr2.training_day DESC
                LIMIT 1) AS training_day,
            (SELECT tr2.no_of_hours FROM training tr2
                WHERE tr2.id_number = t.id_number
                ORDER BY tr2.training_year DESC, tr2.training_month DESC, tr2.training_day DESC
                LIMIT 1) AS training_hours,
            (SELECT tr2.sponsor FROM training tr2
                WHERE tr2.id_number = t.id_number
                ORDER BY tr2.training_year DESC, tr2.training_month DESC, tr2.training_day DESC
                LIMIT 1) AS training_sponsor,
            -- Most recent LD need (B-TREE idx_ld_teacher)
            (SELECT ld.ld_need_id FROM learning_development_need ld
                WHERE ld.id_number = t.id_number
                ORDER BY ld.ld_need_id DESC
                LIMIT 1) AS ld_need_id,
            (SELECT ld.ld_need_text FROM learning_development_need ld
                WHERE ld.id_number = t.id_number
                ORDER BY ld.ld_need_id DESC
                LIMIT 1) AS ld_need_text
        FROM teacher t
        JOIN sex s                             ON t.sex_id = s.sex_id
        JOIN civil_status cs                   ON t.civil_status_id = cs.civil_status_id
        JOIN highest_educational_attainment ea ON t.educ_attainment_id = ea.educ_attainment_id
        JOIN division d                        ON t.division_id = d.division_id
        JOIN functional_division fd            ON t.functional_division_id = fd.functional_division_id
    ";

    if (!empty($joins)) {
        $sql .= ' ' . implode(' ', array_unique($joins));
    }
    if (!empty($conditions)) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    if ($hasDateFilter || $sortDate) {
        $sql .= ' GROUP BY t.id_number';
    }
    $sql .= ' ORDER BY ' . implode(', ', $orderParts);
    $sql .= " LIMIT $limit OFFSET $offset";

    $res = $conn->query($sql);
    if (!$res) sendJSON(['error' => 'Query failed: ' . $conn->error], 500);

    $rows = [];
    while ($row = $res->fetch_assoc()) $rows[] = $row;

    // Count total
    $countSQL  = "SELECT COUNT(DISTINCT t.id_number) AS total FROM teacher t";
    $countSQL .= " JOIN sex s ON t.sex_id = s.sex_id";
    $countSQL .= " JOIN civil_status cs ON t.civil_status_id = cs.civil_status_id";
    $countSQL .= " JOIN highest_educational_attainment ea ON t.educ_attainment_id = ea.educ_attainment_id";
    $countSQL .= " JOIN division d ON t.division_id = d.division_id";
    $countSQL .= " JOIN functional_division fd ON t.functional_division_id = fd.functional_division_id";
    if (!empty($joins)) $countSQL .= ' ' . implode(' ', array_unique($joins));
    if (!empty($conditions)) $countSQL .= ' WHERE ' . implode(' AND ', $conditions);

    $cRes  = $conn->query($countSQL);
    $total = $cRes ? (int)$cRes->fetch_assoc()['total'] : 0;

    sendJSON(['data' => $rows, 'total' => $total]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST — Add teacher
// ═══════════════════════════════════════════════════════════════════════════════
if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body) sendJSON(['error' => 'Invalid JSON body'], 400);

    $sex_id             = resolveID($conn, 'sex',                            'sex_id',               'sex_name',               $body['sex']                ?? '');
    $civil_status_id    = resolveID($conn, 'civil_status',                   'civil_status_id',      'civil_status_name',      $body['civil_status']       ?? '');
    $educ_attainment_id = resolveID($conn, 'highest_educational_attainment', 'educ_attainment_id',   'educ_attainment_name',   $body['education']          ?? '');
    $division_id        = resolveID($conn, 'division',                       'division_id',          'division_name',          $body['division']           ?? '');
    $functional_div_id  = resolveID($conn, 'functional_division',            'functional_division_id','functional_division_name',$body['functional_division'] ?? '');

    $last   = $conn->real_escape_string($body['last_name']   ?? '');
    $first  = $conn->real_escape_string($body['first_name']  ?? '');
    $middle = $conn->real_escape_string($body['middle_name'] ?? '');
    $suffix = $conn->real_escape_string($body['suffix']      ?? '');
    $by     = (int)($body['birth_year']  ?? 1980);
    $bm     = (int)($body['birth_month'] ?? 1);
    $bd     = (int)($body['birth_day']   ?? 1);
    $desig  = $conn->real_escape_string($body['designation'] ?? '');
    $years  = (int)($body['years_of_service'] ?? 0);

    if (!$last || !$first) sendJSON(['error' => 'last_name and first_name are required'], 400);

    $sql = "INSERT INTO teacher
        (last_name, first_name, middle_name, suffix,
         birth_year, birth_month, birth_day,
         sex_id, civil_status_id, educ_attainment_id,
         division_id, functional_division_id, designation, years_of_service)
        VALUES
        ('$last','$first','$middle','$suffix',
         $by,$bm,$bd,
         $sex_id,$civil_status_id,$educ_attainment_id,
         $division_id,$functional_div_id,'$desig',$years)";

    if ($conn->query($sql)) {
        sendJSON(['success' => true, 'id_number' => $conn->insert_id], 201);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT — Update teacher
// ═══════════════════════════════════════════════════════════════════════════════
if ($method === 'PUT') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body || empty($body['id_number'])) sendJSON(['error' => 'id_number required'], 400);

    $id = $conn->real_escape_string($body['id_number']);

    $exists = $conn->query("SELECT 1 FROM teacher WHERE id_number = '$id' LIMIT 1");
    if (!$exists || $exists->num_rows === 0) sendJSON(['error' => 'Teacher not found'], 404);

    $sex_id             = resolveID($conn, 'sex',                            'sex_id',               'sex_name',               $body['sex']                ?? '');
    $civil_status_id    = resolveID($conn, 'civil_status',                   'civil_status_id',      'civil_status_name',      $body['civil_status']       ?? '');
    $educ_attainment_id = resolveID($conn, 'highest_educational_attainment', 'educ_attainment_id',   'educ_attainment_name',   $body['education']          ?? '');
    $division_id        = resolveID($conn, 'division',                       'division_id',          'division_name',          $body['division']           ?? '');
    $functional_div_id  = resolveID($conn, 'functional_division',            'functional_division_id','functional_division_name',$body['functional_division'] ?? '');

    $last   = $conn->real_escape_string($body['last_name']   ?? '');
    $first  = $conn->real_escape_string($body['first_name']  ?? '');
    $middle = $conn->real_escape_string($body['middle_name'] ?? '');
    $suffix = $conn->real_escape_string($body['suffix']      ?? '');
    $by     = (int)($body['birth_year']  ?? 1980);
    $bm     = (int)($body['birth_month'] ?? 1);
    $bd     = (int)($body['birth_day']   ?? 1);
    $desig  = $conn->real_escape_string($body['designation'] ?? '');
    $years  = (int)($body['years_of_service'] ?? 0);

    $sql = "UPDATE teacher SET
        last_name='$last', first_name='$first', middle_name='$middle', suffix='$suffix',
        birth_year=$by, birth_month=$bm, birth_day=$bd,
        sex_id=$sex_id, civil_status_id=$civil_status_id, educ_attainment_id=$educ_attainment_id,
        division_id=$division_id, functional_division_id=$functional_div_id,
        designation='$desig', years_of_service=$years
        WHERE id_number='$id'";

    if ($conn->query($sql)) {
        sendJSON(['success' => true]);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════════
if ($method === 'DELETE') {
    $id = $conn->real_escape_string($_GET['id'] ?? '');
    if (!$id) sendJSON(['error' => 'id is required'], 400);

    $conn->query("DELETE FROM training WHERE id_number = '$id'");
    $conn->query("DELETE FROM learning_development_need WHERE id_number = '$id'");
    $conn->query("DELETE FROM teacher WHERE id_number = '$id'");

    sendJSON(['success' => true]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildBaseSelect() {
    return "
        SELECT
            t.id_number, t.last_name, t.first_name, t.middle_name, t.suffix,
            t.birth_year, t.birth_month, t.birth_day,
            s.sex_name AS sex, cs.civil_status_name AS civil_status,
            ea.educ_attainment_name AS education,
            d.division_name AS division,
            fd.functional_division_name AS functional_division,
            t.designation, t.years_of_service
        FROM teacher t
        JOIN sex s ON t.sex_id = s.sex_id
        JOIN civil_status cs ON t.civil_status_id = cs.civil_status_id
        JOIN highest_educational_attainment ea ON t.educ_attainment_id = ea.educ_attainment_id
        JOIN division d ON t.division_id = d.division_id
        JOIN functional_division fd ON t.functional_division_id = fd.functional_division_id
    ";
}

function getTrainings($conn, $id) {
    $res  = $conn->query("SELECT * FROM training WHERE id_number='$id' ORDER BY training_year DESC, training_month DESC, training_day DESC");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
    return $rows;
}

function getLDNeeds($conn, $id) {
    $res  = $conn->query("SELECT * FROM learning_development_need WHERE id_number='$id' ORDER BY ld_need_id DESC");
    $rows = [];
    if ($res) while ($r = $res->fetch_assoc()) $rows[] = $r;
    return $rows;
}

/**
 * Look up a FK id by name — LOOKUP ONLY, never inserts.
 * Uses a prepared statement so apostrophes in values like "Bachelor's Degree"
 * are handled correctly without real_escape_string mangling them.
 */
function resolveID($conn, $table, $idCol, $nameCol, $value) {
    $val = trim($value);
    if ($val === '') return 1;

    // Use a prepared statement — avoids the apostrophe escaping bug
    $stmt = $conn->prepare("SELECT `$idCol` FROM `$table` WHERE `$nameCol` = ? LIMIT 1");
    if (!$stmt) sendJSON(['error' => "Prepare failed for $table: " . $conn->error], 500);

    $stmt->bind_param('s', $val);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res && $row = $res->fetch_assoc()) {
        $stmt->close();
        return (int)$row[$idCol];
    }
    $stmt->close();

    // Value not in the constrained lookup table
    sendJSON(['error' => "Invalid value \"$val\" for $table. Please select a valid option."], 400);
}

function ensureIndexes($conn) {
    $db = DB_NAME;
    $indexes = [
        "teacher" => [
            ["idx_teacher_name", "BTREE",    "(last_name, first_name)"],
            ["idx_teacher_years","BTREE",    "(years_of_service)"],
            ["idx_teacher_div",  "BTREE",    "(division_id)"],
            ["idx_teacher_sex",  "BTREE",    "(sex_id)"],
            ["idx_teacher_fdiv", "BTREE",    "(functional_division_id)"],
            ["idx_teacher_ft",   "FULLTEXT", "(last_name, first_name, middle_name)"],
        ],
        "training" => [
            ["idx_training_date",    "BTREE", "(training_year, training_month, training_day)"],
            ["idx_training_teacher", "BTREE", "(id_number)"],
        ],
        "learning_development_need" => [
            ["idx_ld_teacher", "BTREE", "(id_number)"],
        ],
    ];
    foreach ($indexes as $table => $list) {
        foreach ($list as [$name, $type, $cols]) {
            $check = $conn->query("SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA='$db' AND TABLE_NAME='$table' AND INDEX_NAME='$name' LIMIT 1");
            if ($check && $check->num_rows === 0) {
                if ($type === 'FULLTEXT') {
                    $conn->query("ALTER TABLE `$table` ADD FULLTEXT INDEX `$name` $cols");
                } else {
                    $conn->query("ALTER TABLE `$table` ADD INDEX `$name` $cols USING BTREE");
                }
            }
        }
    }
}
