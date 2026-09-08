# Deployment package verification — 2026-09-08

Local Docker Desktop validation on Apple Silicon, using the same pinned base
image and runtime restrictions as the VPS package:

- Docker image built successfully as `obolos-data-service:validation`.
- Compose configuration validated with placeholder domain/email/operator values.
- Caddy 2.10.2 validated the HTTPS configuration without starting a public server.
- Dedicated production dependency audit: **0 vulnerabilities** at check time.
- Runtime UID/GID: **1000**, read-only root filesystem, all capabilities dropped.
- Real Blocky402-backed `/health` reported `hedera:testnet` and the testnet
  facilitator URL.
- Unpaid evidence request returned **HTTP 402**, `PAYMENT-REQUIRED`, and recipient
  **0.0.10425234**.
- Missing operator authentication returned **HTTP 401**.
- An authenticated price change in an isolated test volume survived a container
  restart.
- Image inspection confirmed broker source, project `.env.broker`, local `data/`,
  Circle packages, and Ledger packages were absent.
- Isolated validation container and volume were removed after verification.

No payment was signed or submitted by these checks. This is deployment-package
validation, not evidence of public DNS, certificate issuance, VPS deployment, or
a paid request against the future public hostname. Those require the actual VPS
and domain and must be verified after deployment.
