# PayPal Live — 2026-09-18

Small extension of PR #4; existing order validation, shipping, stock, customer photos, admin and design remain unchanged.

- Normal shop: `paypal-live` endpoint and `PAYPAL_LIVE_CLIENT_ID` / `PAYPAL_LIVE_CLIENT_SECRET` server environment only.
- `?paypal=sandbox`: existing Sandbox credentials and provider, separate endpoint/session receipt/capability. Legacy Sandbox return links remain supported.
- Shared provider implementation verifies local order identity, authoritative CHF total and completed final capture. Cancel/failure/pending does not mark paid.
- Payment environment is immutable once reserved. Service-only RPCs prevent cross-environment attachment or confirmation. Existing Sandbox RPC signatures remain available.
- No TWINT integration, payment SDK or new dependency.

## Applied backend and tests

- Migration `paypal_live_environment_isolation` (`supabase/paypal-live.sql`). No product/order data migration or RLS/Storage policy change.
- Deployed `paypal-sandbox` and `paypal-live` from the shared handler.
- Both health requests returned HTTP 200 and connected=true through actual PayPal OAuth. Health creates no order and captures no payment.
- Full local npm test suite passed (DOM/provider mocks, not a real browser checkout).
- SQL rollback tests passed: Work 2 orders/access, existing Sandbox and new Live environment isolation.
- Security advisor: only the existing leaked-password-protection warning; deliberately unchanged.
- No automatic real payment was created, captured or assumed successful. Manual Live payment remains outstanding.

## Manual Live test after frontend publication

1. Open https://favo2000.github.io/favo3dworld/ without `?paypal=sandbox` in the same browser tab throughout.
2. Choose one inexpensive product and quantity 1. Review subtotal, CHF 5 shipping below CHF 80, and final total.
3. Enter genuine delivery details, select PayPal, click “Mit PayPal bezahlen” then “PayPal öffnen”.
4. Confirm the actual CHF total at www.paypal.com using a buyer account distinct from the receiving merchant account. This is a real charge.
5. Return to the shop in the same tab. Wait for “PayPal-Zahlung bestätigt”; if verification is still pending, use “PayPal-Zahlung prüfen” instead of placing a second order.
6. Check the same order number, paid status, CHF total and items in Admin → Bestellungen and the transaction in the merchant PayPal account.
7. Report the order number and result only; never share credentials, tokens or customer photos.

For a cancellation check, cancel at PayPal before confirming payment. The order must remain unpaid. Existing stock reservation/order behavior is unchanged; cancellation does not automatically delete a shop order.

Sandbox remains available at https://favo2000.github.io/favo3dworld/?paypal=sandbox and is explicitly labelled test money.

Recovery reference before this change: `backup/before-paypal-live-20260918` at `0ca450e1bf72420857e32bad84919dca8864d739`. Keep the additive environment protections if reverting the frontend; do not downgrade/delete payment records.
