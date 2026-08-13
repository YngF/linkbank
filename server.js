// LinkBank server entrypoint.
//
// By default this is a thin pass-through to the stock SvelteKit adapter-node
// server (build/index.js) — identical behaviour to running `node build`,
// including graceful shutdown, BODY_SIZE_LIMIT, socket activation, etc.
//
// If BOTH TLS_KEY_PATH and TLS_CERT_PATH are set, it instead serves the built
// app directly over HTTPS using those PEM files. This lets you run LinkBank on
// a LAN over https:// with a self-signed certificate, without needing a
// separate reverse proxy to terminate TLS.
//
// When TLS is enabled you MUST also set ORIGIN to the https URL users visit,
// e.g. ORIGIN=https://10.0.23.103:3000 — login/CSRF depend on it matching.

const keyPath = process.env.TLS_KEY_PATH;
const certPath = process.env.TLS_CERT_PATH;

if (!keyPath || !certPath) {
	// No TLS configured → run the unmodified adapter-node server.
	await import('./build/index.js');
} else {
	const { readFileSync } = await import('node:fs');
	const { createServer } = await import('node:https');
	const { handler } = await import('./build/handler.js');

	let key, cert;
	try {
		key = readFileSync(keyPath);
		cert = readFileSync(certPath);
	} catch (err) {
		console.error(
			`[linkbank] Could not read TLS files.\n` +
				`  TLS_KEY_PATH=${keyPath}\n` +
				`  TLS_CERT_PATH=${certPath}\n` +
				`  ${err.message}`
		);
		process.exit(1);
	}

	const port = Number(process.env.PORT) || 3000;
	const host = process.env.HOST || '0.0.0.0';

	const server = createServer({ key, cert }, handler);

	server.listen(port, host, () => {
		console.log(`[linkbank] Listening on https://${host}:${port} (TLS, self-manageable cert)`);
		if (!process.env.ORIGIN) {
			console.warn(
				'[linkbank] WARNING: ORIGIN is not set. Behind https you should set ' +
					'ORIGIN to the exact URL users visit (e.g. https://host:' + port + '), ' +
					'or login/CSRF may fail.'
			);
		}
	});

	// Best-effort graceful shutdown (the stock server handles this itself on the
	// non-TLS path; here we approximate it for the direct-HTTPS path).
	const shutdown = () => server.close(() => process.exit(0));
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}
