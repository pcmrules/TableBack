import { NextResponse } from "next/server"
import { normalizePhone } from "@/lib/phone"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"

type SendSmsPayload = {
  to: string
  message: string
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  let body: Partial<SendSmsPayload>
  try {
    body = (await request.json()) as Partial<SendSmsPayload>
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is ongeldig." },
      { status: 400 }
    )
  }

  const to = body.to?.trim()
  const message = body.message?.trim()

  if (!to || !message) {
    return NextResponse.json(
      { ok: false, error: "to en message zijn verplicht." },
      { status: 400 }
    )
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_SMS_FROM
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL

  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Twilio env ontbreekt. Zet TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN en TWILIO_SMS_FROM of TWILIO_MESSAGING_SERVICE_SID."
      },
      { status: 500 }
    )
  }

  const normalizedTo = normalizePhone(to)
  const normalizedFrom = from ? normalizePhone(from) : ""
  if (!normalizedTo || (from && !normalizedFrom)) {
    return NextResponse.json(
      { ok: false, error: "Ongeldig telefoonnummer voor SMS." },
      { status: 400 }
    )
  }

  const form = new URLSearchParams()
  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid)
  } else {
    form.set("From", normalizedFrom)
  }
  form.set("To", normalizedTo)
  form.set("Body", message)
  if (statusCallbackUrl?.trim()) {
    form.set("StatusCallback", statusCallbackUrl.trim())
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    }
  )

  const data = await response.json()
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: data?.message ?? "SMS verzending mislukt." },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, sid: data.sid })
}
