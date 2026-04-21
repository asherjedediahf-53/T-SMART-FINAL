<?php
/**
 * API: /api/stats.php
 * Returns aggregated stats for dashboard charts.
 * GET /api/stats.php
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
    'total_teachers'    => (int)$conn->query('SELECT COUNT(*) AS c FROM teacher')->fetch_assoc()['c'],
    'by_sex'            => fetchAll($conn, 'SELECT s.sex_name AS label, COUNT(*) AS value FROM teacher t JOIN sex s ON t.sex_id=s.sex_id GROUP BY s.sex_name'),
    'by_division'       => fetchAll($conn, 'SELECT d.division_name AS label, COUNT(*) AS value FROM teacher t JOIN division d ON t.division_id=d.division_id GROUP BY d.division_name ORDER BY value DESC'),
    'by_education'      => fetchAll($conn, 'SELECT ea.educ_attainment_name AS label, COUNT(*) AS value FROM teacher t JOIN highest_educational_attainment ea ON t.educ_attainment_id=ea.educ_attainment_id GROUP BY ea.educ_attainment_name'),
    'by_civil_status'   => fetchAll($conn, 'SELECT cs.civil_status_name AS label, COUNT(*) AS value FROM teacher t JOIN civil_status cs ON t.civil_status_id=cs.civil_status_id GROUP BY cs.civil_status_name'),
    'by_functional_div' => fetchAll($conn, 'SELECT fd.functional_division_name AS label, COUNT(*) AS value FROM teacher t JOIN functional_division fd ON t.functional_division_id=fd.functional_division_id GROUP BY fd.functional_division_name'),
    'total_trainings'   => (int)$conn->query('SELECT COUNT(*) AS c FROM training')->fetch_assoc()['c'],
    'avg_years_service' => round((float)$conn->query('SELECT AVG(years_of_service) AS a FROM teacher')->fetch_assoc()['a'], 1),
]);
