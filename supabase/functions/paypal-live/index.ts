import { paypalHandler } from '../_shared/paypal.ts';
Deno.serve(paypalHandler('live'));
