# Work 2 — draft, not ready for deployment

Base: `af0b9891a37f8a0392ee2d74a6d65324d6b6e3f9`.
Recovery branch: `backup/before-work2-20260917`.

## Prepared changes

- Reuse Orders/OrderItems, authoritative pricing, row locks, photo capabilities and idempotency.
- CHF 5 shipping below CHF 80 merchandise subtotal; CHF 0 at/above 80.
- PayPal/TWINT as desired future methods, always unpaid. No payment integration.
- Preserve product configuration/quantity/photo behavior; POD maximum 20 per configuration.
- User selected private admin-stored bulk inquiries: 21–9999 copies, no stock mutation or payment, no photo transfer in inquiry flow. Amounts in inquiries are indicative, not a quote.
- Admin order/inquiry list, snapshots, status-only update and authenticated private-photo downloads to temporary blob URLs; logout clears data/URLs.
- Customer-facing invoice text removed. DE/FR retained. No stylesheet/color changes.

## Blocking production migration review

The automatic approval reviewer rejected `work2_unpaid_orders_shipping_and_inquiries` before execution. Reasons supplied:

1. Security-sensitive production migration was requested while a test had failed.
2. The draft retained Rechnung for old-client compatibility, despite the request to remove it.

No retry or alternative execution was attempted. Read-only verification afterwards found zero Work 2 columns, no submit_shop_order RPC, zero orders, and both customer-photos/product-models buckets private. No Edge Function was deployed. Main and GitHub Pages were not changed.

The failed assertion expected the old shipping-exclusive cart total. It is now updated to check subtotal and shipping-inclusive total separately. Additional tests also caught a real receipt-total reset during catalog reload; the draft fixes it.

**The transition remains unapproved.** The migration file preserves the old invoice RPC and accepts historical/transition invoice rows. The new RPC and frontend reject invoice orders. Do not apply this file or merge this PR without resolving the production cutover review. The existing live checkout currently uses the invoice endpoint; removing that RPC or restricting its schema prematurely would break the live site.

Proposed release sequence, subject to review and tests:

1. Review an explicit migration/rollback and old-client retirement plan. Do not rerun baseline schema or seeds. Recheck live schema/data before applying anything.
2. Apply only the approved migration and run transactional `supabase/test-work2-orders.sql` (ROLLBACK). Preserve product data and Storage objects.
3. Deploy the reviewed `supabase/functions/place-order/index.ts` as `place-order-work2`, matching the draft frontend. Existing `place-order` remains the live endpoint until cutover.
4. Obtain a working draft browser preview, test desktop/mobile and both languages, actual admin login/orders/photos, failure/retry behavior and non-admin access. Do not create real paid orders or send payments.
5. Only after all gates pass: merge, verify Pages deployment, and retire the invoice `place-order` endpoint with a clear refresh-required response. Do not leave a legacy invoice endpoint open after cutover. This retirement is not implemented/deployed in this draft.

## Verification

Executed successfully: `NODE_PATH=../favo3dworld-options/node_modules npm test` (or install the pinned development dependency and run `npm test`).

- Existing simulated admin login/CRUD/image-upload tests.
- Existing options/cart/quantity/stock/Scheiben/Pika/Cavallo/DE-FR/photo tests.
- Existing customer-photo Edge mock security tests.
- New DOM tests: shipping 10 / 79.99 / 80 / 80.01, multiple copies, unpaid receipt, retry payload identity, DE/FR, POD cap, bulk inquiry/retry.
- New Edge mock tests: invoice/paid-spoof/method/origin/key rejection, request size and server-only credential/RPC routing.
- New admin mocks: list/detail, escaped personalization, status-only update, private photo download, translations, logout cleanup.
- `git diff --check`.

**Not executed:** new SQL integration tests, real Work 2 admin/API/RLS integration tests, concurrent checkout integration test, Desktop/Mobile browser tests. Local browser navigation to `http://127.0.0.1:8765/` returns `net::ERR_BLOCKED_BY_CLIENT`. Unit/DOM mocks do not establish those guarantees.

No deployment approval is implied by passing local tests. Do not merge while these gates remain open.
