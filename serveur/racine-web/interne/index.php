<?php
// Repond au listing de repertoire, dont l'activation n'est pas connue.
// Rien de sensible ne se lit dans un nom de fichier ; on ne publie pas pour
// autant un sommaire de son propre code. Ce n'est pas une protection, c'est
// de l'hygiene.
http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo "404\n";
