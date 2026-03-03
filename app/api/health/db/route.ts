import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import { supabaseAdmin } from "@/lib/server/supabaseAdmin"

export async function GET(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Niet ingelogd." },
      { status: 401 }
    )
  }

  const { data: restaurant, error: restaurantLookupError } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle()

  if (restaurantLookupError) {
    return NextResponse.json(
      { ok: false, error: restaurantLookupError.message, userId: user.id },
      { status: 500 }
    )
  }
  if (!restaurant?.id) {
    return NextResponse.json(
      { ok: false, error: "Geen restaurant gekoppeld.", userId: user.id },
      { status: 400 }
    )
  }

  const [settingsProbe, reservationsProbe, waitlistProbe, restaurantsProbe] = await Promise.all([
    supabaseAdmin
      .from("settings")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .limit(1),
    supabaseAdmin
      .from("reservations")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .limit(1),
    supabaseAdmin
      .from("waitlist")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .limit(1),
    supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("owner_user_id", user.id)
      .limit(1)
  ])

  const firstError =
    settingsProbe.error ??
    reservationsProbe.error ??
    waitlistProbe.error ??
    restaurantsProbe.error

  if (firstError) {
    return NextResponse.json(
      {
        ok: false,
        error: firstError.message,
        userId: user.id
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    checks: {
      settings: "ok",
      reservations: "ok",
      waitlist: "ok",
      restaurants: "ok"
    }
  })
}
