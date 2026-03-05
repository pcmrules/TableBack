"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useReservations } from "@/context/ReservationContext"
import type { ContactChannel } from "@/lib/shared/settings"

type BillingInfo = {
  status: string
  paid: boolean
  restaurantName: string
  customerSince: string | null
  nextPaymentAt: string | null
  cancelAtPeriodEnd: boolean
}

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
    preferredChannel: ContactChannel
  } | null>(null)

  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingError, setBillingError] = useState("")
  const [billingActionBusy, setBillingActionBusy] = useState(false)

  const firstReminderMinutes =
    draft?.firstReminderMinutes ?? reminderSettings.firstReminderMinutesBefore
  const finalReminderMinutes =
    draft?.finalReminderMinutes ?? reminderSettings.finalReminderMinutesBefore
  const noShowThresholdMinutes =
    draft?.noShowThresholdMinutes ?? automationSettings.noShowThresholdMinutes
  const waitlistResponseMinutes =
    draft?.waitlistResponseMinutes ?? automationSettings.waitlistResponseMinutes
  const preferredChannel =
    draft?.preferredChannel ?? automationSettings.preferredChannel
  const updateDraft = (
    key:
      | "firstReminderMinutes"
      | "finalReminderMinutes"
      | "noShowThresholdMinutes"
      | "waitlistResponseMinutes"
      | "preferredChannel",
    value: number | ContactChannel
  ) => {
    setDraft(prev => {
      const base = prev ?? {
        firstReminderMinutes,
        finalReminderMinutes,
        noShowThresholdMinutes,
        waitlistResponseMinutes,
        preferredChannel
      }
      return { ...base, [key]: value }
    })
  }

  const hasChanges = useMemo(() => {
    return (
      firstReminderMinutes !== reminderSettings.firstReminderMinutesBefore ||
      finalReminderMinutes !== reminderSettings.finalReminderMinutesBefore ||
      noShowThresholdMinutes !== automationSettings.noShowThresholdMinutes ||
      waitlistResponseMinutes !== automationSettings.waitlistResponseMinutes ||
      preferredChannel !== automationSettings.preferredChannel
    )
  }, [
    firstReminderMinutes,
    finalReminderMinutes,
    noShowThresholdMinutes,
    waitlistResponseMinutes,
    preferredChannel,
    reminderSettings,
    automationSettings
  ])

  useEffect(() => {
    let active = true
    void (async () => {
      setBillingLoading(true)
      setBillingError("")
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" })
        const payload = (await response.json()) as {
          ok?: boolean
          error?: string
          billing?: BillingInfo
        }
        if (!active) return
        if (!response.ok || !payload.ok || !payload.billing) {
          setBillingError(payload.error ?? "Kon abonnement niet laden.")
          return
        }
        setBillingInfo(payload.billing)
      } catch {
        if (!active) return
        setBillingError("Netwerkfout bij laden van abonnement.")
      } finally {
        if (active) setBillingLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

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
      preferredChannel
    })

    setDraft(null)
    setSaved(true)

    setTimeout(() => setSaved(false), 2500)
  }

  async function openBillingPortal() {
    setBillingActionBusy(true)
    setBillingError("")
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" })
      const payload = (await response.json()) as {
        ok?: boolean
        url?: string
        error?: string
      }
      if (!response.ok || !payload.ok || !payload.url) {
        setBillingError(payload.error ?? "Kon abonnementspagina niet openen.")
        return
      }
      window.location.href = payload.url
    } catch {
      setBillingError("Netwerkfout bij openen van abonnementspagina.")
    } finally {
      setBillingActionBusy(false)
    }
  }

  async function cancelSubscription() {
    if (!window.confirm("Wil je je abonnement opzeggen aan het einde van de huidige periode?")) {
      return
    }

    setBillingActionBusy(true)
    setBillingError("")
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        currentPeriodEnd?: string
      }
      if (!response.ok || !payload.ok) {
        setBillingError(payload.error ?? "Opzeggen mislukt.")
        return
      }
      setBillingInfo(prev =>
        prev
          ? {
              ...prev,
              cancelAtPeriodEnd: true,
              nextPaymentAt: payload.currentPeriodEnd ?? prev.nextPaymentAt
            }
          : prev
      )
    } catch {
      setBillingError("Netwerkfout bij opzeggen.")
    } finally {
      setBillingActionBusy(false)
    }
  }

  function formatDate(value: string | null): string {
    if (!value) return "Onbekend"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "Onbekend"
    return date.toLocaleDateString("nl-BE", {
      year: "numeric",
      month: "long",
      day: "numeric"
    })
  }

  return (
    <div className="w-full max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-[#1f3d2b]">
          Instellingen
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Optimaliseer hoe TableBack automatisch lege tafels voorkomt via WhatsApp en SMS.
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
        Herinneringen
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

      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[#1f3d2b]">
          Voorkeurskanaal
        </span>
        <select
          value={preferredChannel}
          onChange={e =>
            updateDraft("preferredChannel", e.target.value as ContactChannel)
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#d87a3b]"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="both">WhatsApp + SMS</option>
        </select>
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

  <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-sm">
    <div>
      <h2 className="text-lg font-semibold text-[#1f3d2b]">Abonnement</h2>
      <p className="text-sm text-gray-500 mt-1">
        Bekijk je huidige plan, volgende betaling en beheer je abonnement.
      </p>
    </div>

    {billingLoading ? (
      <p className="text-sm text-gray-500">Abonnement laden...</p>
    ) : billingInfo ? (
      <div className="space-y-2 text-sm text-gray-700">
        <p>
          <span className="font-medium text-[#1f3d2b]">Status:</span>{" "}
          {billingInfo.cancelAtPeriodEnd
            ? "Opgezegd (loopt af op einddatum)"
            : billingInfo.status}
        </p>
        <p>
          <span className="font-medium text-[#1f3d2b]">Klant sinds:</span>{" "}
          {formatDate(billingInfo.customerSince)}
        </p>
        <p>
          <span className="font-medium text-[#1f3d2b]">Volgende betaling:</span>{" "}
          {formatDate(billingInfo.nextPaymentAt)}
        </p>
      </div>
    ) : (
      <p className="text-sm text-gray-500">Geen abonnementsdata gevonden.</p>
    )}

    {billingError ? (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {billingError}
      </p>
    ) : null}

    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={openBillingPortal}
        disabled={billingActionBusy}
        className="rounded-lg border border-[#1f3d2b] px-4 py-2 text-sm font-medium text-[#1f3d2b] hover:bg-[#f4f8f5] disabled:opacity-60"
      >
        Beheer mijn abonnement
      </button>
      <button
        type="button"
        onClick={cancelSubscription}
        disabled={billingActionBusy || Boolean(billingInfo?.cancelAtPeriodEnd)}
        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {billingInfo?.cancelAtPeriodEnd ? "Opzegging ingepland" : "Abonnement opzeggen"}
      </button>
    </div>
  </div>

</form>
    </div>
  )
}
