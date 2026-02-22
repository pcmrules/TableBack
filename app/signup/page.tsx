"use client"

import Image from "next/image"
import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
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

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Account aanmaken mislukt.")
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
    <main className="min-h-screen bg-[#f3efe7] px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-xl rounded-3xl bg-white p-8 shadow-xl sm:p-10">
        <div className="mb-6 flex justify-center">
          <Image
            src="/LogoTableBack.png"
            alt="TableBack logo"
            width={220}
            height={80}
            className="h-auto w-auto object-contain"
            priority
          />
        </div>

        <h1 className="text-center text-2xl font-semibold text-[#1f3d2b]">
          Account aanmaken
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Start met TableBack en open daarna je dashboard.
        </p>

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <input
            type="text"
            name="name"
            required
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Naam restaurant"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-[#d87a3b] focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
          />
          <input
            type="email"
            name="email"
            required
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="E-mailadres"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-[#d87a3b] focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
          />
          <input
            type="password"
            name="password"
            required
            minLength={8}
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Minimaal 8 tekens"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-[#d87a3b] focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#1f3d2b] py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Bezig..." : "Account aanmaken"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Al een account?
          <Link href="/" className="ml-1 font-medium text-[#1f3d2b] underline">
            Inloggen
          </Link>
        </p>
      </section>
    </main>
  )
}
