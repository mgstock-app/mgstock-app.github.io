import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('out');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const base = html.includes('/mgstock/_next/') ? '/mgstock' : '';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (base && path === '/') { res.writeHead(302, { Location: base + '/' }); res.end(); return; }
    if (base && !path.startsWith(base + '/')) throw new Error('Not found');
    path = path.slice(base.length);
    let file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Not found');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 3100), '127.0.0.1', () => console.log(`mgstock: http://localhost:${process.env.PORT || 3100}${base}/`));
