import { NextResponse } from "next/server"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"

export async function GET(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  return NextResponse.json({ ok: true, user })
}
