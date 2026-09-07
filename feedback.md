# Ledger Agent Stack feedback

## Integration feedback from this build

- The distinction between `ring init` device provisioning and later host-side `ring decrypt` is essential. An agent-secret broker example should explicitly show that the untrusted agent cannot execute decrypt or read its output.
- A documented encrypted-bundle → isolated broker → scoped capability example would help builders demonstrate the “use secrets without receiving the key” bounty direction accurately.
- The CLI guide documents ordinary encryption/decryption clearly. A complete VPS enrollment walkthrough would make the USB-less host direction easier to scope; this project does not claim to implement it.
- This MVP uses official LedgerJS HID personal-message signing alongside the required Key Ring CLI. A concise Node/CLI DMK example that signs an expiring application mandate would simplify migration from legacy LedgerJS.
- Run-bound mandate messages can be lengthy. Clear device presentation of the provider, limits, expiry and scope is more useful than an opaque digest; the hardware experience needs real-device testing.

## Experience still to record

No physical Ledger was connected during the automated implementation run. Append device model, firmware/app versions, provisioning behavior, message review usability, actual error messages (without secrets) and reproducible fixes after the operator's device session. The points above are source/code integration feedback, not invented hardware testing results.
