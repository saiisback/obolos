# Security

Obolos is a testnet application with private runner, wallet and credential boundaries. Review the [architecture](docs/architecture.md), [payment executor](docs/economy/executor.md) and [documented limitations](README.md#economic-measurements) before operating it.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting option on this repository's Security page if it is available. If it is unavailable, open a minimal issue requesting a private contact channel without including exploit details or sensitive data. Do not post wallet keys, credentials, signed payloads or account data publicly.

A useful private report includes the affected commit, a minimal reproduction using disposable local or testnet data, expected and actual behavior, and the potential impact. Do not use third-party accounts or funds to demonstrate a vulnerability.

## Sensitive local state

Environment files, `data/`, `tmp/` and `output/` are not public source. Preserve durable operation journals when a payment outcome is uncertain: deleting them can invalidate safe recovery. Never import production wallet recovery material into Speculos.

Historical [review notes](docs/reviews/security-review.md) and [execution evidence](docs/README.md#verification-evidence) document specific checks, not a general security certification. No response-time or support-lifetime guarantee is currently published.
