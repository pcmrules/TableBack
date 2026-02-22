import { NextResponse } from "next/server"
import { normalizePhone, toWhatsAppAddress } from "@/lib/phone"
import { setPhoneConfirmation } from "@/lib/whatsappState"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import type { WhatsAppConversationType } from "@/lib/whatsappState"

type SendPayload = {
  to: string
  message: string
  conversationType?: WhatsAppConversationType
  offerExpiresAt?: number
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  let body: Partial<SendPayload>
  try {
    body = (await request.json()) as Partial<SendPayload>
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is ongeldig." },
      { status: 400 }
    )
  }

  const to = body.to?.trim()
  const message = body.message?.trim()
  const conversationType =
    body.conversationType === "waitlist_offer"
      ? "waitlist_offer"
      : "reservation_confirmation"
  const offerExpiresAt =
    conversationType === "waitlist_offer" &&
    typeof body.offerExpiresAt === "number" &&
    Number.isFinite(body.offerExpiresAt) &&
    body.offerExpiresAt > Date.now()
      ? body.offerExpiresAt
      : null

  if (!to || !message) {
    return NextResponse.json(
      { ok: false, error: "to en message zijn verplicht." },
      { status: 400 }
    )
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  if (!accountSid || !authToken || !from) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Twilio env ontbreekt. Zet TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN en TWILIO_WHATSAPP_FROM."
      },
      { status: 500 }
    )
  }

  const normalizedTo = normalizePhone(to)
  const normalizedFrom = normalizePhone(from)
  if (!normalizedTo || !normalizedFrom) {
    return NextResponse.json(
      { ok: false, error: "Ongeldig telefoonnummer voor WhatsApp." },
      { status: 400 }
    )
  }

  const form = new URLSearchParams()
  form.set("From", toWhatsAppAddress(normalizedFrom))
  form.set("To", toWhatsAppAddress(normalizedTo))
  form.set("Body", message)

  setPhoneConfirmation(normalizedTo, {
    confirmed: false,
    declined: false,
    lastReply: "",
    updatedAt: Date.now(),
    conversationType,
    offerExpiresAt,
    offerClosed: false
  })

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
      { ok: false, error: data?.message ?? "Twilio verzending mislukt." },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, sid: data.sid })
}
