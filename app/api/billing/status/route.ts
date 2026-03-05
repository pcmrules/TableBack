import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import { getStripeClient, getUserBillingState } from "@/lib/server/billing"
import Stripe from "stripe"

export async function GET(request: Request) {
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

  let nextPaymentAt: string | null = null
  let cancelAtPeriodEnd = false
  let customerSince: string | null = null

  try {
    if (billing.stripeCustomerId || billing.stripeSubscriptionId) {
      const stripe = getStripeClient()

      if (billing.stripeCustomerId) {
        const customer = await stripe.customers.retrieve(billing.stripeCustomerId)
        if (customer && !("deleted" in customer)) {
          customerSince = new Date(customer.created * 1000).toISOString()
        }
      }

      if (billing.stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(
          billing.stripeSubscriptionId
        )
        const sub = ("data" in subscription ? subscription.data : subscription) as {
          current_period_end?: number
          cancel_at_period_end?: boolean
        }
        nextPaymentAt =
          typeof sub.current_period_end === "number"
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null
        cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end)
      } else if (billing.stripeCustomerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: billing.stripeCustomerId,
          status: "all",
          limit: 1
        })
        const sub = subscriptions.data[0] as
          | (Stripe.Subscription & { current_period_end?: number })
          | undefined
        if (sub) {
          nextPaymentAt =
            typeof sub.current_period_end === "number"
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null
          cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end)
        }
      }
    }
  } catch {
    // Best effort details; billing gate relies on Supabase billing status.
  }

  return NextResponse.json({
    ok: true,
    billing: {
      status: billing.status,
      paid: billing.paid,
      restaurantName: billing.restaurantName,
      customerSince,
      nextPaymentAt,
      cancelAtPeriodEnd
    }
  })
}
