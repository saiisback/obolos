# Obolos interface references

## Current direction: Foundation

The user selected [this Foundation collection on Mobbin](https://mobbin.com/apps/foundation-web-5961ac11-d69d-4db2-bc42-2cc99ad685fa/055484d9-dd92-493f-8711-4f2797cb7738/screens) as the UI reference. This supersedes the earlier Linear/Pitch/Notion direction. The existing black-and-white palette, colorful buttons, and original flat 2D illustration without shadows remain explicit user constraints.

The following Foundation screenshots were returned by the connected Mobbin tool and visually inspected, rather than inferred from search metadata:

- [Editions gallery](https://mobbin.com/screens/07fe9059-a2bd-4d31-932f-a80c72836d2d): white horizontal navigation, centered rounded search, bold black section title, generous space, large artwork frames and compact actions.
- [Listings](https://mobbin.com/screens/0233ab43-be42-44b4-a0f3-3446d1edee42): pill-shaped view/filter controls, square pale-gray visual surfaces, small metadata and prices underneath.
- [Artwork detail](https://mobbin.com/screens/7a7d9a8c-ec0f-4039-8849-79ca74cd40e6): oversized left-aligned title and creator information beside a large visual presentation area.
- [Purchase detail](https://mobbin.com/screens/ee0a622b-50c3-4713-b109-af41f6bfdd39): compact amount/price metrics and a broad rounded action button.

## Adaptation

Obolos uses the reference's horizontal navigation, bold typography, generous framing and pill controls for its own research economy. Every control still uses the existing session-scoped application API. The generated agent artwork takes the place of Foundation's gallery imagery. No NFT listings, fake sales figures, Foundation branding or reference screenshots are embedded in the product.

The operator's current run and paid evidence remain the central content. HBAR and USDC allowances stay separate. Rehearsal fixture data, simulated approvals and simulated receipts remain visibly identified; onchain receipts require actual backend settlement evidence.

## Typography

Foundation's screenshots show bold, tightly spaced neutral grotesque headings and smaller sans-serif metadata. Screenshots do not establish the exact proprietary font family. The implementation uses locally available Helvetica/Arial sans-serif fallbacks as a visual approximation. No font binary is copied or third-party font service introduced.

## Illustration

`public/illustrations/agent-workforce.png` is the user-requested original generated artwork: three black-and-white robot coworkers exchanging a payment token and research report, flat 2D with no shadows. It is shown through Next.js Image and does not depict settlement evidence.

## Validation scope

This is a presentation update to the existing Next.js/TypeScript application. Review checks cover desktop/mobile navigation, readable forms, the complete rehearsal flow, and production CSS compilation. Sponsor setup and live qualification gates are unchanged; see `docs/submission.md`.

## Foundation restyle verification — September 7

- Production build and its TypeScript check passed; all 62 existing tests passed.
- HTTP smoke passed: CSRF/live gates, session ownership, price shock, approval, completion and export.
- Parent browser verified global search and no-match state, run gallery navigation, receipt A→B→Escape restoring B's trigger, mobile menu focus, expanded mandate fields, and a fresh automatically completed rehearsal with three evidence records and two simulated receipts.
- At a measured 390 CSS-pixel viewport: document width was 390 pixels; heading bottom was 354 pixels and artwork top 504 pixels, with no overlap. Desktop composition was visually checked against the inspected Foundation references. Temporary viewport overrides were reset.
- Source changes are presentation/navigation only. Real settlement and physical Ledger requirements remain in the submission checklist.
