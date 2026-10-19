const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const port = Number(process.env.PUNKPOD_WEB_PORT || 4173);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

http.createServer((request, response) => {
  const pathname = (request.url || '/').split('?')[0];
  if (pathname.startsWith('/api/') || pathname === '/health') {
    const proxy = http.request({ hostname: '127.0.0.1', port: 8787, path: request.url, method: request.method, headers: { ...request.headers, host: '127.0.0.1:8787' } }, (upstream) => {
      response.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(response);
    });
    proxy.on('error', () => { response.writeHead(502, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'PunkPod API is not running on port 8787' })); });
    request.pipe(proxy);
    return;
  }
  let file = path.join(root, decodeURIComponent((request.url || '/').split('?')[0]));
  if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  try {
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    response.end(fs.readFileSync(file));
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('PunkPod development server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`PunkPod web server running at http://127.0.0.1:${port}`);
});
