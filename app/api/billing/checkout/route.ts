import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import {
  getBaseUrl,
  getStripeClient,
  getUserBillingState,
  updateRestaurantBillingState
} from "@/lib/server/billing"

export async function POST(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  const billing = await getUserBillingState(user.id)
  if (!billing) {
    return NextResponse.json(
      { ok: false, error: "Geen restaurant gekoppeld aan deze gebruiker." },
      { status: 400 }
    )
  }

  if (billing.paid) {
    return NextResponse.json({ ok: true, url: "/dashboard" })
  }

  const priceId = process.env.STRIPE_PRICE_ID_149_MONTHLY?.trim()
  if (!priceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "STRIPE_PRICE_ID_149_MONTHLY ontbreekt. Configureer je Stripe price ID."
      },
      { status: 500 }
    )
  }

  const stripe = getStripeClient()
  const baseUrl = getBaseUrl()

  const customer =
    billing.stripeCustomerId
      ? await stripe.customers.retrieve(billing.stripeCustomerId).catch(() => null)
      : null

  const customerId =
    customer && !("deleted" in customer)
      ? customer.id
      : (
          await stripe.customers.create({
            email: user.email,
            name: billing.restaurantName,
            metadata: {
              user_id: user.id,
              restaurant_id: billing.restaurantId
            }
          })
        ).id

  await updateRestaurantBillingState({
    restaurantId: billing.restaurantId,
    status: billing.status,
    stripeCustomerId: customerId
  })

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/billing?success=1`,
    cancel_url: `${baseUrl}/billing?canceled=1`,
    allow_promotion_codes: true,
    metadata: {
      user_id: user.id,
      restaurant_id: billing.restaurantId
    }
  })

  if (!session.url) {
    return NextResponse.json(
      { ok: false, error: "Kon geen Stripe checkout URL aanmaken." },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, url: session.url })
}
