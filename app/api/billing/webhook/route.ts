import { NextResponse } from "next/server"
import {
  getStripeClient,
  mapStripeSubscriptionStatus,
  updateRestaurantBillingState
} from "@/lib/server/billing"
import { supabaseAdmin } from "@/lib/server/supabaseAdmin"

async function findRestaurantIdForCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle()

  if (error || !data?.id) return null
  return String(data.id)
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "STRIPE_WEBHOOK_SECRET ontbreekt." },
      { status: 500 }
    )
  }

  const stripe = getStripeClient()
  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "Stripe signature ontbreekt." },
      { status: 400 }
    )
  }

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook validatie mislukt."
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.deleted"
  ) {
    let subscription: Stripe.Subscription | null = null
    let customerId: string | null = null

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session
      customerId = typeof session.customer === "string" ? session.customer : null
      if (typeof session.subscription === "string") {
        subscription = await stripe.subscriptions.retrieve(session.subscription)
      }
    } else {
      subscription = event.data.object as Stripe.Subscription
      customerId =
        typeof subscription.customer === "string" ? subscription.customer : null
    }

    if (subscription && customerId) {
      const restaurantId = await findRestaurantIdForCustomer(customerId)
      if (restaurantId) {
        await updateRestaurantBillingState({
          restaurantId,
          status: mapStripeSubscriptionStatus(subscription.status),
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
