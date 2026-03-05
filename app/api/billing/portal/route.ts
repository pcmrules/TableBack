import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import { getBaseUrl, getStripeClient, getUserBillingState } from "@/lib/server/billing"

export async function POST(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  const billing = await getUserBillingState(user.id)
  if (!billing?.stripeCustomerId) {
    return NextResponse.json(
      { ok: false, error: "Geen Stripe klant gekoppeld." },
      { status: 400 }
    )
  }

  const stripe = getStripeClient()
  const baseUrl = getBaseUrl()
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${baseUrl}/settings`
  })

  return NextResponse.json({ ok: true, url: session.url })
}
