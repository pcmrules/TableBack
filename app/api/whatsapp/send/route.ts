import { NextResponse } from "next/server"
import { normalizePhone, toWhatsAppAddress } from "@/lib/phone"
import { setPhoneConfirmation } from "@/lib/whatsappState"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import type { WhatsAppConversationType } from "@/lib/whatsappState"

type SendPayload = {
  to: string
  message?: string
  conversationType?: WhatsAppConversationType
  offerExpiresAt?: number
  templateKey?:
    | "reminder_first"
    | "reminder_final"
    | "confirmation"
    | "cancellation"
    | "waitlist_offer"
  templateVariables?: Record<string, string | number | boolean>
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
  const templateKey = body.templateKey
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

  if (!to || (!message && !templateKey)) {
    return NextResponse.json(
      { ok: false, error: "to en message/templateKey zijn verplicht." },
      { status: 400 }
    )
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL
  const templateSidByKey: Record<
    NonNullable<SendPayload["templateKey"]>,
    string | undefined
  > = {
    reminder_first: process.env.TWILIO_TEMPLATE_REMINDER_FIRST_SID,
    reminder_final: process.env.TWILIO_TEMPLATE_REMINDER_FINAL_SID,
    confirmation: process.env.TWILIO_TEMPLATE_CONFIRMATION_SID,
    cancellation: process.env.TWILIO_TEMPLATE_CANCELLATION_SID,
    waitlist_offer: process.env.TWILIO_TEMPLATE_WAITLIST_OFFER_SID
  }

  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Twilio env ontbreekt. Zet TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN en TWILIO_WHATSAPP_FROM of TWILIO_MESSAGING_SERVICE_SID."
      },
      { status: 500 }
    )
  }

  const normalizedTo = normalizePhone(to)
  const normalizedFrom = from ? normalizePhone(from) : ""
  if (!normalizedTo || (from && !normalizedFrom)) {
    return NextResponse.json(
      { ok: false, error: "Ongeldig telefoonnummer voor WhatsApp." },
      { status: 400 }
    )
  }

  const form = new URLSearchParams()
  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid)
  } else {
    form.set("From", toWhatsAppAddress(normalizedFrom))
  }
  form.set("To", toWhatsAppAddress(normalizedTo))

  if (templateKey) {
    const templateSid = templateSidByKey[templateKey]
    if (!templateSid) {
      return NextResponse.json(
        {
          ok: false,
          error: `Template SID ontbreekt voor ${templateKey}. Zet de juiste TWILIO_TEMPLATE_*_SID env variabele.`
        },
        { status: 500 }
      )
    }

    form.set("ContentSid", templateSid)
    if (body.templateVariables && Object.keys(body.templateVariables).length > 0) {
      form.set("ContentVariables", JSON.stringify(body.templateVariables))
    }
  } else if (message) {
    form.set("Body", message)
  }

  if (statusCallbackUrl?.trim()) {
    form.set("StatusCallback", statusCallbackUrl.trim())
  }

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
