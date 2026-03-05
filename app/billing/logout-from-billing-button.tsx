"use client"

import { useState } from "react"

export default function LogoutFromBillingButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function logout() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) {
        setError("Uitloggen mislukt.")
        return
      }
      window.location.href = "/"
    } catch {
      setError("Netwerkfout bij uitloggen.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={logout}
        disabled={loading}
        className="rounded-lg border border-[#1f3d2b] px-3 py-2 text-sm font-medium text-[#1f3d2b] hover:bg-[#f4f8f5] disabled:opacity-60"
      >
        {loading ? "Uitloggen..." : "Uitloggen en naar login"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
