"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef
} from "react"

import {
  reservations as initialReservations,
  Reservation
} from "@/data/reservations"

import { initialWaitlist } from "@/data/waitlist"
import type { WaitlistEntry } from "@/data/waitlist"
import { normalizePhone } from "@/lib/phone"
import {
  DEFAULT_AUTOMATION_SETTINGS,
  DEFAULT_REMINDER_SETTINGS,
  type AutomationSettings,
  type ContactChannel,
  type ReminderSettings
} from "@/lib/shared/settings"

type PersistedStatePayload = {
  reservations: Reservation[]
  waitlist: WaitlistEntry[]
  reminderSettings: ReminderSettings
  automationSettings: AutomationSettings
}

function normalizeWaitlistEntry(
  entry: WaitlistEntry,
  fallbackCreatedAt: number
): WaitlistEntry {
  return {
    ...entry,
    status: entry.status ?? "waiting",
    createdAt: entry.createdAt ?? fallbackCreatedAt
  }
}

function getDefaultWaitlist(): WaitlistEntry[] {
  const now = Date.now()
  return initialWaitlist.map((entry, index) =>
    normalizeWaitlistEntry(entry, now - (initialWaitlist.length - index) * 600000)
  )
}

function loadWaitlist(): WaitlistEntry[] {
  return getDefaultWaitlist()
}

function getBrusselsNowParts(referenceTimestamp: number): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  })

  const parts = formatter.formatToParts(referenceTimestamp)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value ?? "0")

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  }
}

function getNowInBrusselsTimestamp(referenceTimestamp: number): number {
  const parts = getBrusselsNowParts(referenceTimestamp)
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
}

function getReservationTimestampInBrussels(
  time: string,
  referenceTimestamp: number
): number | null {
  const [hoursPart, minutesPart] = time.split(":")
  const hours = Number(hoursPart)
  const minutes = Number(minutesPart)

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }

  const nowInBrussels = getBrusselsNowParts(referenceTimestamp)
  return Date.UTC(
    nowInBrussels.year,
    nowInBrussels.month - 1,
    nowInBrussels.day,
    hours,
    minutes,
    0
  )
}

function formatChannelLabel(channel: ContactChannel): string {
  if (channel === "whatsapp") return "WhatsApp"
  if (channel === "sms") return "SMS"
  return "E-mail"
}

async function sendWhatsAppMessage(
  to: string,
  message: string,
  conversationType: "reservation_confirmation" | "waitlist_offer",
  offerExpiresAt?: number
): Promise<void> {
  const response = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ to, message, conversationType, offerExpiresAt })
  })

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string }
    throw new Error(payload.error ?? "WhatsApp verzending mislukt.")
  }
}

type WhatsAppConfirmationPayload = {
  confirmed?: boolean
  declined?: boolean
  updatedAt?: number | null
}

async function getWhatsAppConfirmation(
  phone: string
): Promise<WhatsAppConfirmationPayload | null> {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return null

  const response = await fetch(
    `/api/whatsapp/confirmation?phone=${encodeURIComponent(normalizedPhone)}`,
    { cache: "no-store" }
  )

  if (!response.ok) return null
  return (await response.json()) as WhatsAppConfirmationPayload
}

function normalizeReservation(entry: Reservation): Reservation {
  return {
    ...entry,
    phone: typeof entry.phone === "string" ? entry.phone : "",
    createdAt:
      typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
    reminderCount:
      typeof entry.reminderCount === "number" ? entry.reminderCount : 0
  }
}

function loadReservations(): Reservation[] {
  return initialReservations.map(normalizeReservation)
}

type NewWaitlistEntry = {
  name: string
  phone: string
  partySize: number
}

type NewReservationEntry = {
  name: string
  phone: string
  partySize: number
  time: string
}

