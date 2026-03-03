import { normalizePhone } from "@/lib/phone"
import { getPhoneConfirmation, setPhoneConfirmation } from "@/lib/whatsappState"

function html(message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>TableBack</title><style>body{font-family:Arial,Helvetica,sans-serif;background:#f7f7f7;color:#1f3d2b;margin:0;padding:24px}.card{max-width:520px;margin:40px auto;background:#fff;border:1px solid #e6e6e6;border-radius:12px;padding:20px}h1{margin:0 0 10px;font-size:22px}p{margin:0;line-height:1.45}</style></head><body><div class="card"><h1>TableBack</h1><p>${message}</p></div></body></html>`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const phone = normalizePhone(searchParams.get("phone") ?? "")
  const action = (searchParams.get("action") ?? "").trim().toLowerCase()

  if (!phone || (action !== "yes" && action !== "no")) {
    return new Response(html("Ongeldige link."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  }

  const currentRecord = getPhoneConfirmation(phone)
  const currentConversationType = currentRecord?.conversationType ?? "reservation_confirmation"
  const offerExpired =
    currentConversationType === "waitlist_offer" &&
    typeof currentRecord?.offerExpiresAt === "number" &&
    Date.now() > currentRecord.offerExpiresAt
  const offerClosed =
    currentConversationType === "waitlist_offer" &&
    currentRecord?.offerClosed === true

  if (currentConversationType === "waitlist_offer" && (offerClosed || offerExpired)) {
    setPhoneConfirmation(phone, {
      confirmed: false,
      declined: false,
      lastReply: action.toUpperCase(),
      updatedAt: Date.now(),
      conversationType: "waitlist_offer",
      offerExpiresAt: currentRecord?.offerExpiresAt ?? null,
      offerClosed: true
    })
    return new Response(html("Deze tafel is helaas al ingevuld."), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    })
  }

  const confirmed = action === "yes"
  const declined = action === "no"
  setPhoneConfirmation(phone, {
    confirmed,
    declined,
    lastReply: action.toUpperCase(),
    updatedAt: Date.now(),
    conversationType: currentConversationType,
    offerExpiresAt: currentRecord?.offerExpiresAt ?? null,
    offerClosed: currentConversationType === "waitlist_offer" && (confirmed || declined)
  })

  const message =
    currentConversationType === "waitlist_offer"
      ? confirmed
        ? "Top, de tafel is voor jou. Tot zo."
        : "Geen probleem, we bieden de tafel verder aan."
      : confirmed
        ? "Top, je reservatie is bevestigd. Tot straks."
        : "Je annulering is ontvangen. Bedankt voor het laten weten."

  return new Response(html(message), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  })
}
