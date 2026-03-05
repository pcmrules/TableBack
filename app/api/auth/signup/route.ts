import { NextResponse } from "next/server"
import { createSession, createUser, SESSION_COOKIE_NAME } from "@/lib/server/auth"
import { consumeRateLimit, getClientIp } from "@/lib/server/rateLimit"
import { supabaseAdmin } from "@/lib/server/supabaseAdmin"

type SignupPayload = {
  name: string
  email: string
  password: string
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const ipWindow = consumeRateLimit({
    key: `auth:signup:ip:${ip}`,
    windowMs: 15 * 60 * 1000,
    max: 10
  })

  if (!ipWindow.ok) {
    return NextResponse.json(
      { ok: false, error: "Te veel signup-pogingen. Probeer later opnieuw." },
      {
        status: 429,
        headers: {
          "Retry-After": String(ipWindow.retryAfterSeconds)
        }
      }
    )
  }

  let body: Partial<SignupPayload>
  try {
    body = (await request.json()) as Partial<SignupPayload>
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is ongeldig." },
      { status: 400 }
    )
  }

  const email = (body.email ?? "").trim().toLowerCase()
  const accountWindow = consumeRateLimit({
    key: `auth:signup:email:${email}`,
    windowMs: 60 * 60 * 1000,
    max: 3
  })

  if (!accountWindow.ok) {
    return NextResponse.json(
      { ok: false, error: "Te veel signup-pogingen voor dit e-mailadres." },
      {
        status: 429,
        headers: {
          "Retry-After": String(accountWindow.retryAfterSeconds)
        }
      }
    )
  }

  const result = await createUser({
    name: body.name ?? "",
    email,
    password: body.password ?? ""
  })

  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  const restaurantName = (body.name ?? "").trim()
  let restaurantError: { message: string } | null = null

  const primaryInsert = await supabaseAdmin.from("restaurants").insert([
    {
      owner_user_id: result.user.id,
      name: restaurantName || "Nieuw restaurant",
      contact_email: result.user.email,
      billing_status: "pending"
    }
  ])

  if (primaryInsert.error) {
    const lower = primaryInsert.error.message.toLowerCase()
    const isBillingColumnMissing =
      lower.includes("billing_status") &&
      (lower.includes("does not exist") || lower.includes("column"))

    if (isBillingColumnMissing) {
      const fallbackInsert = await supabaseAdmin.from("restaurants").insert([
        {
          owner_user_id: result.user.id,
          name: restaurantName || "Nieuw restaurant",
          contact_email: result.user.email
        }
      ])
      restaurantError = fallbackInsert.error
    } else {
      restaurantError = primaryInsert.error
    }
  }

  if (restaurantError) {
    await supabaseAdmin.auth.admin.deleteUser(result.user.id)
    return NextResponse.json(
      {
        ok: false,
        error:
          restaurantError.message.includes("relation") ||
          restaurantError.message.includes("does not exist")
            ? "Tabel 'restaurants' ontbreekt in Supabase."
            : `Restaurant koppelen mislukt: ${restaurantError.message}`
      },
      { status: 500 }
    )
  }

  const token = await createSession(result.user.id)
  const response = NextResponse.json({ ok: true, user: result.user })
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
