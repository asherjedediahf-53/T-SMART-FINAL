function getConnection() {

    $host = getenv('MYSQLHOST');
    $user = getenv('MYSQLUSER');
    $pass = getenv('MYSQLPASSWORD');
    $db   = getenv('MYSQLDATABASE');
    $port = getenv('MYSQLPORT');

    if (!$host || !$user || !$db) {
        http_response_code(500);
        die(json_encode([
            "error" => "Railway DB not connected. Missing environment variables."
        ]));
    }

    $conn = new mysqli($host, $user, $pass, $db, (int)$port);

    if ($conn->connect_error) {
        http_response_code(500);
        die(json_encode([
            "error" => "DB connection failed: " . $conn->connect_error
        ]));
    }

    return $conn;
}
