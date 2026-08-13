#!/usr/bin/env bash
#
# Generate a self-signed TLS certificate for running LinkBank over HTTPS on a
# LAN (no public domain, no Let's Encrypt).
#
# Usage:
#   ./scripts/gen-selfsigned-cert.sh <hostname-or-ip> [more hostnames/ips...]
#
# Examples:
#   ./scripts/gen-selfsigned-cert.sh linkbank.lan
#   ./scripts/gen-selfsigned-cert.sh linkbank.lan 10.0.23.103 192.168.1.50
#
# Every name/IP you pass is added as a Subject Alternative Name. Modern browsers
# ignore the Common Name and match ONLY against SANs, so list every address you
# will actually type into the address bar.
#
# Output (override the dir with OUT_DIR=... , validity with DAYS=...):
#   ./certs/linkbank.key   (private key)
#   ./certs/linkbank.crt   (certificate)
#
# Then point LinkBank at them:
#   TLS_KEY_PATH=./certs/linkbank.key \
#   TLS_CERT_PATH=./certs/linkbank.crt \
#   ORIGIN=https://<the-name-you-use>:3000 \
#   node server.js
#
# The .crt file is what you import into each device/browser as a trusted
# authority to make the "not secure" warning go away. Keep .key private.

set -euo pipefail

OUT_DIR="${OUT_DIR:-./certs}"
DAYS="${DAYS:-825}" # 825 = max many browsers accept for a leaf cert

if [ "$#" -lt 1 ]; then
	echo "Usage: $0 <hostname-or-ip> [more hostnames/ips...]" >&2
	echo "Example: $0 linkbank.lan 10.0.23.103" >&2
	exit 1
fi

command -v openssl >/dev/null 2>&1 || {
	echo "Error: openssl is not installed." >&2
	exit 1
}

mkdir -p "$OUT_DIR"

# Build the SAN list. IPv4 addresses get IP:, everything else DNS:.
san=""
for name in "$@"; do
	if [[ "$name" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
		san="${san}IP:${name},"
	else
		san="${san}DNS:${name},"
	fi
done
san="${san%,}" # strip trailing comma

openssl req -x509 -newkey rsa:2048 -nodes \
	-keyout "$OUT_DIR/linkbank.key" \
	-out "$OUT_DIR/linkbank.crt" \
	-days "$DAYS" \
	-subj "/CN=$1" \
	-addext "subjectAltName=${san}" \
	-addext "basicConstraints=CA:false" \
	-addext "keyUsage=digitalSignature,keyEncipherment" \
	-addext "extendedKeyUsage=serverAuth"

chmod 600 "$OUT_DIR/linkbank.key"

echo
echo "Wrote:"
echo "  $OUT_DIR/linkbank.key  (private key — keep secret)"
echo "  $OUT_DIR/linkbank.crt  (certificate — import into browsers to trust it)"
echo "Valid for $DAYS days. SubjectAltName: $san"
