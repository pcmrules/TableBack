import type { ReactNode } from "react"
import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionUserFromCookies } from "@/lib/server/auth"
import LogoutButton from "./logout-button"
import { Providers } from "../providers"

export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const user = getSessionUserFromCookies(await cookies())
  if (!user) {
    redirect("/")
  }

  return (
    <div className="min-h-screen flex bg-[#f3efe7]">
      
      {/* Sidebar */}
      <aside className="w-72 bg-[#1f3d2b] text-white p-10 hidden md:flex flex-col">

        <div className="mb-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            TableBack
          </h2>
          <p className="text-xs text-green-200 mt-1">
            {user.name}
          </p>
        </div>

        <nav className="flex flex-col gap-3 text-sm">
          <NavItem href="/dashboard" label="Dashboard" />
          <NavItem href="/reservations" label="Reserveringen" />
          <NavItem href="/waitlist" label="Wachtlijst" />
          <NavItem href="/settings" label="Instellingen" />
        </nav>

        <div className="flex-1" />

        <LogoutButton />

        <p className="text-xs text-green-200">
          © {new Date().getFullYear()}
        </p>
      </aside>

      {/* Main area */}
      <div className="flex-1 p-16">
        <div className="bg-white rounded-3xl p-12 shadow-xl min-h-[600px]">
          <Providers>{children}</Providers>
        </div>
      </div>
    </div>
  )
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-3 rounded-xl hover:bg-[#244b35] transition"
    >
      {label}
    </Link>
  )
}
