/**
 * Servidor estático mínimo para la build del visor (`www`), con las rutas de
 * la aplicación redirigidas a index.html. Solo para las pruebas en navegador.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../www/', import.meta.url));
const PORT = Number(process.env['PORT'] ?? 4300);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname));
  const file = join(ROOT, path);
  const serve = (target: string) =>
    readFile(target).then((content) => {
      response.writeHead(200, {
        'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
      });
      response.end(content);
    });
  serve(file.endsWith('/') ? join(file, 'index.html') : file).catch(() =>
    serve(join(ROOT, 'index.html')).catch(() => {
      response.writeHead(404);
      response.end();
    }),
  );
}).listen(PORT);
