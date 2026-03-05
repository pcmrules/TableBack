import Stripe from "stripe"
import { supabaseAdmin } from "@/lib/server/supabaseAdmin"

export type BillingStatus = "pending" | "active" | "trialing" | "past_due" | "canceled"

export type UserBillingState = {
  restaurantId: string
  restaurantName: string
  status: BillingStatus
  paid: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

function isMissingBillingColumnError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("billing_status") ||
    lower.includes("stripe_customer_id") ||
    lower.includes("stripe_subscription_id")
  )
}

function toBillingStatus(input: unknown): BillingStatus {
  if (input === "active") return "active"
  if (input === "trialing") return "trialing"
  if (input === "past_due") return "past_due"
  if (input === "canceled") return "canceled"
  return "pending"
}

export function isPaidStatus(status: BillingStatus): boolean {
  return status === "active" || status === "trialing"
}

export function isAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false

  if (normalized === "thomas.zgeel@gmail.com") {
    return true
  }

  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)

  return fromEnv.includes(normalized)
}

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): BillingStatus {
  if (status === "active") return "active"
  if (status === "trialing") return "trialing"
  if (status === "past_due") return "past_due"
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "canceled"
  }
  return "pending"
}

export async function getUserBillingState(userId: string): Promise<UserBillingState | null> {
  const primaryLookup = await supabaseAdmin
    .from("restaurants")
    .select("id,name,billing_status,stripe_customer_id,stripe_subscription_id")
    .eq("owner_user_id", userId)
    .maybeSingle()

  if (!primaryLookup.error && primaryLookup.data?.id) {
    const status = toBillingStatus(primaryLookup.data.billing_status)
    return {
      restaurantId: String(primaryLookup.data.id),
      restaurantName: String(primaryLookup.data.name ?? "Restaurant"),
      status,
      paid: isPaidStatus(status),
      stripeCustomerId: primaryLookup.data.stripe_customer_id
        ? String(primaryLookup.data.stripe_customer_id)
        : null,
      stripeSubscriptionId: primaryLookup.data.stripe_subscription_id
        ? String(primaryLookup.data.stripe_subscription_id)
        : null
    }
  }

  if (
    primaryLookup.error &&
    !isMissingBillingColumnError(primaryLookup.error.message)
  ) {
    throw new Error(primaryLookup.error.message)
  }

  const fallbackLookup = await supabaseAdmin
    .from("restaurants")
    .select("id,name")
    .eq("owner_user_id", userId)
    .maybeSingle()

  if (fallbackLookup.error || !fallbackLookup.data?.id) {
    return null
  }

  return {
    restaurantId: String(fallbackLookup.data.id),
    restaurantName: String(fallbackLookup.data.name ?? "Restaurant"),
    status: "pending",
    paid: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null
  }
}

export async function updateRestaurantBillingState(params: {
  restaurantId: string
  status: BillingStatus
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
}) {
  const payload: Record<string, string | null> = {
    billing_status: params.status
  }
  if (params.stripeCustomerId !== undefined) {
    payload.stripe_customer_id = params.stripeCustomerId
  }
  if (params.stripeSubscriptionId !== undefined) {
    payload.stripe_subscription_id = params.stripeSubscriptionId
  }

  const { error } = await supabaseAdmin
    .from("restaurants")
    .update(payload)
    .eq("id", params.restaurantId)

  if (error && !isMissingBillingColumnError(error.message)) {
    throw new Error(error.message)
  }
}

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY ontbreekt.")
  }
  return new Stripe(secretKey)
}

export function getBaseUrl(): string {
  const explicitUrl = process.env.APP_BASE_URL?.trim()
  if (explicitUrl) return explicitUrl.replace(/\/$/, "")

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim()
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`
    return normalized.replace(/\/$/, "")
  }

  return "http://localhost:3000"
}
