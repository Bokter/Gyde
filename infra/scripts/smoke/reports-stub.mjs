// A stand-in for the Reports service, for the smoke test only: it accepts what Retrieval publishes
// (202) and lets the script read it back with GET /captured. Not part of the product.
import { createServer } from 'node:http';

const captured = [];

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.setHeader('content-type', 'application/json');
    return res.end('{"status":"ok"}');
  }
  if (req.method === 'GET' && req.url === '/captured') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(captured));
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    captured.push({
      method: req.method,
      url: req.url,
      hasInternalToken: Boolean(req.headers['x-internal-token']),
      body: body ? JSON.parse(body) : null,
    });
    res.statusCode = 202;
    res.end();
  });
}).listen(4500);
