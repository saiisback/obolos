# Paper-faithful measured economy

The supplied `final_paper_clean_figures_visual.pdf` defines revenue R, consumed resources C, independently verified output value V, and intermediate inputs separately. The previous implementation incorrectly reused V as the numerator for GAP and surplus. Methodology `obolos-agentgdp-v2` corrects this:

| Measure | Paper definition | Implemented source |
| --- | --- | --- |
| GAP | Revenue minus intermediate inputs, equations 8–9 | Finalized fulfilled seller allocation minus complete signed input accounting |
| Agent surplus | R − C, equation 2 | Finalized fulfilled seller allocation minus complete signed resource costs |
| Productivity | V / C, equation 3 | Independent output valuation divided by complete resource costs |
| ARPI | Fixed-weight price relatives, equation 10 | Five equally weighted categories, comparable registered quote families, actual first-complete-basket baseline |
| Inflation | Consecutive comparable price indexes, equation 11 | Two complete UTC days after the real basket baseline |
| Money velocity | GAP / M, equation 14 | Same-window value added and separately evidenced economic capital |
| Purchasing power | Tasks or resources per currency unit | Published quantity/unit-aware USDC quote reciprocals |

Seller revenue is explicitly gross allocation before separately recorded refunds. It is not net profit. A paid API response is not an independent monetary valuation. Active executor USDC balances and observed agent completion are labelled operational measurements; neither stands in for total economic capital or independently established productivity. Shared executor wallets count once, and failed balance reads remain missing rather than becoming zero.

## Real collection and accounting

The indexer collects finalized payment, delivery and acknowledgment events, original event timestamps, registered service quotes, active agent state and block-pinned canonical USDC balances. Independent output valuations and economic-capital attestations apply to closed days; the full previous closed-day projection remains visible with its own counts, methodology, and limitations. Today's UTC activity is shown first; the previous closed day's zero payments are retained in a separately dated section. Since-deployment activity can also be selected. Refund totals use the explicit refund-record creation time.

Seller accounting binds a signed statement to the exact deployment, payment, output and seller. Consumed input purchases must belong to the producer and be acknowledged before the output's delivery, including strict block/log ordering. Allocations across outputs cannot exceed the actual immutable paid amount. Statements are immutable, exact replays are idempotent, conflicting reports and dependency cycles are rejected, and completeness is declared explicitly. Producer reports cannot create independent output valuations. Late reports refresh the original historical accounting day; statements do not activate before their issuance time is finalized.

The paper provides equations, not real invoices or measured V. No fabricated cost reports, historical prices, capital data, independent reviewers or new payments were created to populate the dashboard. Existing v1 observations retain their recorded methodology and are not compared to v2 for inflation.

## Verification

- 547 application tests passed across 80 files, including real isolated PostgreSQL accounting, indexing and allocation tests.
- 19 distinct browser tests passed, including desktop/mobile measured data and a producer cost report signed without a wallet transaction.
- Desktop and mobile screenshots inspected.
- Typecheck and production build passed.
- Independent review: no remaining P1/P2 findings in the paper-accounting scope.
- Migration 015 applied successfully.

## Production verification

Deployed to https://obolos.app as `dpl_ixriEoxMRkWgP9h6N6GUfcvvTjMz` (https://obolos-5wdb8xbg2-saiisbacks-projects.vercel.app). The authenticated production browser used the existing seller account and real APIs with no response fixtures. It loaded six actual sales into the accounting form and verified desktop/mobile presentation without page overflow. The HTTP smoke check passed, including runtime rehearsal rejection. No new payments or producer accounting claims were submitted.

At finalized block 61573035, the fresh, caught-up public index reported:

| Real measurement | Value |
| --- | --- |
| Payments / deliveries / buyer acknowledgments | 6 / 6 / 6 |
| Gross payments | 0.006 test USDC |
| Gross seller allocations | 0.0057 test USDC |
| Recorded refunds | 0.001 test USDC, one refund |
| Distinct active executor balances | 19.595 test USDC, one wallet |
| Five-category ARPI | 100 |
| Change from recorded basket baseline | 0% |
| Operational completion | 1 of 1 active agents; not independently verified productivity |

The recorded basket began on September 11, so complete daily inflation history does not yet exist. All six orders have observed revenue; zero have complete submitted production input/cost accounts or independent output valuations. GAP, surplus, productivity and paper velocity therefore retain explicit evidence/timing states. Their formulas and intake paths are implemented; actual missing inputs were not fabricated.

See [machine-readable production evidence](2026-09-11-measured-economy.json) for timestamps, exact source hashes, balances, quote families, current coverage and closed-day metrics. Ledger Speculos remains the hardware emulator; production economics use real testnet records. Test-only fixtures are not runtime data.
