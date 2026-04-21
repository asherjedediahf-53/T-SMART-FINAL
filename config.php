<?php
// ─── DATABASE CONFIGURATION ───────────────────────────────────────────────────
// Railway injects these environment variables automatically.
// For local XAMPP testing, the getenv() calls fall back to the defaults below.

define('DB_HOST', getenv('MYSQLHOST')     ?: 'localhost');
define('DB_PORT', getenv('MYSQLPORT')     ?: '3306');
define('DB_USER', getenv('MYSQLUSER')     ?: 'root');
define('DB_PASS', getenv('MYSQLPASSWORD') ?: '');
define('DB_NAME', getenv('MYSQLDATABASE') ?: 'final_deped_db');

// ─── CORS HEADERS ─────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ─── DATABASE CONNECTION ──────────────────────────────────────────────────────
function getConnection() {
    // Railway uses a non-standard port — mysqli needs it passed explicitly
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, (int)DB_PORT);
    if ($conn->connect_error) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
        exit();
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}

// ─── HELPER: Send JSON response ───────────────────────────────────────────────
function sendJSON($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit();
}
