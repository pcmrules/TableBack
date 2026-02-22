"use client"

import { useReservations } from "@/context/ReservationContext"
import Link from "next/link"

export default function DashboardPage() {
  const { reservations } = useReservations()
  const rescuedCount = reservations.filter(
    r => r.status === "filled"
  ).length
  const attentionReservations = reservations.filter(
    r => r.status === "attention"
  )

  const protectedRevenue = reservations
    .filter(r => r.status === "confirmed" || r.status === "filled")
    .reduce((total, r) => total + r.estimatedRevenue, 0)

  const atRiskRevenue = attentionReservations
    .reduce((total, r) => total + r.estimatedRevenue, 0)

  const missedRevenue = reservations
    .filter(r => r.status === "unfilled")
    .reduce((total, r) => total + r.estimatedRevenue, 0)

  return (
    <div className="space-y-12">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold text-[#1f3d2b]">
            Dashboard
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Vandaag · {new Date().toLocaleDateString("nl-BE")}
          </p>
        </div>

        {attentionReservations.length === 0 ? (
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium">
            Alles onder controle
          </div>
        ) : attentionReservations.length < 3 ? (
          <div className="bg-orange-50 text-orange-700 px-4 py-2 rounded-full text-sm font-medium">
            Aandacht vereist ({attentionReservations.length})
          </div>
        ) : (
          <div className="bg-red-50 text-red-700 px-4 py-2 rounded-full text-sm font-medium">
            Dringende acties nodig ({attentionReservations.length})
          </div>
        )}
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-[#1f3d2b] mb-4">
          Actie vereist
        </h2>

        {attentionReservations.length === 0 ? (
          <p className="text-sm text-green-700">
            Geen acties vereist 🎉
          </p>
        ) : (
          <div className="space-y-3">
            {attentionReservations.slice(0, 3).map(r => (
              <Link
                key={r.id}
                href="/reservations"
                className="block bg-white rounded-xl p-4 hover:shadow-sm transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-[#1f3d2b]">
                      {r.name}
                    </p>
                    <p className="text-sm text-gray-400">
                      {r.time} · {r.partySize} personen
                    </p>
                  </div>
                  <span className="text-sm text-orange-600 font-medium">
                    Wachten op bevestiging
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        <div className="bg-[#f9f6f0] rounded-2xl p-6">
          <p className="text-sm text-gray-500 mb-2">
            Vandaag veilig
          </p>
          <p className="text-4xl font-semibold text-[#1f3d2b]">
            {reservations.filter(r => r.status === "confirmed").length}
          </p>
        </div>

        <div className="bg-[#f9f6f0] rounded-2xl p-6">
          <p className="text-sm text-gray-500 mb-2">
            Aandacht nodig
          </p>
          <p className="text-4xl font-semibold text-[#d87a3b]">
            {reservations.filter(r => r.status === "attention").length}
          </p>
        </div>

        <div className="bg-[#f9f6f0] rounded-2xl p-6">
          <p className="text-sm text-gray-500 mb-2">
            Tafels gered vandaag
          </p>
          <p className="text-4xl font-semibold text-[#1f3d2b]">
            {rescuedCount}
          </p>
        </div>

        <div className="bg-[#f9f6f0] rounded-2xl p-6">
          <p className="text-sm text-gray-500 mb-2">
            Potentiële omzet beschermd
          </p>
          <p className="text-4xl font-semibold text-[#1f3d2b]">
            €{protectedRevenue.toLocaleString("nl-BE")}
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-sm text-red-600 mb-2">
            Omzet in risico
          </p>
          <p className="text-4xl font-semibold text-red-700">
            €{atRiskRevenue.toLocaleString("nl-BE")}
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="text-sm text-amber-700 mb-2">
            Onbenutte omzet
          </p>
          <p className="text-4xl font-semibold text-amber-800">
            €{missedRevenue.toLocaleString("nl-BE")}
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Niet-opgevulde tafels vandaag
          </p>
        </div>

      </div>

      {/* Attention List */}
      <div>
        <h2 className="text-lg font-semibold text-[#1f3d2b] mb-4">
          Reserveringen met aandacht
        </h2>

        <div className="bg-white border border-gray-100 rounded-2xl divide-y">

          {reservations
            .filter(r => r.status === "attention")
            .map(r => (
              <Link key={r.id} href="/reservations">
                <div className="flex justify-between items-center p-4 hover:bg-[#f9f6f0] transition cursor-pointer">
                  <div>
                    <p className="font-medium text-[#1f3d2b]">
                      {r.name}
                    </p>
                    <p className="text-sm text-gray-400">
                      {r.time} · {r.partySize} personen
                    </p>
                  </div>
                  <span className="text-sm text-[#d87a3b] font-medium">
                    Bevestiging open
                  </span>
                </div>
              </Link>
            ))}

        </div>
      </div>

    </div>
  )
}