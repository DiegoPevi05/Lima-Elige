<?php
// Contador de visitas: un número en visitas.txt, sin guardar IP ni cookies.
// GET devuelve el total; POST suma una visita (el navegador envía una por día).
header('Content-Type: application/json');
header('Cache-Control: no-store');

$archivo = __DIR__ . '/visitas.txt';
$h = fopen($archivo, 'c+');
if (!$h) {
    http_response_code(500);
    echo json_encode(['error' => true]);
    exit;
}
flock($h, LOCK_EX);
$n = (int) stream_get_contents($h);
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $n++;
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, (string) $n);
}
flock($h, LOCK_UN);
fclose($h);
echo json_encode(['visitas' => $n]);
