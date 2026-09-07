# Live integration completion plan

The user authorized implementation and requested a credential checklist after the code is ready.

**Goal:** Audit the three selected tracks and make real testnet setup, wallets, proof, and trust boundaries usable in the existing Foundation-styled app.

**Architecture:** Keep the existing native Hedera x402 service, Ledger-enrolled capability broker and Circle Agent Wallet transfer. Add a read-only broker wallet capability and session-safe Next readiness API. Wallet reads use fixed testnet endpoints and expose public addresses/balances only to an authenticated operator. Preserve all payment approval gates.

**Contract:** `src/lib/live-contracts.ts` defines BrokerWallets and LiveOverview shared by backend and UI.

1. Payment subagent: audit native Hedera and Circle SDK/API use; implement read-only wallet snapshots in a new integration module and authenticated broker GET /wallets. Test integer precision, malformed/wrong-network RPC responses, missing configuration and sanitized errors. Never execute login, funding or payments.
2. UI subagent: implement a separate LiveConnections component and stylesheet, consuming GET /api/live. Show wallet status, recipient, balance provenance, explorers/faucets/docs, separate allowances, pending prerequisites and actual receipt counts. Explain onchain settlement versus offchain orchestration and Ledger/Circle custody. No key inputs or fake connection success. Parent integrates the component.
3. Independent reviewer: audit code against all three qualification lists and verify Ledger ring command compatibility, actual approval download/signing flow, x402 settlement and Circle Agent Wallet semantics. Record actionable gaps and accurate claims.
4. Parent: implement readiness API with operator-only public wallet visibility, safe static resource links, session-owned evidence counts and test coverage. Fix approval export compatibility and live price-change controls. Write preflight and credential/setup docs with exact commands and values; no secrets in client config.
5. Verify targeted boundary tests, complete test suite, typecheck, production build, HTTP smoke and browser setup/readiness flow. Record external hardware/funding/deployment/video gates honestly. Commit reviewable changes and leave local preview running.

**Boundaries:** Testnets only. No recovery phrase, Ledger PIN, private key, OTP or Ring password in chat/browser. No claim that hosted inference, Circle infrastructure, facilitator, or local journals are decentralized. No live receipt is claimed without an actual verified transaction. Never treat configuration as qualification.
