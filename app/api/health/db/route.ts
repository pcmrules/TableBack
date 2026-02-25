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

  const [settingsProbe, reservationsProbe, waitlistProbe] = await Promise.all([
    supabaseAdmin
      .from("settings")
      .select("id")
      .eq("user_id", user.id)
      .limit(1),
    supabaseAdmin
      .from("reservations")
      .select("id")
      .eq("user_id", user.id)
      .limit(1),
    supabaseAdmin
      .from("waitlist")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
  ])

  const firstError =
    settingsProbe.error ?? reservationsProbe.error ?? waitlistProbe.error

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
      waitlist: "ok"
    }
  })
}

