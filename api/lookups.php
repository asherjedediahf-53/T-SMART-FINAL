<?php
/**
 * API: /api/lookups.php
 * Returns all dropdown/reference data in one call.
 * GET /api/lookups.php
 */

require_once '../config.php';

$conn = getConnection();

function fetchAll($conn, $sql) {
    $res  = $conn->query($sql);
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    return $rows;
}

sendJSON([
    'sex'                => fetchAll($conn, 'SELECT * FROM sex ORDER BY sex_name'),
    'civil_status'       => fetchAll($conn, 'SELECT * FROM civil_status ORDER BY civil_status_name'),
    'education'          => fetchAll($conn, 'SELECT * FROM highest_educational_attainment ORDER BY educ_attainment_name'),
    'division'           => fetchAll($conn, 'SELECT * FROM division ORDER BY division_name'),
    'functional_division'=> fetchAll($conn, 'SELECT * FROM functional_division ORDER BY functional_division_name'),
]);
