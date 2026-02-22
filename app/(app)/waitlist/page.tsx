"use client"

import { FormEvent, useMemo, useState } from "react"
import { useReservations } from "@/context/ReservationContext"
import type { WaitlistEntry } from "@/data/waitlist"

export default function WaitlistPage() {
  const {
    waitlist,
    reservations,
    automationSettings,
    addWaitlistEntry,
    removeWaitlistEntry,
    markWaitlistContacted
  } = useReservations()

  const [search, setSearch] = useState("")
  const [partySizeFilter, setPartySizeFilter] = useState("all")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [partySize, setPartySize] = useState(2)
  const [error, setError] = useState("")

  const openTableSizes = useMemo(
    () =>
      reservations
        .filter(r => r.status === "expired" || r.status === "unfilled")
        .map(r => r.partySize),
    [reservations]
  )

  const filteredWaitlist = useMemo(() => {
    const query = search.trim().toLowerCase()

    return waitlist
      .filter(entry => {
        if (partySizeFilter !== "all" && entry.partySize !== Number(partySizeFilter)) {
          return false
        }

        if (!query) return true

        return (
          entry.name.toLowerCase().includes(query) ||
          entry.phone.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => {
        const aHasDirectMatch = openTableSizes.includes(a.partySize) ? 0 : 1
        const bHasDirectMatch = openTableSizes.includes(b.partySize) ? 0 : 1
        if (aHasDirectMatch !== bHasDirectMatch) return aHasDirectMatch - bHasDirectMatch

        const aStatus = a.status === "waiting" ? 0 : 1
        const bStatus = b.status === "waiting" ? 0 : 1
        if (aStatus !== bStatus) return aStatus - bStatus

        return (a.createdAt ?? 0) - (b.createdAt ?? 0)
      })
  }, [waitlist, search, partySizeFilter, openTableSizes])

  const totalGuests = waitlist.reduce((sum, entry) => sum + entry.partySize, 0)
  const directMatches = waitlist.filter(entry =>
    openTableSizes.includes(entry.partySize)
  ).length
  const contactedCount = waitlist.filter(
    entry => entry.status === "contacted"
  ).length

  function handleAddEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim() || !phone.trim()) {
      setError("Naam en telefoon zijn verplicht.")
      return
    }

    if (!Number.isFinite(partySize) || partySize <= 0) {
      setError("Aantal personen moet groter zijn dan 0.")
      return
    }

    addWaitlistEntry({
      name: name.trim(),
      phone: phone.trim(),
      partySize
    })

    setName("")
    setPhone("")
    setPartySize(2)
    setError("")
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold text-[#1f3d2b]">
          Wachtlijst
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Beheer binnenkomende wachtenden en stuur prioriteit op open tafels.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Partijen op wachtlijst" value={String(waitlist.length)} />
        <KpiCard label="Wachtende gasten" value={String(totalGuests)} />
        <KpiCard label="Directe matches nu" value={String(directMatches)} />
        <KpiCard label="Al gecontacteerd" value={String(contactedCount)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form
          onSubmit={handleAddEntry}
          className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4"
        >
          <div>
            <h2 className="text-lg font-semibold text-[#1f3d2b]">
              Nieuwe wachtende
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Voeg snel een gastgroep toe aan de wachtrij.
            </p>
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#1f3d2b]">Naam</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
              placeholder="Bijv. Emma De Smet"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#1f3d2b]">Telefoon</span>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
              placeholder="+324..."
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#1f3d2b]">
              Aantal personen
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={partySize}
              onChange={e => setPartySize(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-[#1f3d2b] text-white rounded-lg px-4 py-2.5 hover:opacity-90 transition"
          >
            Toevoegen aan wachtlijst
          </button>
        </form>

        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1f3d2b]">
                Slimme volgorde
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Geprioriteerd op tafelmatch, status en wachttijd.
              </p>
            </div>

            <div className="text-xs text-gray-500 bg-[#f9f6f0] px-3 py-2 rounded-lg">
              Kanaal: {channelLabel(automationSettings.preferredChannel)} |
              Reactietijd: {automationSettings.waitlistResponseMinutes} min
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoek op naam of telefoon"
              className="md:col-span-2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
            />
            <select
              value={partySizeFilter}
              onChange={e => setPartySizeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
            >
              <option value="all">Alle groepsgroottes</option>
              {[2, 3, 4, 5, 6, 7, 8].map(size => (
                <option key={size} value={String(size)}>
                  {size} personen
                </option>
              ))}
            </select>
          </div>

          {filteredWaitlist.length === 0 ? (
            <p className="text-sm text-gray-400">
              Geen resultaten voor de huidige filters.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredWaitlist.map(entry => (
                <WaitlistRow
                  key={entry.id}
                  entry={entry}
                  hasDirectMatch={openTableSizes.includes(entry.partySize)}
                  onContact={() => markWaitlistContacted(entry.id)}
                  onRemove={() => removeWaitlistEntry(entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#f9f6f0] rounded-2xl p-6">
      <p className="text-sm text-gray-500 mb-2">
        {label}
      </p>
      <p className="text-3xl font-semibold text-[#1f3d2b]">
        {value}
      </p>
    </div>
  )
}

function WaitlistRow({
  entry,
  hasDirectMatch,
  onContact,
  onRemove
}: {
  entry: WaitlistEntry
  hasDirectMatch: boolean
  onContact: () => void
  onRemove: () => void
}) {
  const waitingLabel = formatWaitingTime(entry.createdAt)
  const statusLabel =
    entry.status === "contacted"
      ? "Gecontacteerd"
      : entry.status === "declined"
        ? "Overgeslagen"
        : "Wachtend"

  return (
    <div className="rounded-xl border border-gray-100 bg-[#fcfaf5] p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="font-medium text-[#1f3d2b]">
            {entry.name}
          </p>
          <p className="text-sm text-gray-500">
            {entry.phone} | {entry.partySize} personen | {waitingLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              entry.status === "contacted"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : entry.status === "declined"
                  ? "bg-gray-100 text-gray-600 border border-gray-300"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}
          >
            {statusLabel}
          </span>
          {hasDirectMatch && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
              Match met open tafel
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onContact}
          className="text-sm bg-[#1f3d2b] text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition"
        >
          Contacteer
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
        >
          Verwijder
        </button>
      </div>
    </div>
  )
}

function formatWaitingTime(createdAt?: number): string {
  if (!createdAt) return "Wachttijd onbekend"

  const diffMinutes = Math.max(1, Math.floor((Date.now() - createdAt) / 60000))
  if (diffMinutes < 60) {
    return `${diffMinutes} min in wachtrij`
  }

  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  if (minutes === 0) {
    return `${hours}u in wachtrij`
  }

  return `${hours}u ${minutes}m in wachtrij`
}

function channelLabel(channel: "whatsapp" | "sms" | "email") {
  if (channel === "whatsapp") return "WhatsApp"
  if (channel === "sms") return "SMS"
  return "E-mail"
}
