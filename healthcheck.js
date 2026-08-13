// Container healthcheck. Hits /login (always a 200 for an unauthenticated GET).
// Chooses http vs https based on whether TLS is configured, and accepts a
// self-signed certificate on the loopback self-check.
import http from 'node:http';
import https from 'node:https';

const tls = !!(process.env.TLS_KEY_PATH && process.env.TLS_CERT_PATH);
const port = Number(process.env.PORT) || 3000;
const mod = tls ? https : http;

const req = mod.request(
	{
		host: '127.0.0.1',
		port,
		path: '/login',
		method: 'GET',
		timeout: 4000,
		rejectUnauthorized: false // loopback self-signed cert is fine for liveness
	},
	(res) => process.exit(res.statusCode && res.statusCode < 400 ? 0 : 1)
);

req.on('error', () => process.exit(1));
req.on('timeout', () => {
	req.destroy();
	process.exit(1);
});
req.end();
