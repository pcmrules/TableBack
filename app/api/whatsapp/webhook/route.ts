import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { normalizePhone } from "@/lib/phone"
import { getPhoneConfirmation, setPhoneConfirmation } from "@/lib/whatsappState"

const POSITIVE_REPLIES = new Set(["JA", "YES", "Y", "OK", "BEVESTIG"])
const NEGATIVE_REPLIES = new Set([
  "NEE",
  "NO",
  "N",
  "CANCEL",
  "ANNULEER",
  "ANNULEREN"
])

function isPositiveReply(input: string): boolean {
  const cleaned = normalizeReply(input)

  if (!cleaned) return false
  if (POSITIVE_REPLIES.has(cleaned)) return true

  const firstToken = cleaned.split(" ")[0]
  return POSITIVE_REPLIES.has(firstToken)
}

function isNegativeReply(input: string): boolean {
  const cleaned = normalizeReply(input)

  if (!cleaned) return false
  if (NEGATIVE_REPLIES.has(cleaned)) return true

  const firstToken = cleaned.split(" ")[0]
  return NEGATIVE_REPLIES.has(firstToken)
}

function normalizeReply(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function createTwilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const sortedKeys = Object.keys(params).sort()
  let payload = url
  for (const key of sortedKeys) {
    payload += `${key}${params[key]}`
  }

  return crypto
    .createHmac("sha1", authToken)
    .update(payload, "utf8")
    .digest("base64")
}

function timingSafeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  if (leftBytes.length !== rightBytes.length) return false
  return crypto.timingSafeEqual(leftBytes, rightBytes)
}

function buildSignatureUrls(request: Request): string[] {
  const urls = new Set<string>()
  urls.add(request.url)

  const configuredWebhookUrl = process.env.TWILIO_WEBHOOK_URL?.trim()
  if (configuredWebhookUrl) {
    urls.add(configuredWebhookUrl)
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") ?? "https"
  if (host) {
    const current = new URL(request.url)
    urls.add(`${proto}://${host}${current.pathname}${current.search}`)
  }

  return [...urls]
}

export async function POST(request: Request) {
  const twilioSignature = request.headers.get("x-twilio-signature")?.trim() ?? ""
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    return NextResponse.json(
      { ok: false, error: "TWILIO_AUTH_TOKEN ontbreekt voor webhook-validatie." },
      { status: 500 }
    )
  }
  if (!twilioSignature) {
    return NextResponse.json(
      { ok: false, error: "Twilio signature ontbreekt." },
      { status: 403 }
    )
  }

  const formData = await request.formData()
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      params[key] = value
    }
  }

  const signatureUrls = buildSignatureUrls(request)
  const isValid = signatureUrls.some(url =>
    timingSafeEquals(createTwilioSignature(url, params, authToken), twilioSignature)
  )

  if (!isValid) {
    return NextResponse.json(
      { ok: false, error: "Ongeldige Twilio signature." },
      { status: 403 }
    )
  }

  const from = normalizePhone(String(formData.get("From") ?? ""))
  const incomingBody = String(formData.get("Body") ?? "").trim()
  const currentRecord = from ? getPhoneConfirmation(from) : null
  const currentConversationType = currentRecord?.conversationType
  const offerExpired =
    currentConversationType === "waitlist_offer" &&
    typeof currentRecord?.offerExpiresAt === "number" &&
    Date.now() > currentRecord.offerExpiresAt
  const offerClosed =
    currentConversationType === "waitlist_offer" &&
    currentRecord?.offerClosed === true

  const confirmed = isPositiveReply(incomingBody)
  const declined = !confirmed && isNegativeReply(incomingBody)
  if (from) {
    if (currentConversationType === "waitlist_offer" && (offerClosed || offerExpired)) {
      setPhoneConfirmation(from, {
        confirmed: false,
        declined: false,
        lastReply: incomingBody,
        updatedAt: Date.now(),
        conversationType: "waitlist_offer",
        offerExpiresAt: currentRecord?.offerExpiresAt ?? null,
        offerClosed: true
      })
    } else {
      setPhoneConfirmation(from, {
        confirmed,
        declined,
        lastReply: incomingBody,
        updatedAt: Date.now(),
        conversationType: currentConversationType ?? "reservation_confirmation",
        offerExpiresAt: currentRecord?.offerExpiresAt ?? null,
        offerClosed:
          currentConversationType === "waitlist_offer" && (confirmed || declined)
      })
    }
  }

  const replyText =
    currentConversationType === "waitlist_offer"
      ? offerClosed || offerExpired
        ? "Sorry, deze tafel is reeds ingevuld."
        : confirmed
          ? "Top, de tafel is voor jou. Tot zo."
          : declined
            ? "Geen probleem, we bieden de tafel verder aan. Bedankt voor je reactie."
            : "Dank je. Antwoord met JA om de tafel te nemen of NEE om over te slaan."
      : confirmed
        ? "Top, je antwoord is bevestigd. Tot straks."
        : declined
          ? "Je annulering is ontvangen. Bedankt voor het laten weten."
          : "Dank je. Antwoord met JA om te bevestigen of NEE om te annuleren."

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(replyText)}</Message></Response>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml"
    }
  })
}
