import { NextResponse } from "next/server"
import {
  authenticateUser,
  createSession,
  SESSION_COOKIE_NAME
} from "@/lib/server/auth"
import { consumeRateLimit, getClientIp } from "@/lib/server/rateLimit"

type LoginPayload = {
  email: string
  password: string
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const ipWindow = consumeRateLimit({
    key: `auth:login:ip:${ip}`,
    windowMs: 15 * 60 * 1000,
    max: 20
  })

  if (!ipWindow.ok) {
    return NextResponse.json(
      { ok: false, error: "Te veel loginpogingen. Probeer later opnieuw." },
      {
        status: 429,
        headers: {
          "Retry-After": String(ipWindow.retryAfterSeconds)
        }
      }
    )
  }

  let body: Partial<LoginPayload>
  try {
    body = (await request.json()) as Partial<LoginPayload>
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is ongeldig." },
      { status: 400 }
    )
  }

  const email = (body.email ?? "").trim().toLowerCase()
  const accountWindow = consumeRateLimit({
    key: `auth:login:acct:${email}:${ip}`,
    windowMs: 10 * 60 * 1000,
    max: 10
  })

  if (!accountWindow.ok) {
    return NextResponse.json(
      { ok: false, error: "Te veel loginpogingen. Probeer later opnieuw." },
      {
        status: 429,
        headers: {
          "Retry-After": String(accountWindow.retryAfterSeconds)
        }
      }
    )
  }

  const user = authenticateUser(email, body.password ?? "")
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Onjuiste inloggegevens." },
      { status: 401 }
    )
  }

  const token = createSession(user.id)
  const response = NextResponse.json({ ok: true, user })
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  })

  return response
}
