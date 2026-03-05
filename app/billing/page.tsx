import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import CheckoutButton from "./checkout-button"
import { getSessionUserFromCookies } from "@/lib/server/auth"
import { getUserBillingState } from "@/lib/server/billing"

export default async function BillingPage({
  searchParams
}: {
  searchParams?: Promise<{ success?: string; canceled?: string }>
}) {
  const user = getSessionUserFromCookies(await cookies())
  if (!user) {
    redirect("/")
  }

  const billing = await getUserBillingState(user.id)
  if (!billing) {
    redirect("/")
  }

  if (billing.paid) {
    redirect("/dashboard")
  }

  const query = (await searchParams) ?? {}

  return (
    <main className="min-h-screen bg-[#f3efe7] px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-8 shadow-xl sm:p-10">
        <h1 className="text-2xl font-semibold text-[#1f3d2b]">
          Activeer je TableBack account
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Je account is aangemaakt, maar je toegang tot het dashboard wordt pas vrijgegeven na
          activatie van je abonnement.
        </p>

        <div className="mt-6 rounded-xl border border-gray-200 bg-[#f8f7f3] p-5">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-[#1f3d2b]">Plan:</span> Growth
          </p>
          <p className="mt-1 text-sm text-gray-700">
            <span className="font-semibold text-[#1f3d2b]">Prijs:</span> EUR 149 per maand
          </p>
          <p className="mt-1 text-sm text-gray-700">
            <span className="font-semibold text-[#1f3d2b]">Restaurant:</span> {billing.restaurantName}
          </p>
          <p className="mt-3 text-xs text-gray-500">
            Na succesvolle betaling krijg je automatisch toegang tot je dashboard.
          </p>
        </div>

        {query.success === "1" ? (
          <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Betaling ontvangen. We verwerken je abonnement, ververs deze pagina binnen enkele seconden.
          </p>
        ) : null}
        {query.canceled === "1" ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Betaling geannuleerd. Je kunt checkout opnieuw starten.
          </p>
        ) : null}

        <div className="mt-6">
          <CheckoutButton />
        </div>

        <div className="mt-6 text-sm text-gray-500">
          Eerst iets wijzigen?
          <Link href="/" className="ml-1 font-medium text-[#1f3d2b] underline">
            Terug naar login
          </Link>
        </div>
      </section>
    </main>
  )
}
