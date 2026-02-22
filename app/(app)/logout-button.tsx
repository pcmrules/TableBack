"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      router.push("/")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="w-full rounded-xl border border-green-800 px-4 py-2 text-left text-sm text-green-100 hover:bg-[#244b35] disabled:opacity-60"
    >
      {loading ? "Uitloggen..." : "Uitloggen"}
    </button>
  )
}
