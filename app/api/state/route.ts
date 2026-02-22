import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import {
  loadUserState,
  saveUserState,
  type PersistedAppState
} from "@/lib/server/stateStore"

export async function GET(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  const state = loadUserState(user.id)
  return NextResponse.json({ ok: true, state })
}

export async function PUT(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  let body: Partial<PersistedAppState>
  try {
    body = (await request.json()) as Partial<PersistedAppState>
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is ongeldig." },
      { status: 400 }
    )
  }

  const current = loadUserState(user.id)
  saveUserState(user.id, {
    reservations: Array.isArray(body.reservations)
      ? body.reservations
      : current.reservations,
    waitlist: Array.isArray(body.waitlist) ? body.waitlist : current.waitlist,
    reminderSettings: body.reminderSettings ?? current.reminderSettings,
    automationSettings: body.automationSettings ?? current.automationSettings
  })

  return NextResponse.json({ ok: true })
}
