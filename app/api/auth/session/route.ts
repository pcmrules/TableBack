import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import { supabaseAdmin } from "@/lib/server/supabaseAdmin"
import { getUserBillingState } from "@/lib/server/billing"

export async function GET(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const { data: restaurant, error } = await supabaseAdmin
    .from("restaurants")
    .select("id,name")
    .eq("owner_user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    )
  }

  const billing = await getUserBillingState(user.id)

  return NextResponse.json({
    ok: true,
    user,
    restaurant: restaurant ?? null,
    billing: billing
      ? {
          status: billing.status,
          paid: billing.paid
        }
      : {
          status: "pending",
          paid: false
        }
  })
}
