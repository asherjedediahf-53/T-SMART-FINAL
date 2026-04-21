<?php
/**
 * API: /api/ld_needs.php
 *
 * GET    /api/ld_needs.php?id_number=XXX  → Get LD needs for a teacher
 * POST   /api/ld_needs.php                → Add LD need
 * PUT    /api/ld_needs.php?id=XXX         → Update an LD need
 * DELETE /api/ld_needs.php?id=XXX         → Delete an LD need
 */

require_once '../config.php';

$conn   = getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $id  = (int)($_GET['id_number'] ?? 0);
    $sql = "SELECT * FROM learning_development_need" . ($id ? " WHERE id_number=$id" : "");
    $res = $conn->query($sql);
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    sendJSON($rows);
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body) sendJSON(['error' => 'Invalid JSON body'], 400);

    $id   = (int)($body['id_number'] ?? 0);
    $text = $conn->real_escape_string($body['ld_need_text'] ?? '');

    if (!$id) sendJSON(['error' => 'id_number is required'], 400);

    $sql = "INSERT INTO learning_development_need (id_number, ld_need_text) VALUES ($id,'$text')";
    if ($conn->query($sql)) {
        sendJSON(['success' => true, 'ld_need_id' => $conn->insert_id], 201);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}

if ($method === 'PUT') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body) sendJSON(['error' => 'Invalid JSON body'], 400);

    $lid  = (int)($_GET['id'] ?? 0);
    if (!$lid) sendJSON(['error' => 'ld_need_id (id) is required in query string'], 400);

    $text = $conn->real_escape_string($body['ld_need_text'] ?? '');

    $sql = "UPDATE learning_development_need SET ld_need_text='$text' WHERE ld_need_id=$lid";
    if ($conn->query($sql)) {
        sendJSON(['success' => true]);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}

if ($method === 'DELETE') {
    $lid = (int)($_GET['id'] ?? 0);
    if (!$lid) sendJSON(['error' => 'id is required'], 400);

    if ($conn->query("DELETE FROM learning_development_need WHERE ld_need_id=$lid")) {
        sendJSON(['success' => true]);
    } else {
        sendJSON(['error' => $conn->error], 500);
    }
}
