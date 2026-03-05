import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import {
  getStripeClient,
  getUserBillingState,
  mapStripeSubscriptionStatus,
  updateRestaurantBillingState
} from "@/lib/server/billing"

export async function POST(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  const billing = await getUserBillingState(user.id)
  if (!billing?.stripeSubscriptionId) {
    return NextResponse.json(
      { ok: false, error: "Geen actief abonnement gevonden." },
      { status: 400 }
    )
  }

  const stripe = getStripeClient()
  const subscription = await stripe.subscriptions.update(billing.stripeSubscriptionId, {
    cancel_at_period_end: true
  })

  await updateRestaurantBillingState({
    restaurantId: billing.restaurantId,
    status: mapStripeSubscriptionStatus(subscription.status),
    stripeCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : null,
    stripeSubscriptionId: subscription.id
  })

  return NextResponse.json({
    ok: true,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
  })
}
