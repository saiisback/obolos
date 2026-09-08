# Obolos public demo on Vercel

`https://obolos.app` is a Vercel reverse proxy to the operator's running Mac. This keeps the existing single-writer filesystem journals persistent and the wallet broker on loopback. It is a temporary demonstration deployment, not an always-on serverless application.

| Public route | Upstream |
| --- | --- |
| `/x402/*` | Local repository data service, port 4402, through its HTTPS tunnel |
| All other routes | Local Next.js production server, port 3000, through a separate HTTPS tunnel |

The broker on port 4319, Speculos ports 5001/5002, Ring password, encrypted bundle, Circle login and payer keys are not deployed to Vercel. The app server can invoke the broker only after its operator authentication and mandate checks. Public visitors can run the clearly labelled rehearsal. Live operations require the private operator token.

All proxy routes use `no-store`; application cookies are Secure and HttpOnly. The canonical origin is `https://obolos.app`; `www` redirects to it. Public paid requests retain that exact origin and `/x402` prefix in their signed payment resource.

## Running the demo

Keep this Mac awake with the production app, data service, broker, Speculos and both tunnels running. Current tunnel URLs are in `vercel.json`; restarting a Quick Tunnel normally changes its URL, requiring a configuration update and redeployment. The custom domain alone does not keep the backend running.

In the repository root, private configuration must include:

- `.env.local`: `APP_ORIGIN=https://obolos.app`, `COOKIE_SECURE=true`, `DATA_SERVICE_URL=https://obolos.app/x402`.
- `.env.broker`: `DATA_SERVICE_URL=https://obolos.app/x402`.
- `.env.services`: `DATA_SERVICE_PUBLIC_URL=https://obolos.app/x402`.

Retain all other existing private values and journals. Start each command in its own terminal; do not start a second writer if the corresponding service is already running:

```sh
npm run build
./node_modules/.bin/next start --hostname 127.0.0.1
```

```sh
npm run data-service
```

```sh
WALLET_PASS=$(security find-generic-password -a default -s obolos-speculos-ring-password -w) npm run broker
```

```sh
cloudflared tunnel --config /dev/null --url http://127.0.0.1:3000 --no-autoupdate
```

```sh
cloudflared tunnel --config /dev/null --url http://127.0.0.1:4402 --no-autoupdate
```

Update only the corresponding public tunnel destinations in `vercel.json`. Never tunnel the broker or emulator. The Vercel project `obolos` is connected to `saiisback/obolos`, production branch `main`, with root directory **`deploy/vercel-proxy`**, Framework **Other**, no install/build command, output **`public`**. A push to `main` redeploys this proxy package. This package contains no application environment files or wallet credentials. Vercel CLI linking can download an OIDC environment file; `.gitignore` and `.vercelignore` exclude it.

For a fresh checkout, configure the same Vercel root directory before enabling Git deployment. Do not deploy the repository's Next.js root directly to serverless functions: its filesystem journal and local broker require a persistent operator host.

## Public checks (no payment)

```sh
curl -i https://obolos.app/x402/health
curl -i https://obolos.app/x402/discovery
curl -i https://obolos.app/x402/evidence/repo-standard \
  -H 'Content-Type: application/json' \
  --data '{"repos":["vercel/next.js"]}'
```

The final command must return HTTP 402 and `PAYMENT-REQUIRED`, with `hedera:testnet`, asset `0.0.0`, recipient `0.0.10425234`, and resource `https://obolos.app/x402/evidence/repo-standard`. Prices come from the live provider; do not hard-code a stale quote. Do not send a payment again after a timeout or ambiguous outcome; reconcile its existing journal first.

The [standalone container deployment](../data-service/README.md) is available if a persistent host becomes available later.

References: [Vercel external rewrites](https://vercel.com/docs/routing/rewrites), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
