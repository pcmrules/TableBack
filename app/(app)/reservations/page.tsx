"use client"

import { FormEvent, useState } from "react"
import { useReservations } from "@/context/ReservationContext"
import type { Reservation } from "@/data/reservations"

export default function ReservationsPage() {
  const {
    reservations,
    waitlist,
    addReservation,
    removeReservation,
    clearReservations
  } = useReservations()

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [partySize, setPartySize] = useState(2)
  const [time, setTime] = useState("")
  const [error, setError] = useState("")

  function handleAddReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim() || !phone.trim() || !time) {
      setError("Naam, telefoon en uur zijn verplicht.")
      return
    }

    if (!Number.isFinite(partySize) || partySize <= 0) {
      setError("Aantal personen moet groter zijn dan 0.")
      return
    }

    addReservation({
      name: name.trim(),
      phone: phone.trim(),
      partySize,
      time
    })

    setName("")
    setPhone("")
    setPartySize(2)
    setTime("")
    setError("")
  }

  return (
    <div className="space-y-10">

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold text-[#1f3d2b]">
          Reserveringen
        </h1>
        <button
          type="button"
          onClick={() => {
            if (reservations.length === 0) return
            const confirmed = window.confirm(
              "Weet je zeker dat je alle reservaties wil verwijderen?"
            )
            if (!confirmed) return
            clearReservations()
          }}
          disabled={reservations.length === 0}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verwijder alles
        </button>
      </div>
      <p className="text-sm text-gray-400 mt-1">
        Voeg reservaties toe, daarna neemt de automatisering het over.
      </p>

      <form
        onSubmit={handleAddReservation}
        className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold text-[#1f3d2b]">
            Nieuwe reservatie
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Naam, nummer, groepsgrootte en uur zijn voldoende.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Naam"
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
          />
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Nummer"
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
          />
          <input
            type="number"
            min={1}
            step={1}
            value={partySize}
            onChange={e => setPartySize(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
          />
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-[#1f3d2b] text-white rounded-lg px-5 py-2.5 hover:opacity-90 transition"
          >
            Reservatie toevoegen
          </button>
        </div>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-[#1f3d2b]">
            Globale wachtlijst
          </h2>
          <span className="text-sm text-gray-400">
            {waitlist.length} wachtenden
          </span>
        </div>

        {waitlist.length === 0 ? (
          <p className="text-sm text-gray-400">
            Geen personen op de wachtlijst
          </p>
        ) : (
          <div className="space-y-3">
            {waitlist.map(person => (
              <div
                key={person.id}
                className="flex justify-between items-center bg-[#f9f6f0] rounded-xl px-4 py-3 border border-gray-100"
              >
                <div>
                  <p className="font-medium text-[#1f3d2b]">
                    {person.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {person.phone} | {person.partySize} personen
                  </p>
                </div>

                <span className="text-xs text-gray-500">
                  Wacht op tafel voor {person.partySize}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl divide-y border border-gray-100">
        {reservations.length === 0 ? (
          <div className="p-6 text-sm text-gray-400">
            Nog geen reservaties. Voeg hierboven je eerste reservatie toe.
          </div>
        ) : (
          reservations.map((r: Reservation) => (
            <div
              key={r.id}
              className="flex justify-between items-center p-6 transition hover:bg-[#f9f6f0] hover:shadow-sm"
            >
              <div>
                <p className="font-medium text-[#1f3d2b]">
                  {r.name}
                </p>
                <p className="text-sm text-gray-400">
                  {r.phone} | {r.time} | {r.partySize} personen
                </p>
                {r.filledFromWaitlist && (
                  <p className="text-xs text-blue-700 mt-1">
                    Opgevuld via wachtlijst
                    {r.originalGuestName ? ` (no-show: ${r.originalGuestName})` : ""}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                <StatusBadge status={r.status} />
                <button
                  type="button"
                  onClick={() => removeReservation(r.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-600"
                  aria-label={`Verwijder reservatie van ${r.name}`}
                  title="Verwijder reservatie"
                >
                  x
                </button>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  )
}

function StatusBadge({ status }: { status: Reservation["status"] }) {
  const styles = {
    attention: "bg-orange-50 text-[#d87a3b] border border-orange-200",
    confirmed: "bg-green-50 text-green-700 border border-green-200",
    filled: "bg-blue-50 text-blue-700 border border-blue-200",
    processing: "bg-purple-50 text-purple-700 border border-purple-200",
    expired: "bg-red-50 text-red-600 border border-red-200",
    unfilled: "bg-red-100 text-red-700 border border-red-300"
  }

  const labels = {
    attention: "Wachten op bevestiging",
    confirmed: "Bevestigd",
    filled: "Opgevuld",
    processing: "Bezig met opvullen...",
    expired: "Vervallen",
    unfilled: "Niet opgevuld"
  }

  return (
    <span className={`px-3 py-1 text-xs rounded-full font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
