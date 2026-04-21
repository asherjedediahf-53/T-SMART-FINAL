<?php
/**
 * API: /api/trainings.php
 *
 * GET    /api/trainings.php?id_number=XXX        → Get trainings for a teacher
 * POST   /api/trainings.php                       → Add training record
 * PUT    /api/trainings.php?id=XXX               → Update a training record
 * DELETE /api/trainings.php?id=XXX               → Delete a training record
 */

require_once '../config.php';

$conn   = getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $id  = (int)($_GET['id_number'] ?? 0);
    $sql = "SELECT * FROM training" . ($id ? " WHERE id_number=$id" : "") . " ORDER BY training_year DESC, training_month DESC";
    $res = $conn->query($sql);
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    sendJSON($rows);
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body) sendJSON(['error' => 'Invalid JSON body'], 400);

    $id    = (int)($body['id_number'] ?? 0);
    $title = $conn->real_escape_string($body['title_of_training'] ?? '');
    $year  = (int)($body['training_year']  ?? 0);
    $month = (int)($body['training_month'] ?? 0);
    $day   = (int)($body['training_day']   ?? 0);
    $hours = (int)($body['no_of_hours']    ?? 0);
    $spon  = $conn->real_escape_string($body['sponsor'] ?? '');

    if (!$id || !$title) sendJSON(['error' => 'id_number and title_of_training are required'], 400);

    $sql = "INSERT INTO training (id_number, title_of_training, training_year, training_month, training_day, no_of_hours, sponsor)
            VALUES ($id,'$title',$year,$month,$day,$hours,'$spon')";
    if ($conn->query($sql)) {
        sendJSON(['success' => true, 'training_id' => $conn->insert_id], 201);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}

if ($method === 'PUT') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body) sendJSON(['error' => 'Invalid JSON body'], 400);

    $tid = (int)($_GET['id'] ?? 0);
    if (!$tid) sendJSON(['error' => 'training_id (id) is required in query string'], 400);

    $title = $conn->real_escape_string($body['title_of_training'] ?? '');
    $year  = (int)($body['training_year']  ?? 0);
    $month = (int)($body['training_month'] ?? 0);
    $day   = (int)($body['training_day']   ?? 0);
    $hours = (int)($body['no_of_hours']    ?? 0);
    $spon  = $conn->real_escape_string($body['sponsor'] ?? '');

    $sql = "UPDATE training SET
                title_of_training='$title',
                training_year=$year,
                training_month=$month,
                training_day=$day,
                no_of_hours=$hours,
                sponsor='$spon'
            WHERE training_id=$tid";

    if ($conn->query($sql)) {
        sendJSON(['success' => true]);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}

if ($method === 'DELETE') {
    $tid = (int)($_GET['id'] ?? 0);
    if (!$tid) sendJSON(['error' => 'id is required'], 400);

    if ($conn->query("DELETE FROM training WHERE training_id=$tid")) {
        sendJSON(['success' => true]);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}
