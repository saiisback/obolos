# Public Obolos data service on a VPS

This package hosts only the metered GitHub evidence service on Hedera testnet,
settled through `https://api.testnet.blocky402.com`. The Next.js app, payment
broker, Circle session, Ring state, payer private key, and inference key stay on
the local machine. No recipient private key is required.

## 1. Prepare the host and domain

Use a Linux VPS with Docker Engine and the Compose plugin installed. Point a DNS
`A` record such as `data.example.com` at its public IPv4 address. Publish `AAAA`
only if IPv6 reaches this VPS too. Allow inbound TCP 80 and 443 (UDP 443 is
optional). Caddy obtains and renews the HTTPS certificate automatically.

Ports 80/443 must be available. If the VPS already runs a reverse proxy, integrate
this service into that proxy instead of starting a competing Caddy instance.
Do not open ports 3000, 4319, 4402, 5001, or 5002 publicly.

Clone the public source on the VPS; do not upload the local project directory:

```sh
git clone https://github.com/saiisback/obolos.git
cd obolos
cp deploy/data-service/.env.example deploy/data-service/.env.server
chmod 600 deploy/data-service/.env.server
nano deploy/data-service/.env.server
```

Set your actual hostname and certificate contact email. Keep the receiving
account as `0.0.10425234`. Enter the existing private
`DATA_SERVICE_OPERATOR_TOKEN` used by the local app in `.env.local`; it authenticates the
price-update route. An optional GitHub token needs only access to public
repository metadata. Never add payer, Circle, Ring, or inference secrets here.

## 2. Start HTTPS hosting

Run these from the repository root:

```sh
docker compose --env-file deploy/data-service/.env.server -f deploy/data-service/compose.yaml config --quiet
docker compose --env-file deploy/data-service/.env.server -f deploy/data-service/compose.yaml up -d --build
docker compose --env-file deploy/data-service/.env.server -f deploy/data-service/compose.yaml ps
```

Use `config --quiet`: the full rendered config includes the operator token.
The data service runs as the unprivileged `node` user on a read-only filesystem,
with one writable state volume. Only Caddy exposes host ports. The build uses a
separate dependency lockfile and an explicit context/source allowlist.

## 3. Check the public service without spending

Replace `data.example.com` in these commands:

```sh
curl --fail https://data.example.com/health
curl --fail https://data.example.com/discovery
curl -i https://data.example.com/evidence/repo-standard \
  -H 'Content-Type: application/json' \
  --data '{"repos":["vercel/next.js"]}'
```

The final request must return HTTP **402**, a `PAYMENT-REQUIRED` header, network
`hedera:testnet`, recipient `0.0.10425234`, and the actual HTTPS resource URL.
Discovery must advertise the same hostname. These checks do not sign or submit
any payment. A public host alone is not proof of a completed public paid request.

## 4. Connect the local Obolos app

Set `DATA_SERVICE_URL=https://data.example.com` in the local app `.env.local` and
private `.env.broker`, then restart the app and broker with their existing local
credentials. Preserve the broker's `HEDERA_PAY_TO=0.0.10425234` and the app's matching
operator token. Run a newly authorized workflow and retain its receipts to prove
that the public HTTPS endpoint completed an actual Blocky402 paid request.

## Durable state, restarts, and updates

`obolos-data-service-state` retains `prices.json` and `payment-*.json` across
rebuilds and ordinary `docker compose down` / `up`. These records protect payment
replay handling and preserve changed quotes. Never run `down --volumes`, delete
the state volume, or change the volume name to resolve a failed payment. Inspect
and reconcile the recorded transaction instead. Run one service replica; the
current price queue and filesystem journal are designed for a single writer.

For updates, retain `.env.server` and all named volumes, fetch the intended
reviewed commit, and repeat `up -d --build`. Existing local payment records are
not part of this image or automatically migrated. Before cutting over an
existing service, stop its writer and have the operator migrate only its data
service state into the named volume; never upload the entire local `data/`
directory. A fresh public deployment starts with default quotes until the
authenticated operator changes them.

Back up the named state volume and Caddy certificate volume through the VPS's
private backup system. Stop the service writer while snapshotting or restoring
its state. Keep filesystem ownership UID/GID 1000 for the service volume.

The operator price endpoint remains reachable through HTTPS and requires its
Bearer token. Payment endpoints are intentionally public. Keep the service online
through judging, monitor `/health`, and retain real receipt evidence separately.
