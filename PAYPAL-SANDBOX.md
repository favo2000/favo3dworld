# PayPal Sandbox only

Test link: `https://favo2000.github.io/favo3dworld/?paypal=sandbox`

Only this opt-in link activates the PayPal test flow. The ordinary Work 2 checkout remains unchanged. TWINT is not integrated. No live PayPal endpoint or credentials are used. No stylesheets/colors were changed.

The existing `submit_shop_order` RPC still validates products, configurations, photos, quantities, prices, shipping and stock. The new `paypal-sandbox` Edge Function creates a PayPal order from the stored CHF total. After buyer approval it verifies the linked PayPal order, captures on the server, reads the capture back and verifies COMPLETED, final capture, currency, amount and the shop reference before recording paid. An unapproved, cancelled, pending or mismatched payment cannot mark an order paid. Retries reuse the shop request and PayPal IDs.

The new Orders columns are `payment_environment`, `paypal_order_id` and `paypal_capture_id`. The two payment RPCs are service-role only. Existing RLS and status-only admin grants remain. Sandbox payments are labelled in admin details. Stock is deducted once by the existing order submission; payment retries do not deduct it again. Abandoning a payment does not automatically cancel/restock the saved order, matching the existing Work 2 order behavior.

The guest payment capability is an HMAC tied to the request key. It is returned only after the original order payload is validated and kept in sessionStorage for return/retry. No customer address or secret is stored there. PayPal's return query is never accepted as proof of payment. No PayPal SDK/client secret is sent to the browser. Only server environment variables `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` are read. No secrets or provider response bodies are logged.

## Verification completed

- Existing local regression tests, new PayPal server mocks and DE/FR DOM tests pass.
- PayPal SQL tests pass and roll back: unpaid association, wrong reference/currency/amount rejection, confirmation/idempotency and privilege checks.
- Existing Work 2 SQL and admin/guest/RLS tests still pass.
- Live Sandbox OAuth succeeded with configured secrets.
- Actual PayPal Sandbox order creation succeeded: Frugo CHF 15 + CHF 5 shipping = CHF 20.
- Repeating create reused the same order; capture without buyer approval remained unpaid; wrong capability was rejected.
- The technical fixture `FW-20260917-ACE01DB5107E43178EC83FD9CEC14552` is retained as **Storniert / unpaid / sandbox**. It used a POD item; no stock or existing customer files were changed.
- Security advisor has only the previously known password-leak-protection warning, left unchanged.

## Manual acceptance test still required

1. Open the test link in the browser you will use for PayPal; select DE or FR.
2. Add a product (e.g. Frugo, 50 cm, quantity 1), open checkout and enter test customer details. Select PayPal.
3. Click **Mit PayPal Sandbox testen / Tester avec PayPal Sandbox**. Verify the subtotal/shipping/total, then **PayPal Sandbox öffnen / Ouvrir PayPal Sandbox**.
4. Sign in with a **personal PayPal Sandbox buyer account** associated with the developer environment and approve the test payment. This uses test funds, not real money.
5. Return in the same browser tab. The shop should display **Sandbox-Testzahlung bestätigt / paiement test Sandbox confirmé**. If the result is still pending, click **Sandbox-Zahlung prüfen / Vérifier le paiement Sandbox**, without creating another order.
6. In the existing Admin → Bestellungen view, open that order: payment should be Bezahlt/Payé and explicitly labelled Sandbox, with correct totals/configuration/photo references.
7. For a separate cancellation test, cancel on PayPal before approval: the associated order must remain unpaid. Do not mark test orders shipped or fulfil them.

Actual buyer approval/capture is not claimed as tested until this manual step succeeds. No browser preview attempts were made. No webhook/refund/live-payment/TWINT features were added.

Recovery branch: `backup/before-paypal-sandbox`. Removing the new script and checkout opt-in branch disables the UI without altering existing order data. Do not delete payment/order records for rollback.
