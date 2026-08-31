<?php
// Answers directory listing, whose enablement is unknown. Nothing sensitive
// can be read from a file name; that is no reason to publish a table of
// contents of one's own code. This is not a protection, it is hygiene.
http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo "404\n";
