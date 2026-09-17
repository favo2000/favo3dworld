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

## Migration approved and applied; browser gate still open

The user explicitly authorized keeping the legacy invoice flow temporarily during the safe transition. After a fresh successful local test run, migration `work2_unpaid_orders_shipping_and_inquiries` was applied successfully. No retry workaround was used.

Executed successfully against the production database, with all fixture/order/stock changes rolled back:

- `supabase/test-work2-orders.sql`: shipping boundaries, authoritative pricing, forged payment rejection, POD cap, inquiries, snapshots, photo quantities, stock/Scheiben behavior and guest/non-admin protection.
- `supabase/test-work2-access.sql`: real authenticated-admin read/status update; payment/snapshot modification denied; guest and other-user access denied, including private Storage rows.
- `supabase/test-product-options.sql`: regression tests for the existing live checkout after the additive migration.

After tests: 0 orders, 8 existing products, Scheiben stock 5; customer-photos/product-models remain private. No existing images/model files were changed. Existing RLS policies/grants were preserved.

`place-order-work2` was deployed as version 1 using the reviewed server implementation. Live HTTP checks passed: invoice and forged paid state return 400; missing customer returns 400; invalid application key returns 401. No real customer order/payment was submitted through HTTP. Positive order execution was tested transactionally through the database RPC.

The security advisor reports only the pre-existing disabled leaked-password-protection warning. Per user instruction it was not changed.

## Remaining release gates

1. Obtain a working draft browser preview. A repeated navigation to `http://127.0.0.1:8765/tests/responsive.html` was rejected with `net::ERR_BLOCKED_BY_CLIENT`. Desktop/mobile, actual admin login and full browser-to-API checkout are not yet verified.
2. Complete the browser tests and concurrent HTTP checkout testing without changing real customer products/orders. No merge while a test fails or a required gate remains open.
3. After all tests pass, coordinate frontend publication and invoice retirement. The new frontend uses `place-order-work2`; only PayPal/TWINT are offered and orders are unpaid.
4. Deploy the reviewed server implementation to the old `place-order` slug too, so cached clients cannot submit invoice orders. Apply `supabase/work2-retire-invoice.sql` at this release gate only: it removes the invoice default, rejects any new invoice insert and revokes execution of the old invoice RPC. Historical invoice rows, if any arrive before cutover, remain readable. This retirement migration is prepared, not applied.
5. Verify Pages, both endpoints and database retirement checks. Do not leave the invoice endpoint active after the final cutover.

The legacy function remains active only because the existing frontend has not been replaced. Disabling it now would break the live checkout. No main merge or GitHub Pages deployment has taken place.

## Verification

Executed successfully: `NODE_PATH=../favo3dworld-options/node_modules npm test` (or install the pinned development dependency and run `npm test`).

- Existing simulated admin login/CRUD/image-upload tests.
- Existing options/cart/quantity/stock/Scheiben/Pika/Cavallo/DE-FR/photo tests.
- Existing customer-photo Edge mock security tests.
- New DOM tests: shipping 10 / 79.99 / 80 / 80.01, multiple copies, unpaid receipt, retry payload identity, DE/FR, POD cap, bulk inquiry/retry.
- New Edge mock tests: invoice/paid-spoof/method/origin/key rejection, request size and server-only credential/RPC routing.
- New admin mocks: list/detail, escaped personalization, status-only update, private photo download, translations, logout cleanup.
- `git diff --check`.

**Not executed:** full browser-to-API/admin-session integration, concurrent HTTP checkout integration, Desktop/Mobile browser tests. SQL/RLS integration and negative live HTTP checks passed as described above. Local browser navigation to `http://127.0.0.1:8765/` returns `net::ERR_BLOCKED_BY_CLIENT`. Unit/DOM mocks do not establish those guarantees.

No deployment approval is implied by passing local tests. Do not merge while these gates remain open.
