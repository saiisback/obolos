# Obolos presentation

Open [the seven-slide presentation](presentation/index.html) in a browser, or use the [seven-page PDF](presentation/obolos-presentation.pdf). It runs without a build, account, external font or JavaScript dependency. The original illustration is included alongside the HTML. Use **Present**, arrow keys, or **Print / PDF**; printing includes every slide at 16:9 even when presentation mode shows one slide.

The deck follows Obolos's existing Foundation/Mobbin reference: black-and-white typography, colorful pill accents, generous framing, and the original flat illustration. It contains a visible SVG architecture diagram and direct links to both actual testnet receipts.

## Talk track (approximately 3:30)

| Slide | Time | Narration |
|---|---|---|
| 1. Obolos | 0:00–0:20 | “Obolos buys research evidence and pays for source checks within a human-defined mandate.” |
| 2. Product flow | 0:20–0:45 | “The human chooses providers, spending caps and expiry. The planner discovers actual quotes, purchases inputs, commissions checks, and keeps the evidence.” |
| 3. Architecture | 0:45–1:20 | “Next.js invokes narrow broker capabilities. Ledger Ring protects the stored inference and Hedera credentials; Circle uses its separate agent-wallet session. Only settlement is on-chain.” |
| 4. Executed payments | 1:20–1:55 | “This completed testnet run purchased three records for 0.003 HBAR via Blocky402. It paid 0.05 USDC through Circle on Arc for verification. Both receipts are inspectable.” |
| 5. Spending control | 1:55–2:25 | “A refreshed quote can trigger rerouting or an approval pause. An exact, expiring mandate change must be signed by the configured controller before proceeding.” The saved live escalation establishes user-authorized Speculos approval, mandate v2 and a resumed 0.008 HBAR purchase. Disclose the subsequent uncertain Arc verification attempt and pending reservation. |
| 6. Ledger integration | 2:25–3:00 | “We ran official Ledger applications in Speculos against the real staging protocol, through a disclosed adaptation of wallet-cli ring. This is software emulation; hardware security and sponsor approval are not claimed.” |
| 7. Submission | 3:00–3:30 | Name the three tracks, link the repository, and state any remaining external gates from the current submission matrix. |

## Evidence and update rules

The September 8 first paid run is established by [the saved report and export](evidence/2026-09-08-first-paid-run.md). Ring tests are established by [the execution record](../tools/ledger-speculos/ring-evidence.json). The first run did not exercise price escalation. A subsequent [live quote-increase export](evidence/2026-09-08-blocked-price-increase.json) establishes a pause before spending; a later [fresh run](evidence/2026-09-08-approved-price-increase.md) proves user-authorized Speculos signing, backend mandate v2 acceptance and resumed Hedera settlement. Its Arc verification attempt became uncertain; do not describe it as a completed two-rail escalation run. [Public HTTPS hosting and a data-only paid request](evidence/2026-09-08-public-data-purchase.md) are now verified. Temporary tunnels require the Mac to remain online; Arc reconciliation remains pending.

Do not present this slide deck as the required demo video. Record the actual application workflow, emulator review, and explorer receipts with clear narration. Do not record private environment files, API keys, key material, the Ring password, Circle sessions or OTPs. The source/structure verifier does not establish every prose statement as independently true. No physical Ledger was used, and sponsor acceptance of the emulator/source-adapter combination is unconfirmed.

The [submission matrix](submission.md) tracks qualification artifacts; the [Ledger feedback draft](ledger-feedback.md) is ready for operator review and has not been sent externally.

## Video correction and human recording

**The earlier synthetic-voice video is an internal preview and must not be submitted.** The [official ETHOnline instructions](https://ethglobal.com/events/ethonline2026/info/details) prohibit text-to-speech/AI voiceover and speeding up footage, and require 2–4 minutes at 720p or above. Disclosing Samantha does not make synthetic narration acceptable.

Use the [silent human-narration visual bed](presentation/obolos-human-narration-visual-bed.mp4) with the [timed human script and Mac recording steps](presentation/demo-transcript.md). It preserves original playback speed for the actual Speculos and public paid-request clips. Human narration remains required before upload.

The [old TTS preview — DO NOT SUBMIT](presentation/obolos-internal-tts-preview-DO-NOT-SUBMIT.mp4) is retained only as an internal historical artifact. Its Speculos segment was also compressed from 30 seconds to approximately 28.35 seconds; the visual bed replaces it with the original 30-second footage. No old synthetic audio is included in the visual bed.

The first completed two-rail run, partially completed escalation and actual public data-only purchase remain distinct. The public segment visibly executes the paid purchase; saved report/receipt views are later read-only captures. This is an edited walkthrough of separate executions, not one continuous two-rail recording.
