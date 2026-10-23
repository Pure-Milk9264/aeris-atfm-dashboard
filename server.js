import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/simulation.js': ['simulation.js', 'text/javascript; charset=utf-8'] };
const preferredPort = Number(process.env.PORT || 4173);
function listen(port) {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = files[pathname];
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const content = await readFile(fileURLToPath(new URL(file[0], root)));
      response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(500); response.end('Unable to load file'); }
  });
  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && !process.env.PORT) {
      console.log(`端口 ${port} 已被占用，尝试端口 ${port + 1}`);
      listen(port + 1);
      return;
    }
    console.error(`无法启动本地预览：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`AERIS dashboard: http://127.0.0.1:${port}`));
}

listen(preferredPort);
