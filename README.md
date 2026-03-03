# TableBack

TableBack is a Next.js app for reservation + waitlist management with WhatsApp automation.

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
TWILIO_TEMPLATE_REMINDER_FIRST_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_REMINDER_FINAL_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_CONFIRMATION_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_CANCELLATION_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
TWILIO_TEMPLATE_WAITLIST_OFFER_SID=<optioneel-hxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>
```

Notes:

- Gebruik in productie je eigen goedgekeurde WhatsApp sender; niet het Twilio sandbox nummer `+14155238886`.
- Zet minimaal `TWILIO_WHATSAPP_FROM` of `TWILIO_MESSAGING_SERVICE_SID` (beide mag ook).
- Voor pure SMS zonder Messaging Service: zet `TWILIO_SMS_FROM`.
- Voor business/production WhatsApp zijn template-berichten nodig buiten het 24-uurs venster na laatste klantreactie.
- Als je `TWILIO_TEMPLATE_*_SID` zet, verstuurt de app automatisch via `ContentSid` i.p.v. vrije tekst.

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

Minimum columns:

- all tables: `id` (UUID or numeric primary key) and `user_id` (text/uuid)
- `reservations`: `name`, `phone`, `time`, `created_at`, `party_size`, `status`, `filled_from_waitlist`, `original_guest_name`, `estimated_revenue`, `reminder_count`, `last_reminder_at`
- `waitlist`: `name`, `phone`, `party_size`, `status`, `created_at`, `last_contacted_at`
- `settings`: `first_reminder_minutes_before`, `final_reminder_minutes_before`, `no_show_threshold_minutes`, `waitlist_response_minutes`, `preferred_channel`

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
