import crypto from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/server/supabaseAdmin"

type CookieGetter = {
  get: (name: string) => { value: string } | undefined
}

export type AuthUser = {
  id: string
  name: string
  email: string
}

type SessionPayload = {
  sub: string
  name: string
  email: string
  exp: number
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_COOKIE_NAME = "tableback_session"
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toSafeUser(input: {
  id: string
  email?: string | null
  user_metadata?: { name?: unknown } | null
}): AuthUser {
  const metadataName =
    typeof input.user_metadata?.name === "string"
      ? input.user_metadata.name
      : ""
  const email = input.email ?? ""
  const fallbackName = email.split("@")[0] || "Gebruiker"

  return {
    id: input.id,
    email,
    name: metadataName.trim() || fallbackName
  }
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url")
}

function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${body}.${sign(body)}`
}

function decodeSession(token: string): SessionPayload | null {
  if (!token || !SESSION_SECRET) return null
  const [body, signature] = token.split(".")
  if (!body || !signature) return null

  const expected = sign(body)
  try {
    if (
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null
    }
  } catch {
    return null
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SessionPayload
    if (!payload.sub || !payload.email || !payload.exp) return null
    if (payload.exp <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function getSupabasePublicClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    )
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export async function createUser(input: {
  name: string
  email: string
  password: string
}): Promise<{ user: AuthUser } | { error: string }> {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)
  const password = input.password

  if (name.length < 2) return { error: "Naam is te kort." }
  if (!email.includes("@")) return { error: "E-mail is ongeldig." }
  if (password.length < 8) {
    return { error: "Wachtwoord moet minstens 8 tekens hebben." }
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  })

  if (error || !data.user) {
    const message = error?.message?.toLowerCase() ?? ""
    if (message.includes("already") || message.includes("registered")) {
      return { error: "Er bestaat al een account met dit e-mailadres." }
    }
    return { error: error?.message ?? "Account aanmaken mislukt." }
  }

  return { user: toSafeUser(data.user) }
}

export async function authenticateUser(
  emailInput: string,
  password: string
): Promise<AuthUser | null> {
  const email = normalizeEmail(emailInput)
  if (!email || !password) return null

  try {
    const supabase = getSupabasePublicClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error || !data.user) return null
    return toSafeUser(data.user)
  } catch {
    return null
  }
}

export async function createSession(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !data.user) {
    throw new Error(error?.message ?? "Kon gebruiker niet laden.")
  }
  const user = toSafeUser(data.user)
  const payload: SessionPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    exp: Date.now() + SESSION_TTL_MS
  }
  return encodeSession(payload)
}

export function revokeSession(token: string) {
  void token
  // Stateless cookie session: clearing cookie is voldoende.
}

export function getSessionUserFromToken(token: string): AuthUser | null {
  const payload = decodeSession(token)
  if (!payload) return null
  return {
    id: payload.sub,
    name: payload.name,
    email: payload.email
  }
}

export function getSessionUserFromCookies(cookies: CookieGetter): AuthUser | null {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value ?? ""
  return getSessionUserFromToken(token)
}

export function getSessionUserFromCookieHeader(cookieHeader: string): AuthUser | null {
  if (!cookieHeader) return null
  const token =
    cookieHeader
      .split(";")
      .map(chunk => chunk.trim())
      .find(chunk => chunk.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.split("=")[1] ?? ""
  return getSessionUserFromToken(decodeURIComponent(token))
}
