# ETHOnline 2026: sponsor and submission research

Checked September 7, 2026 against primary sources. No integrations have been executed; implementation recommendations below are design inferences.

## Submission rules verified

One project submission can select **up to three partners**. Multiple eligible tracks within the same partner count as one partner selection. Thus Ledger + Hedera + Arc are exactly three selections, not three separate projects. Deadline: September 13, 2026 at noon EDT, equivalent to **9:30 p.m. IST**. Event-wide demo upload requires **2–4 minutes**, stricter than Hedera's five-minute maximum. The Classic track requires project-specific code, designs and assets to begin after the event starts; public libraries/starters are permitted. Continuity permits existing code with documented new contributions, subject to partner eligibility. Keep real commit history. Disclose AI assistance; spec-driven workflows must include their specs, prompts and planning artifacts. [ETHOnline 2026 submission rules](https://ethglobal.com/events/ethonline2026/info/details)

## Exact tracks verified

| Partner | Target | Required evidence |
|---|---|---|
| Ledger | AI Agents x Ledger; pool $3,500; awards $2,000/$1,000/$500 | Start a new project; central device-backed security and Agent Stack/Key Ring integration. |
| Hedera | AI & Agentic Payments; pool $6,000; up to three $2,000 awards | Live x402 service on Hedera through Blocky402; a consuming agent/platform; one real paid request; public repo and payment documentation. |
| Arc | Best Agentic Economy Application with Circle Agent Stack; $1,667 | Agent transacts with USDC on Arc using Circle Agent Stack; working frontend/backend, architecture diagram, video/presentation, documentation and repository. |

The Arc September 30 mainnet-readiness requirement belongs to the separate Launch on Arc track, not this Agentic Economy category. Combined listed pools total $11,167; the highest individual awards in the three selected categories total $5,667, assuming all are won. [Official prizes](https://ethglobal.com/events/ethonline2026/prizes)

Ledger additionally requires tooling/DX feedback from every submission, including gaps and concrete improvements. Its two highlighted directions are scoped-capability secret brokers and enrolling USB-less hosts. [Ledger ETHOnline page](https://developers.ledger.com/ethonline)

## Ledger capabilities and limitations

`wallet-cli ring init` provisions through a connected Ledger. Later encrypt/decrypt operations need network access but no device; encryption is AES-256-GCM under named keys. Decrypt can return plaintext via file or stdout. The docs list Bitcoin, Ethereum/EVM and Solana wallet operations, and physical confirmation for fund-moving commands. The ring password should be human-provisioned and protected through the OS keychain. [Wallet CLI docs](https://developers.ledger.com/docs/ai-tools/ledger-cli)

**Design inference:** encrypting an API key and giving the agent `ring decrypt` does not prevent exfiltration. A separate broker must own decryption, keep plaintext out of agent tools/logs/files, and offer narrow capabilities such as a specific provider operation, budget, expiry and recipient. The broker is a trusted runtime; Key Ring alone does not protect against its compromise. Native headless ring decryption also does not mean unattended Ledger transaction signing.

The public CLI page does not document a complete remote enrollment command sequence. Treat USB-less enrollment as a separate integration spike rather than an assumed built-in feature. Do not assume native Hedera signing or Arc-specific CLI configuration without testing.

## Circle capabilities and limitations

Agent Wallets use Circle user-controlled wallets with 2-of-2 MPC. Key shares are not exposed to the agent. Policies include USDC transfer/x402 limits, time windows and address controls. This is distinct from a Ledger hardware signer. [Agent Wallets](https://developers.circle.com/agent-stack/agent-wallets)

The supported-chain table explicitly includes `ARC-TESTNET`, currently testnet only, and does not list Hedera. Therefore plan separate Hedera and Arc payment adapters and balances. Do not assume a Circle Agent Wallet can directly pay Blocky402 on Hedera. [Agent wallet chains](https://developers.circle.com/agent-stack/agent-wallets/supported-blockchains)

Email OTP login creates agent wallets across supported chains. Testnet sessions are separate; `circle wallet fund` supports faucet funding on `ARC-TESTNET`. These are external setup prerequisites for a working demo. [Wallet quickstart](https://developers.circle.com/agent-stack/agent-wallets/quickstart)

Circle CLI supports service search, inspection, payment preview and a per-payment `--max-amount` cap. Payment precedes forwarding to the service; a successful payment alone does not establish output quality. [Pay for a service](https://developers.circle.com/agent-stack/agent-nanopayments/operations/pay-for-service)

Nanopayments use Gateway balances and batch payment authorizations into onchain settlement. Do not promise a separate Arc transaction hash for every nanopayment. [Agent Nanopayments](https://developers.circle.com/agent-stack/agent-nanopayments)

Gateway supports Arc testnet and nanopayments there; Hedera is absent from its supported-chain list. [Gateway chains](https://developers.circle.com/gateway/references/supported-blockchains)

Official starters wire six agent frameworks to Circle CLI and skills. They expose a shell, file reads and search rather than typed payment tools, and gate money-moving commands with interactive approval. Their own documentation states the shell is not sandboxed; wallet limits are the stronger enforcement layer. A product should preserve limits and replace unrestricted agent access with scoped broker tools. [Circle starter kits](https://github.com/circlefin/agent-stack-starter-kits)

## Recommended integration boundary

Build one useful paid agent service marketplace/workflow, with two real settlement legs: Hedera x402/Blocky402 for a metered service and Circle Agent Stack USDC on Arc for a separate job or service payment. Protect upstream paid-provider credentials behind a Ledger Key Ring broker; enforce approved operations and budgets outside the LLM. Add explicit Ledger approval for escalation only if the signature is actually verified and gates execution. This combines sponsors without pretending the two chains have shared balances, atomic cross-chain settlement, or a common signer.

Before committing to the scope, validate device access, Key Ring provisioning, Circle testnet login and one transfer, and one Blocky402 paid call. Remote enrollment and human hardware approvals are implementation work, not verified existing project capabilities.