type ReservationContextType = {
  reservations: Reservation[]
  waitlist: WaitlistEntry[]
  reminderSettings: ReminderSettings
  automationSettings: AutomationSettings
  toast: { message: string; id: number } | null
  addReservation: (entry: NewReservationEntry) => void
  removeReservation: (id: number) => void
  clearReservations: () => void
  updateReminderSettings: (next: ReminderSettings) => void
  updateAutomationSettings: (next: AutomationSettings) => void
  addWaitlistEntry: (entry: NewWaitlistEntry) => void
  removeWaitlistEntry: (id: number) => void
  markWaitlistContacted: (id: number) => void
}

const ReservationContext = createContext<ReservationContextType | undefined>(
  undefined
)

export function ReservationProvider({
  children
}: {
  children: ReactNode
}) {
  const [reservations, setReservations] =
    useState<Reservation[]>(loadReservations)

  const [waitlist, setWaitlist] =
    useState<WaitlistEntry[]>(loadWaitlist)

  const [toast, setToast] =
    useState<{ message: string; id: number } | null>(null)
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS)
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettings>(DEFAULT_AUTOMATION_SETTINGS)
  const [isHydratedFromServer, setIsHydratedFromServer] = useState(false)

  const inFlightReservationIds = useRef<Set<number>>(new Set())
  const fillTimeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  )
  const pendingWaitlistMatches = useRef<Map<number, number>>(new Map())
  const pendingFallbackStatuses = useRef<Map<number, Reservation["status"]>>(
    new Map()
  )
  const reservationsRef = useRef<Reservation[]>(reservations)
  const sentReminderEvents = useRef<Set<string>>(new Set())

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" })
        if (!response.ok) {
          if (active) setIsHydratedFromServer(true)
          return
        }

        const payload = (await response.json()) as {
          ok?: boolean
          state?: Partial<PersistedStatePayload>
        }

        if (!payload.ok || !payload.state) {
          if (active) setIsHydratedFromServer(true)
          return
        }

        if (active) {
          setReservations(
            Array.isArray(payload.state.reservations)
              ? payload.state.reservations.map(normalizeReservation)
              : []
          )
          setWaitlist(
            Array.isArray(payload.state.waitlist)
              ? payload.state.waitlist.map((entry, index, all) =>
                  normalizeWaitlistEntry(
                    entry,
                    Date.now() - (all.length - index) * 600000
                  )
                )
              : []
          )
          if (payload.state.reminderSettings) {
            setReminderSettings(payload.state.reminderSettings)
          }
          if (payload.state.automationSettings) {
            setAutomationSettings(payload.state.automationSettings)
          }
          setIsHydratedFromServer(true)
        }
      } catch {
        if (active) setIsHydratedFromServer(true)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    reservationsRef.current = reservations
  }, [reservations])

  // REMINDER + NO-SHOW AUTOMATISERING
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const nowBrusselsTimestamp = getNowInBrusselsTimestamp(now)
      const currentReservations = reservationsRef.current
      const updates = new Map<
        number,
        {
          status: Reservation["status"]
          reminderCount: number
          lastReminderAt?: number
        }
      >()

      const toSend: Array<{ name: string; phone: string; text: string }> = []
      const toToast: string[] = []

      for (const reservation of currentReservations) {
        if (reservation.status !== "attention") continue

        const reservationTimestamp = getReservationTimestampInBrussels(
          reservation.time,
          now
        )
        if (reservationTimestamp === null) continue

        const firstReminderAt =
          reservationTimestamp -
          reminderSettings.firstReminderMinutesBefore * 60000
        const finalReminderAt =
          reservationTimestamp -
          reminderSettings.finalReminderMinutesBefore * 60000
        const noShowAt =
          reservationTimestamp +
          automationSettings.noShowThresholdMinutes * 60000

        let reminderCount = reservation.reminderCount
        let lastReminderAt = reservation.lastReminderAt
        let status: Reservation["status"] = reservation.status
        let changed = false

        if (reminderCount < 2 && nowBrusselsTimestamp >= finalReminderAt) {
          reminderCount = 2
          lastReminderAt = now
          changed = true

          const reminderKey = `${reservation.id}:2`
          if (!sentReminderEvents.current.has(reminderKey)) {
            sentReminderEvents.current.add(reminderKey)
            toToast.push(`Laatste herinnering verstuurd naar ${reservation.name}`)
            if (automationSettings.preferredChannel === "whatsapp" && reservation.phone.trim()) {
              toSend.push({
                name: reservation.name,
                phone: reservation.phone,
                text: `Laatste herinnering: bevestig je reservatie om ${reservation.time}. Antwoord met JA om te bevestigen of NEE om te annuleren.`
              })
            }
          }
        } else if (reminderCount < 1 && nowBrusselsTimestamp >= firstReminderAt) {
          reminderCount = 1
          lastReminderAt = now
          changed = true

          const reminderKey = `${reservation.id}:1`
          if (!sentReminderEvents.current.has(reminderKey)) {
            sentReminderEvents.current.add(reminderKey)
            toToast.push(`Eerste herinnering verstuurd naar ${reservation.name}`)
            if (automationSettings.preferredChannel === "whatsapp" && reservation.phone.trim()) {
              toSend.push({
                name: reservation.name,
                phone: reservation.phone,
                text: `Dag ${reservation.name}, bevestig je reservatie om ${reservation.time} voor ${reservation.partySize} personen. Antwoord met JA om te bevestigen of NEE om te annuleren.`
              })
            }
          }
        }

        if (nowBrusselsTimestamp >= noShowAt) {
          status = "expired"
          changed = true
          toToast.push(`${reservation.name} gemarkeerd als no-show`)
        }

        if (!changed) continue

        updates.set(reservation.id, {
          status,
          reminderCount,
          lastReminderAt
        })
      }

      if (updates.size > 0) {
        setReservations(prev => {
          let changed = false
          const next = prev.map(reservation => {
            const update = updates.get(reservation.id)
            if (!update) return reservation
            if (
              reservation.status === update.status &&
              reservation.reminderCount === update.reminderCount &&
              reservation.lastReminderAt === update.lastReminderAt
            ) {
              return reservation
            }
            changed = true
            return {
              ...reservation,
              status: update.status,
              reminderCount: update.reminderCount,
              lastReminderAt: update.lastReminderAt
            }
          })
          return changed ? next : prev
        })
      }

      for (const message of toToast) {
        setToast({
          message,
          id: Date.now()
        })
      }

      for (const outbound of toSend) {
        void sendWhatsAppMessage(
          outbound.phone,
          outbound.text,
          "reservation_confirmation"
        ).catch(error => {
          setToast({
            message: `WhatsApp fout: ${error.message}`,
            id: Date.now()
          })
        })
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [
    reminderSettings.firstReminderMinutesBefore,
    reminderSettings.finalReminderMinutesBefore,
    automationSettings.noShowThresholdMinutes,
    automationSettings.preferredChannel
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      const attentionReservations = reservationsRef.current.filter(
        reservation =>
          reservation.status === "attention" &&
          reservation.reminderCount > 0 &&
          reservation.phone.trim().length > 0
      )

      void (async () => {
        const confirmedIds = new Set<number>()
        const declinedIds = new Set<number>()

        for (const reservation of attentionReservations) {
          const payload = await getWhatsAppConfirmation(reservation.phone)
          const confirmed = Boolean(payload?.confirmed)
          const declined = Boolean(payload?.declined)
          const updatedAt = Number(payload?.updatedAt ?? 0)
          const lastReminderAt = Number(reservation.lastReminderAt ?? 0)
          const createdAt = Number(reservation.createdAt ?? 0)
          const minimumAcceptedReplyAt = Math.max(lastReminderAt, createdAt)

          if (!lastReminderAt || updatedAt < minimumAcceptedReplyAt) continue
          if (declined) declinedIds.add(reservation.id)
          if (confirmed) confirmedIds.add(reservation.id)
        }

        if (confirmedIds.size === 0 && declinedIds.size === 0) return

        let confirmedCount = 0
        let declinedCount = 0
        setReservations(prev => {
          const next = prev.map(r => {
            if (r.status !== "attention") return r
            if (declinedIds.has(r.id)) {
              declinedCount += 1
              return { ...r, status: "expired" as const }
            }
            if (confirmedIds.has(r.id)) {
              confirmedCount += 1
              return { ...r, status: "confirmed" as const }
            }
            return r
          })
          return confirmedCount > 0 || declinedCount > 0 ? next : prev
        })

        if (confirmedCount > 0) {
          setToast({
            message:
              confirmedCount === 1
                ? "Reservatie bevestigd via WhatsApp"
                : `${confirmedCount} reservaties bevestigd via WhatsApp`,
            id: Date.now()
          })
        }
        if (declinedCount > 0) {
          setToast({
            message:
              declinedCount === 1
                ? "Reservatie geannuleerd via WhatsApp"
                : `${declinedCount} reservaties geannuleerd via WhatsApp`,
            id: Date.now()
          })
        }
      })()
    }, 6000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isHydratedFromServer) return

    const timeout = setTimeout(() => {
      void fetch("/api/state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reservations,
          waitlist,
          reminderSettings,
          automationSettings
        })
      })
    }, 250)

    return () => clearTimeout(timeout)
  }, [
    isHydratedFromServer,
    reservations,
    waitlist,
    reminderSettings,
    automationSettings
  ])

  function addReservation(entry: NewReservationEntry) {
    const createdAt = Date.now()
    setReservations(prev => {
      const nextId =
        prev.length === 0 ? 1 : Math.max(...prev.map(item => item.id)) + 1

      return [
        ...prev,
        {
          id: nextId,
          name: entry.name,
          phone: entry.phone,
          time: entry.time,
          createdAt,
          partySize: entry.partySize,
          status: "attention",
          estimatedRevenue: entry.partySize * 60,
          reminderCount: 0,
          lastReminderAt: undefined,
          filledFromWaitlist: false,
          originalGuestName: undefined
        }
      ]
    })

    setToast({
      message: `Reservatie voor ${entry.name} toegevoegd`,
      id: Date.now()
    })
  }

  function clearReservationAutomationState(ids: number[]) {
    for (const id of ids) {
      const timeout = fillTimeouts.current.get(id)
      if (timeout) {
        clearTimeout(timeout)
        fillTimeouts.current.delete(id)
      }
      inFlightReservationIds.current.delete(id)
      pendingWaitlistMatches.current.delete(id)
      pendingFallbackStatuses.current.delete(id)
      sentReminderEvents.current.delete(`${id}:1`)
      sentReminderEvents.current.delete(`${id}:2`)
    }
  }

  function removeReservation(id: number) {
    const existing = reservations.find(item => item.id === id)
    clearReservationAutomationState([id])
    setReservations(prev => prev.filter(item => item.id !== id))

    if (existing) {
      setToast({
        message: `Reservatie van ${existing.name} verwijderd`,
        id: Date.now()
      })
    }
  }

  function clearReservations() {
    if (reservations.length === 0) return
    clearReservationAutomationState(reservations.map(item => item.id))
    setReservations([])
    setToast({
      message: "Alle reservaties verwijderd",
      id: Date.now()
    })
  }

  function updateReminderSettings(next: ReminderSettings) {
    setReminderSettings(next)
  }

  function updateAutomationSettings(next: AutomationSettings) {
    setAutomationSettings(next)
  }

  function addWaitlistEntry(entry: NewWaitlistEntry) {
    setWaitlist(prev => {
      const nextId =
        prev.length === 0 ? 1 : Math.max(...prev.map(item => item.id)) + 1

      return [
        ...prev,
        {
          id: nextId,
          name: entry.name,
          phone: entry.phone,
          partySize: entry.partySize,
          status: "waiting",
          createdAt: Date.now()
        }
      ]
    })

    setToast({
      message: `${entry.name} toegevoegd aan de wachtlijst`,
      id: Date.now()
    })
  }

  function removeWaitlistEntry(id: number) {
    const removedEntry = waitlist.find(entry => entry.id === id)
    setWaitlist(prev => prev.filter(entry => entry.id !== id))

    if (removedEntry) {
      setToast({
        message: `${removedEntry.name} verwijderd van de wachtlijst`,
        id: Date.now()
      })
    }
  }

  function markWaitlistContacted(id: number) {
    const entry = waitlist.find(item => item.id === id)
    if (!entry) return

    const candidateReservation = reservations
      .filter(
        reservation =>
          (reservation.status === "expired" || reservation.status === "unfilled") &&
          reservation.partySize === entry.partySize &&
          !inFlightReservationIds.current.has(reservation.id)
      )
      .sort((a, b) => a.id - b.id)[0]

    if (!candidateReservation) {
      setToast({
        message: `Geen open tafel beschikbaar voor ${entry.partySize} personen`,
        id: Date.now()
      })
      return
    }

    inFlightReservationIds.current.add(candidateReservation.id)
    pendingWaitlistMatches.current.set(candidateReservation.id, id)
    pendingFallbackStatuses.current.set(
      candidateReservation.id,
      candidateReservation.status
    )

    setReservations(prev =>
      prev.map(reservation =>
        reservation.id === candidateReservation.id
          ? { ...reservation, status: "processing" }
          : reservation
      )
    )

    const responseTimeoutMs =
      Math.max(automationSettings.waitlistResponseMinutes, 1) * 60000
    const offerExpiresAt = Date.now() + responseTimeoutMs

    const timeout = setTimeout(() => {
      const fallbackStatus =
        pendingFallbackStatuses.current.get(candidateReservation.id) ?? "expired"

      setReservations(prev =>
        prev.map(reservation =>
          reservation.id === candidateReservation.id &&
          reservation.status === "processing"
            ? {
                ...reservation,
                status: fallbackStatus
              }
            : reservation
        )
      )
      setWaitlist(prev =>
        prev.map(waitlistEntry =>
          waitlistEntry.id === id
            ? {
                ...waitlistEntry,
                status: "declined"
              }
            : waitlistEntry
        )
      )

      setToast({
        message: `${entry.name} antwoordde niet op tijd`,
        id: Date.now()
      })

      inFlightReservationIds.current.delete(candidateReservation.id)
      pendingWaitlistMatches.current.delete(candidateReservation.id)
      pendingFallbackStatuses.current.delete(candidateReservation.id)
      fillTimeouts.current.delete(candidateReservation.id)
    }, responseTimeoutMs)

    fillTimeouts.current.set(candidateReservation.id, timeout)

    setWaitlist(prev =>
      prev.map(entry =>
        entry.id === id
          ? {
              ...entry,
              status: "contacted",
              lastContactedAt: Date.now()
            }
          : entry
      )
    )

    setToast({
      message: `${entry.name} gecontacteerd via ${formatChannelLabel(automationSettings.preferredChannel)}`,
      id: Date.now()
    })

    if (automationSettings.preferredChannel === "whatsapp" && entry.phone.trim()) {
      void sendWhatsAppMessage(
        entry.phone,
        `Hallo ${entry.name}, er is mogelijk een tafel beschikbaar voor ${entry.partySize} personen. Antwoord met JA om te bevestigen of NEE om over te slaan.`,
        "waitlist_offer",
        offerExpiresAt
      ).catch(error => {
        const timeoutForManual = fillTimeouts.current.get(candidateReservation.id)
        if (timeoutForManual) {
          clearTimeout(timeoutForManual)
          fillTimeouts.current.delete(candidateReservation.id)
        }
        setReservations(prev =>
          prev.map(reservation =>
            reservation.id === candidateReservation.id &&
            reservation.status === "processing"
              ? { ...reservation, status: candidateReservation.status }
              : reservation
          )
        )
        setWaitlist(prev =>
          prev.map(waitlistEntry =>
            waitlistEntry.id === id
              ? {
                  ...waitlistEntry,
                  status: "waiting"
                }
              : waitlistEntry
          )
        )
        inFlightReservationIds.current.delete(candidateReservation.id)
        pendingWaitlistMatches.current.delete(candidateReservation.id)
        pendingFallbackStatuses.current.delete(candidateReservation.id)
        setToast({
          message: `WhatsApp fout: ${error.message}`,
          id: Date.now()
        })
      })
    }
  }

  // MATCHING ENGINE
  useEffect(() => {
    const expiredReservation = reservations.find(
      r =>
        r.status === "expired" &&
        !inFlightReservationIds.current.has(r.id)
    )

    if (!expiredReservation) return

    const match = waitlist
      .filter(
        p =>
          p.partySize === expiredReservation.partySize &&
          (p.status ?? "waiting") === "waiting"
      )
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0]

    if (!match) {
      setReservations(prev =>
        prev.map(r =>
          r.id === expiredReservation.id
            ? { ...r, status: "unfilled" }
            : r
        )
      )
      setToast({
        message: `Geen match gevonden voor tafel van ${expiredReservation.partySize} personen`,
        id: Date.now()
      })
      return
    }

    inFlightReservationIds.current.add(expiredReservation.id)

    setReservations(prev =>
      prev.map(r =>
        r.id === expiredReservation.id
          ? { ...r, status: "processing" }
          : r
      )
    )

    setWaitlist(prev =>
      prev.map(p =>
        p.id === match.id
          ? {
              ...p,
              status: "contacted",
              lastContactedAt: Date.now()
            }
          : p
      )
    )

    setToast({
      message: `${formatChannelLabel(automationSettings.preferredChannel)} verstuurd naar ${match.name}`,
      id: Date.now()
    })

    const responseTimeoutMs =
      Math.max(automationSettings.waitlistResponseMinutes, 1) * 60000
    const offerExpiresAt = Date.now() + responseTimeoutMs

    if (automationSettings.preferredChannel === "whatsapp" && match.phone.trim()) {
      void sendWhatsAppMessage(
        match.phone,
        `Er is nu een tafel vrijgekomen voor ${match.partySize} personen. Antwoord met JA om deze te nemen of NEE om over te slaan.`,
        "waitlist_offer",
        offerExpiresAt
      ).catch(error => {
        const timeout = fillTimeouts.current.get(expiredReservation.id)
        if (timeout) {
          clearTimeout(timeout)
          fillTimeouts.current.delete(expiredReservation.id)
        }
        setReservations(prev =>
          prev.map(r =>
            r.id === expiredReservation.id && r.status === "processing"
              ? { ...r, status: "expired" }
              : r
          )
        )
        setWaitlist(prev =>
          prev.map(p =>
            p.id === match.id
              ? {
                  ...p,
                  status: "waiting"
                }
              : p
          )
        )
        inFlightReservationIds.current.delete(expiredReservation.id)
        pendingWaitlistMatches.current.delete(expiredReservation.id)
        pendingFallbackStatuses.current.delete(expiredReservation.id)
        setToast({
          message: `WhatsApp fout: ${error.message}`,
          id: Date.now()
        })
      })
    }

    pendingWaitlistMatches.current.set(expiredReservation.id, match.id)
    pendingFallbackStatuses.current.set(expiredReservation.id, "expired")

    const timeout = setTimeout(() => {
      setReservations(prev =>
        prev.map(r =>
          r.id === expiredReservation.id &&
          r.status === "processing"
            ? {
                ...r,
                status: "expired"
              }
            : r
        )
      )
      setWaitlist(prev =>
        prev.map(p =>
          p.id === match.id
            ? {
                ...p,
                status: "declined"
              }
            : p
        )
      )

      setToast({
        message: `${match.name} antwoordde niet op tijd`,
        id: Date.now()
      })

      inFlightReservationIds.current.delete(expiredReservation.id)
      pendingWaitlistMatches.current.delete(expiredReservation.id)
      pendingFallbackStatuses.current.delete(expiredReservation.id)
      fillTimeouts.current.delete(expiredReservation.id)
    }, responseTimeoutMs)

    fillTimeouts.current.set(expiredReservation.id, timeout)
  }, [reservations, waitlist, automationSettings])

  useEffect(() => {
    const interval = setInterval(() => {
      const entries = Array.from(pendingWaitlistMatches.current.entries())
      if (entries.length === 0) return

      void (async () => {
        for (const [reservationId, waitlistId] of entries) {
          const reservation = reservationsRef.current.find(r => r.id === reservationId)
          const waitlistEntry = waitlist.find(w => w.id === waitlistId)
          if (!reservation || reservation.status !== "processing" || !waitlistEntry) {
            continue
          }

          const payload = await getWhatsAppConfirmation(waitlistEntry.phone)
          const confirmed = Boolean(payload?.confirmed)
          const declined = Boolean(payload?.declined)
          const updatedAt = Number(payload?.updatedAt ?? 0)
          const contactedAt = Number(waitlistEntry.lastContactedAt ?? 0)

          if (!contactedAt || updatedAt < contactedAt) continue
          if (!confirmed && !declined) continue

          const timeout = fillTimeouts.current.get(reservationId)
          if (timeout) {
            clearTimeout(timeout)
            fillTimeouts.current.delete(reservationId)
          }

          if (confirmed) {
            setReservations(prev =>
              prev.map(r =>
                r.id === reservationId && r.status === "processing"
                  ? {
                      ...r,
                      status: "filled",
                      originalGuestName: r.originalGuestName ?? r.name,
                      name: waitlistEntry.name,
                      phone: waitlistEntry.phone,
                      filledFromWaitlist: true
                    }
                  : r
              )
            )
            setWaitlist(prev => prev.filter(w => w.id !== waitlistId))
            setToast({
              message: `${waitlistEntry.name} bevestigde de tafel`,
              id: Date.now()
            })
          } else {
            const fallbackStatus =
              pendingFallbackStatuses.current.get(reservationId) ?? "expired"
            setReservations(prev =>
              prev.map(r =>
                r.id === reservationId && r.status === "processing"
                  ? { ...r, status: fallbackStatus }
                  : r
              )
            )
            setWaitlist(prev =>
              prev.map(w =>
                w.id === waitlistId
                  ? {
                      ...w,
                      status: "declined"
                    }
                  : w
              )
            )
            setToast({
              message: `${waitlistEntry.name} sloeg de tafel over`,
              id: Date.now()
            })
          }

          inFlightReservationIds.current.delete(reservationId)
          pendingWaitlistMatches.current.delete(reservationId)
          pendingFallbackStatuses.current.delete(reservationId)
        }
      })()
    }, 4000)

    return () => clearInterval(interval)
  }, [waitlist])

  useEffect(() => {
    const timeouts = fillTimeouts.current
    const inFlight = inFlightReservationIds.current
    const pendingMatches = pendingWaitlistMatches.current
    const fallbackStatuses = pendingFallbackStatuses.current

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout))
      timeouts.clear()
      inFlight.clear()
      pendingMatches.clear()
      fallbackStatuses.clear()
    }
  }, [])

  return (
    <ReservationContext.Provider
      value={{
        reservations,
        waitlist,
        reminderSettings,
        automationSettings,
        toast,
        addReservation,
        removeReservation,
        clearReservations,
        updateReminderSettings,
        updateAutomationSettings,
        addWaitlistEntry,
        removeWaitlistEntry,
        markWaitlistContacted
      }}
    >
      {children}
    </ReservationContext.Provider>
  )
}

export function useReservations() {
  const context = useContext(ReservationContext)
  if (!context) {
    throw new Error("useReservations must be used within ReservationProvider")
  }
  return context
}
