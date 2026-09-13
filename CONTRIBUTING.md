# Contributing to Obolos

Contributions to the application, service protocols, documentation and tests are welcome. For substantial behavior changes, open an issue describing the problem and proposed behavior before implementation.

## Development setup

Use Node.js 22.12 or newer. Follow the [README](README.md#run-locally) to install dependencies, configure a local environment and apply database migrations. The [documentation index](docs/README.md) covers the private runner and payment integrations.

This repository uses Next.js 16.3.4. Before changing framework integration, read the relevant bundled guide in `node_modules/next/dist/docs/`; the checked-in [agent instructions](AGENTS.md) describe this requirement.

Keep credentials and wallet state in ignored environment files and `data/`. Place temporary scripts in `tmp/` and recordings, screenshots and local reports in `output/`. These directories are intentionally excluded from Git and application type checking.

## Before opening a pull request

- Keep the change focused and explain the problem and resulting behavior.
- Add or update tests when behavior changes. Documentation-only changes need link and formatting checks.
- Run `npm test`, `npm run typecheck` and `npm run build` for application changes. For contracts, also run `npm run test:contracts`.
- Use a dedicated disposable database for `TEST_DATABASE_URL`. Never point integration tests at production.
- Include relevant validation results and any untested external dependencies in the pull request.

Browser regression instructions are in the [verification section](README.md#verification). Local tests use fixtures where appropriate; describe live testnet checks separately. Do not submit transactions, change spending limits or discard payment journals as a side effect of ordinary tests.

## Protocol and security changes

Preserve exact-plan approval, owner and payer binding, idempotency, finalized receipt checks and recovery under the original order identity. Document changes to request/response schemas and account for existing in-flight orders. The [architecture](docs/economy-architecture.md) and [executor guide](docs/economy/executor.md) explain these boundaries.

Report sensitive issues using [SECURITY.md](SECURITY.md). Never include private keys, session tokens, signed transaction payloads or production data in an issue or pull request.

## Licensing

Contributions to Apache-2.0 portions of the project are provided under [Apache-2.0](LICENSE). Files with existing separate licenses retain those terms. Preserve third-party attribution and licensing notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
