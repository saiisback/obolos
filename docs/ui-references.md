# AgentGDP interface references

The user requested Mobbin as the sole UI, UX, and typography reference source, a black-and-white interface with colorful buttons, and a flat 2D illustration without shadows. The later request for a more playful direction supersedes the earlier Mercury exploration and the original dark-green plan. Mercury is not a reference for the delivered direction.

The following actual screen images were retrieved through Mobbin and visually inspected during implementation:

- [Linear — project overview](https://mobbin.com/screens/9c8e3907-b7af-48d6-ae2d-9b4ff700d433): compact workspace navigation, a large white work surface, restrained separators, and a distinct right-hand properties/activity area.
- [Pitch — team workspace](https://mobbin.com/screens/1d1819c8-6b99-4520-ae77-54d6150be5c8): approachable workspace hierarchy, a clear group of creation actions, and colorful accents contained within an otherwise quiet interface.
- [Notion — welcome workspace](https://mobbin.com/screens/a8c412e9-2b79-42db-8795-117e568e1dd5): a friendly welcome treatment, bold readable heading, compact sidebar, and generous white space around actionable content.

These references informed hierarchy and interaction patterns; AgentGDP is an original implementation, not a reproduction. Tables organize the app's own provider, receipt, and evidence contracts. There are no reference screenshots embedded in the app and no external stock-image sources.

## Typography

The screens show a neutral sans-serif interface with compact labels and clear weight hierarchy. Exact font families cannot be verified from screenshots. The app therefore uses a system sans-serif stack for interface text and a locally available Trebuchet/system fallback for friendly headings. This is an implementation choice inferred from visual characteristics, not a claim that any referenced product uses those fonts. No third-party font service is loaded.

## Illustration

`public/illustrations/agent-workforce.png` is the user-requested original generated illustration: three black-and-white robot coworkers exchanging a payment token and a report, flat 2D with no shadows. It appears in the welcome/setup panel through Next.js Image. The illustration is decorative and never depicts fabricated balances, transactions, or settled results.

## Operational content

The interface reads the real DashboardState contract and contains no seeded runs or fabricated account balances. Rehearsal fixture evidence, simulated receipts, and simulated approvals are explicitly labeled. HBAR and USDC allowances remain separate, and receipt totals include only actual settled receipts. A live receipt shows an explorer link or transaction ID only when the backend returns it. Source timestamps appear beside each report repository.
