import { NextResponse } from "next/server"
import { normalizePhone } from "@/lib/phone"
import { getPhoneConfirmation } from "@/lib/whatsappState"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"

export async function GET(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const phone = normalizePhone(searchParams.get("phone") ?? "")

  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "phone query parameter ontbreekt." },
      { status: 400 }
    )
  }

  const confirmation = getPhoneConfirmation(phone)
  return NextResponse.json({
    ok: true,
    confirmed: confirmation?.confirmed ?? false,
    declined: confirmation?.declined ?? false,
    lastReply: confirmation?.lastReply ?? null,
    updatedAt: confirmation?.updatedAt ?? null
  })
}
