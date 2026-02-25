"use client"

import { FormEvent, useMemo, useState } from "react"
import { useReservations } from "@/context/ReservationContext"

export default function SettingsPage() {
  const {
    reminderSettings,
    automationSettings,
    updateReminderSettings,
    updateAutomationSettings
  } = useReservations()

  const [draft, setDraft] = useState<{
    firstReminderMinutes: number
    finalReminderMinutes: number
    noShowThresholdMinutes: number
    waitlistResponseMinutes: number
  } | null>(null)

  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  const firstReminderMinutes =
    draft?.firstReminderMinutes ?? reminderSettings.firstReminderMinutesBefore
  const finalReminderMinutes =
    draft?.finalReminderMinutes ?? reminderSettings.finalReminderMinutesBefore
  const noShowThresholdMinutes =
    draft?.noShowThresholdMinutes ?? automationSettings.noShowThresholdMinutes
  const waitlistResponseMinutes =
    draft?.waitlistResponseMinutes ?? automationSettings.waitlistResponseMinutes
  const updateDraft = (
    key:
      | "firstReminderMinutes"
      | "finalReminderMinutes"
      | "noShowThresholdMinutes"
      | "waitlistResponseMinutes",
    value: number
  ) => {
    setDraft(prev => {
      const base = prev ?? {
        firstReminderMinutes,
        finalReminderMinutes,
        noShowThresholdMinutes,
        waitlistResponseMinutes
      }
      return { ...base, [key]: value }
    })
  }

  const hasChanges = useMemo(() => {
    return (
      firstReminderMinutes !== reminderSettings.firstReminderMinutesBefore ||
      finalReminderMinutes !== reminderSettings.finalReminderMinutesBefore ||
      noShowThresholdMinutes !== automationSettings.noShowThresholdMinutes ||
      waitlistResponseMinutes !== automationSettings.waitlistResponseMinutes
    )
  }, [
    firstReminderMinutes,
    finalReminderMinutes,
    noShowThresholdMinutes,
    waitlistResponseMinutes,
    reminderSettings,
    automationSettings
  ])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaved(false)

    if (firstReminderMinutes <= 0 || finalReminderMinutes <= 0) {
      setError("Herinneringstijden moeten groter zijn dan 0 minuten.")
      return
    }

    if (finalReminderMinutes >= firstReminderMinutes) {
      setError(
        "De laatste herinnering moet dichter bij het reservatiemoment liggen dan de eerste."
      )
      return
    }

    if (noShowThresholdMinutes <= 0 || waitlistResponseMinutes <= 0) {
      setError("Alle waarden moeten groter zijn dan 0 minuten.")
      return
    }

    setError("")
    updateReminderSettings({
      firstReminderMinutesBefore: firstReminderMinutes,
      finalReminderMinutesBefore: finalReminderMinutes
    })

    updateAutomationSettings({
      noShowThresholdMinutes,
      waitlistResponseMinutes,
      preferredChannel: automationSettings.preferredChannel
    })

    setDraft(null)
    setSaved(true)

    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="w-full max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-[#1f3d2b]">
          Instellingen
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Optimaliseer hoe TableBack automatisch lege tafels voorkomt via WhatsApp.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
  {(error || saved) && (
    <div className="md:col-span-2">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Instellingen opgeslagen.
        </p>
      )}
    </div>
  )}
  {/* HERINNERINGEN CARD */}
  <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6 shadow-sm">
    <div>
      <h2 className="text-lg font-semibold text-[#1f3d2b]">
        Herinneringen via WhatsApp
      </h2>
      <p className="text-sm text-gray-500 mt-1">
        Slim getimede herinneringen verminderen no-shows drastisch. Stel een eerste herinnering en een laatste herinnering in.
      </p>
    </div>

    <div className="space-y-4">
      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[#1f3d2b]">
          Eerste herinnering (min vooraf)
        </span>
        <input
          type="number"
          min={1}
          value={firstReminderMinutes}
          onChange={e => updateDraft("firstReminderMinutes", Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
        />
      </label>

      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[#1f3d2b]">
          Laatste herinnering (min vooraf)
        </span>
        <input
          type="number"
          min={1}
          value={finalReminderMinutes}
          onChange={e => updateDraft("finalReminderMinutes", Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
        />
      </label>
    </div>
  </div>


  {/* NO-SHOW & WACHTLIJST CARD */}
  <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6 shadow-sm">
    <div>
      <h2 className="text-lg font-semibold text-[#1f3d2b]">
        No-show & Wachtlijst
      </h2>
      <p className="text-sm text-gray-500 mt-1">
        Bepaal wanneer een reservatie als no-show telt en hoe lang wachtlijstcontacten kunnen reageren.
      </p>
    </div>

    <div className="space-y-4">
      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[#1f3d2b]">
          No-show drempel (min na reservatie)
        </span>
        <input
          type="number"
          min={1}
          value={noShowThresholdMinutes}
          onChange={e => updateDraft("noShowThresholdMinutes", Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
        />
      </label>

      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[#1f3d2b]">
          Reactietijd wachtlijst (min)
        </span>
        <input
          type="number"
          min={1}
          value={waitlistResponseMinutes}
          onChange={e => updateDraft("waitlistResponseMinutes", Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
        />
      </label>
    </div>
  </div>


  {/* FULL WIDTH SAVE BUTTON */}
  <div className="md:col-span-2 flex justify-end">
    <button
      type="submit"
      disabled={!hasChanges}
      className={`px-6 py-2.5 rounded-lg text-sm font-medium transition ${
        hasChanges
          ? "bg-[#1f3d2b] text-white hover:opacity-90"
          : "bg-gray-200 text-gray-400 cursor-not-allowed"
      }`}
    >
      Opslaan
    </button>
  </div>

</form>
    </div>
  )
}
