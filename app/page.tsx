"use client"

import Image from "next/image"
import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" })
      if (response.ok) {
        router.replace("/dashboard")
      }
    })()
  }, [router])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Inloggen mislukt.")
        return
      }

      router.push("/dashboard")
      router.refresh()
    } catch {
      setError("Netwerkfout. Probeer opnieuw.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3efe7] flex items-center justify-center px-4 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
        <section className="rounded-3xl bg-[#1f3d2b] p-8 text-white sm:p-10">
          <div className="mb-10">
            <div className="mb-6 flex justify-center">
              <Image
                src="/LogoTableBack.png"
                alt="TableBack logo"
                width={400}
                height={150}
                priority
                unoptimized
              />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-green-200">
              TableBack
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Voorkom no-shows en houd je tafels gevuld.
            </h1>
            <p className="mt-4 max-w-md text-sm text-green-100 sm:text-base">
              Log in om je dashboard te openen of maak in een paar klikken een account aan.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-green-100 sm:grid-cols-2">
            <div className="rounded-xl border border-green-900/50 bg-[#244b35] p-4">
              Slimme herinneringen
            </div>
            <div className="rounded-xl border border-green-900/50 bg-[#244b35] p-4">
              Automatische wachtlijst-fills
            </div>
            <div className="rounded-xl border border-green-900/50 bg-[#244b35] p-4">
              Inzicht in geredde omzet
            </div>
            <div className="rounded-xl border border-green-900/50 bg-[#244b35] p-4">
              WhatsApp integratie
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-xl sm:p-10">
          <h2 className="text-2xl font-semibold text-[#1f3d2b]">Inloggen</h2>
          <p className="mt-2 text-sm text-gray-500">
            Gebruik je e-mail en wachtwoord om naar je dashboard te gaan.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <label className="block text-sm font-medium text-[#1f3d2b]">
              E-mailadres
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="jij@restaurant.nl"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-[#d87a3b] focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
              />
            </label>

            <label className="block text-sm font-medium text-[#1f3d2b]">
              Wachtwoord
              <input
                type="password"
                name="password"
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="********"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-[#d87a3b] focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#d87a3b] py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Bezig..." : "Inloggen"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-gray-500">
            Nog geen account?
          </div>

          <Link
            href="/signup"
            className="mt-3 block w-full rounded-lg border border-[#1f3d2b] py-3 text-center text-sm font-medium text-[#1f3d2b] transition hover:bg-[#f4f8f5]"
          >
            Account aanmaken
          </Link>
        </section>
      </div>
    </main>
  )
}
