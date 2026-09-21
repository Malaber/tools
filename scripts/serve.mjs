import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const port = Number(process.env.PORT || 4173);
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let filename = resolve(root, `.${pathname}`);
    if (filename !== root && !filename.startsWith(root + sep)) throw new Error('Outside preview root');
    if ((await stat(filename)).isDirectory()) {
      if (!pathname.endsWith('/')) {
        response.writeHead(308, { Location: `${new URL(request.url, 'http://localhost').pathname}/${new URL(request.url, 'http://localhost').search}` }).end();
        return;
      }
      filename = resolve(filename, 'index.html');
    }
    const content = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found. Even tiny toolboxes have limits.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port} (rebuild after edits)`));
