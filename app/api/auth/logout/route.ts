import { NextResponse } from "next/server"
import {
  revokeSession,
  SESSION_COOKIE_NAME
} from "@/lib/server/auth"

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? ""
  const token = cookieHeader
    .split(";")
    .map(chunk => chunk.trim())
    .find(chunk => chunk.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1] ?? ""

  if (token) {
    revokeSession(decodeURIComponent(token))
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0
  })
  return response
}
