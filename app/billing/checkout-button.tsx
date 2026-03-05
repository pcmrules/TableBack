"use client"

import { useState } from "react"

export default function CheckoutButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function startCheckout() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" })
      const payload = (await response.json()) as {
        ok?: boolean
        url?: string
        error?: string
      }

      if (!response.ok || !payload.ok || !payload.url) {
        setError(payload.error ?? "Kon checkout niet starten.")
        return
      }

      window.location.href = payload.url
    } catch {
      setError("Netwerkfout. Probeer opnieuw.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="w-full rounded-lg bg-[#1f3d2b] py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Checkout openen..." : "Betaal €149/maand"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
