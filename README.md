# TableBack

TableBack is a Next.js app for reservation + waitlist management with WhatsApp automation.

## Billing Flow

- Nieuwe account: signup/login -> `/billing`
- Checkout: Stripe abonnement van EUR 149/maand
- Toegang dashboard (`/(app)`): alleen met actieve/trialing billing status

## Architecture

- UI state lives in `ReservationContext`.
- Persistence is server-side via `PUT /api/state`.
- `GET /api/state` hydrates the app from Supabase per logged-in user.
- Supabase writes use service-role only on the server (`lib/server/supabaseAdmin.ts`).
- Client uses anon key for reads/realtime only.

## Required Env Vars

Create `tableback/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<token>
TWILIO_WHATSAPP_FROM=+<jouw-goedgekeurde-whatsapp-afzender>
TWILIO_SMS_FROM=+<jouw-sms-nummer>
TWILIO_MESSAGING_SERVICE_SID=<optioneel-mgxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_STATUS_CALLBACK_URL=https://<public-domain>/api/whatsapp/status
TWILIO_WEBHOOK_URL=https://<public-domain>/api/whatsapp/webhook
TWILIO_SMS_WEBHOOK_URL=https://<public-domain>/api/sms/webhook
TWILIO_SKIP_SIGNATURE_VALIDATION=false
TWILIO_TEMPLATE_REMINDER_FIRST_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_REMINDER_FINAL_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_CONFIRMATION_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_CANCELLATION_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_WAITLIST_OFFER_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>

APP_BASE_URL=https://<public-domain>
STRIPE_SECRET_KEY=<sk_live_or_test>
STRIPE_PRICE_ID_149_MONTHLY=<price_xxx>
STRIPE_WEBHOOK_SECRET=<whsec_xxx>
```

Notes:

- Gebruik in productie je eigen goedgekeurde WhatsApp sender; niet het Twilio sandbox nummer `+14155238886`.
- Zet minimaal `TWILIO_WHATSAPP_FROM` of `TWILIO_MESSAGING_SERVICE_SID` (beide mag ook).
- Voor pure SMS zonder Messaging Service: zet `TWILIO_SMS_FROM`.
- Voor inbound SMS replies: zet in Twilio de webhook naar `/api/sms/webhook` (of configureer `TWILIO_SMS_WEBHOOK_URL` voor signature-validatie).
- Tijdelijke debug: zet `TWILIO_SKIP_SIGNATURE_VALIDATION=true` om te testen of webhook-verwerking werkt zonder signature-check.
- Zonder inbound SMS-capability kunnen gasten nog steeds bevestigen via link: `/api/sms/respond?phone=...&action=yes|no`.
- Voor business/production WhatsApp zijn template-berichten nodig buiten het 24-uurs venster na laatste klantreactie.
- Als je `TWILIO_TEMPLATE_*_SID` zet, verstuurt de app automatisch via `ContentSid` i.p.v. vrije tekst.
- Stripe checkout endpoint: `POST /api/billing/checkout`
- Stripe webhook endpoint: `POST /api/billing/webhook`
- Stripe portal endpoint: `POST /api/billing/portal`
- Stripe cancel endpoint: `POST /api/billing/cancel`

## Run Locally

```bash
npm install
npm run dev
```

App runs on `http://localhost:3000`.

## Supabase Expectations

Tables:

- `public.reservations`
- `public.waitlist`
- `public.settings`
- `public.restaurants`

Minimum columns:

- all tables: `id` (UUID or numeric primary key) and `user_id` (text/uuid)
- `reservations`: `name`, `phone`, `time`, `created_at`, `party_size`, `status`, `filled_from_waitlist`, `original_guest_name`, `estimated_revenue`, `reminder_count`, `last_reminder_at`
- `waitlist`: `name`, `phone`, `party_size`, `status`, `created_at`, `last_contacted_at`
- `settings`: `first_reminder_minutes_before`, `final_reminder_minutes_before`, `no_show_threshold_minutes`, `waitlist_response_minutes`, `preferred_channel`
- `restaurants`: `owner_user_id`, `name`, `billing_status`, `stripe_customer_id`, `stripe_subscription_id`

### SQL migration voor billing

```sql
alter table public.restaurants
  add column if not exists billing_status text not null default 'pending',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.restaurants
  drop constraint if exists restaurants_billing_status_check;

alter table public.restaurants
  add constraint restaurants_billing_status_check
  check (billing_status in ('pending', 'active', 'trialing', 'past_due', 'canceled'));
```

Recommended:

- unique constraint/index on `settings(user_id)`
- realtime publication enabled for `reservations`, `waitlist`, `settings`

## Health Check

Use:

- `GET /api/health/db`

Returns DB read status for the logged-in user. Useful to verify session + server Supabase connectivity.

## Notes

- Table Editor in Supabase dashboard is not a reliable realtime UI; manual refresh there is normal.
- Realtime should be validated in two app tabs (change in tab A appears in tab B).
