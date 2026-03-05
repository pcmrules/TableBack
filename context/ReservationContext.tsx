"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useRef
} from "react"

import {
  Reservation
} from "@/data/reservations"

import type { WaitlistEntry } from "@/data/waitlist"
import { normalizePhone } from "@/lib/phone"
import {
  DEFAULT_AUTOMATION_SETTINGS,
  DEFAULT_REMINDER_SETTINGS,
  type AutomationSettings,
  type ContactChannel,
  type ReminderSettings
} from "@/lib/shared/settings"

type PersistedAppState = {
  reservations: Reservation[]
  waitlist: WaitlistEntry[]
  reminderSettings: ReminderSettings
  automationSettings: AutomationSettings
}

const PREFERRED_CHANNEL_STORAGE_KEY = "tableback.preferredChannel"

function isValidContactChannel(value: string): value is ContactChannel {
  return (
    value === "whatsapp" ||
    value === "sms" ||
    value === "both" ||
    value === "email"
  )
}

function getStoredPreferredChannel(): ContactChannel | null {
  if (typeof window === "undefined") return null
  const value = window.localStorage.getItem(PREFERRED_CHANNEL_STORAGE_KEY)
  return value && isValidContactChannel(value) ? value : null
}

function storePreferredChannel(channel: ContactChannel) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PREFERRED_CHANNEL_STORAGE_KEY, channel)
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

function formatBrusselsDate(referenceTimestamp: number): string {
  const parts = getBrusselsNowParts(referenceTimestamp)
  const day = String(parts.day).padStart(2, "0")
  const month = String(parts.month).padStart(2, "0")
  return `${day}/${month}/${parts.year}`
}

function formatChannelLabel(channel: ContactChannel): string {
  if (channel === "whatsapp") return "WhatsApp"
  if (channel === "sms") return "SMS"
  if (channel === "both") return "WhatsApp + SMS"
  return "E-mail"
}

function isWhatsAppChannel(channel: ContactChannel): boolean {
  return channel === "whatsapp" || channel === "both"
}

function isSmsChannel(channel: ContactChannel): boolean {
  return channel === "sms" || channel === "both"
}

async function sendWhatsAppMessage(
  to: string,
  message: string,
  conversationType: "reservation_confirmation" | "waitlist_offer",
  offerExpiresAt?: number,
  templateKey?:
    | "reminder_first"
    | "reminder_final"
    | "confirmation"
    | "cancellation"
    | "waitlist_offer",
  templateVariables?: Record<string, string | number | boolean>
): Promise<void> {
  const response = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to,
      message,
      conversationType,
      offerExpiresAt,
      templateKey,
      templateVariables
    })
  })

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string }
    throw new Error(payload.error ?? "WhatsApp verzending mislukt.")
  }
}

async function sendSmsMessage(
  to: string,
  message: string,
  conversationType: "reservation_confirmation" | "waitlist_offer",
  offerExpiresAt?: number
): Promise<void> {
  const response = await fetch("/api/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ to, message, conversationType, offerExpiresAt })
  })

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string }
    throw new Error(payload.error ?? "SMS verzending mislukt.")
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

function supportsReplyAutomation(channel: ContactChannel): boolean {
  return isWhatsAppChannel(channel) || isSmsChannel(channel)
}

function buildSmsResponseLinks(phone: string): { yes: string; no: string } | null {
  if (typeof window === "undefined") return null
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return null

  const origin = window.location.origin
  const base = `${origin}/api/sms/respond?phone=${encodeURIComponent(normalizedPhone)}`
  return {
    yes: `${base}&action=yes`,
    no: `${base}&action=no`
  }
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
  removeReservation: (id: string) => void
  clearReservations: () => void
  updateReminderSettings: (next: ReminderSettings) => void
  updateAutomationSettings: (next: AutomationSettings) => void
  addWaitlistEntry: (entry: NewWaitlistEntry) => void
  removeWaitlistEntry: (id: string) => void
  markWaitlistContacted: (id: string) => void
}

const ReservationContext = createContext<ReservationContextType | undefined>(
  undefined
)

export function ReservationProvider({
  children
}: {
  children: ReactNode
}) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null)
  const [currentRestaurantName, setCurrentRestaurantName] = useState<string>("Restaurant")
  const [isAuthResolved, setIsAuthResolved] = useState(false)

  const [toast, setToast] =
    useState<{ message: string; id: number } | null>(null)
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS)
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettings>(DEFAULT_AUTOMATION_SETTINGS)
  const [isHydratedFromServer, setIsHydratedFromServer] = useState(false)

  const inFlightReservationIds = useRef<Set<string>>(new Set())
  const fillTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  )
  const pendingWaitlistMatches = useRef<Map<string, string>>(new Map())
  const pendingFallbackStatuses = useRef<Map<string, Reservation["status"]>>(
    new Map()
  )
  const reservationsRef = useRef<Reservation[]>(reservations)
  const sentReminderEvents = useRef<Set<string>>(new Set())
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedSignature = useRef<string>("")

  function buildSnapshotSignature(snapshot: {
    reservations: Reservation[]
    waitlist: WaitlistEntry[]
    reminderSettings: ReminderSettings
    automationSettings: AutomationSettings
  }): string {
    return JSON.stringify(snapshot)
  }

  useEffect(() => {
    const storedPreferredChannel = getStoredPreferredChannel()
    if (!storedPreferredChannel) return
    setAutomationSettings(prev => ({
      ...prev,
      preferredChannel: storedPreferredChannel
    }))
  }, [])

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" })
        if (!active) return

        if (!response.ok) {
          setCurrentUserId(null)
          setCurrentRestaurantId(null)
          setCurrentRestaurantName("Restaurant")
          setIsAuthResolved(true)
          return
        }

        const payload = (await response.json()) as {
          ok?: boolean
          user?: { id?: string }
          restaurant?: { id?: string; name?: string } | null
        }
        setCurrentUserId(payload.ok && payload.user?.id ? payload.user.id : null)
        setCurrentRestaurantId(
          payload.ok && payload.restaurant?.id ? payload.restaurant.id : null
        )
        setCurrentRestaurantName(
          payload.ok && payload.restaurant?.name?.trim()
            ? payload.restaurant.name.trim()
            : "Restaurant"
        )
      } catch {
        if (!active) return
        setCurrentUserId(null)
        setCurrentRestaurantId(null)
        setCurrentRestaurantName("Restaurant")
      } finally {
        if (active) setIsAuthResolved(true)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const reloadFromDatabase = useCallback(async (): Promise<void> => {
    if (!currentUserId || !currentRestaurantId) return

    const response = await fetch("/api/state", { cache: "no-store" })
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      console.error(
        "State fetch error:",
        payload.error ?? "Kon serverstate niet laden."
      )
      return
    }

    const payload = (await response.json()) as {
      ok?: boolean
      state?: Partial<PersistedAppState>
    }
    if (!payload.ok || !payload.state) return

    const nextReservations = Array.isArray(payload.state.reservations)
      ? payload.state.reservations.map(normalizeReservation)
      : []
    const nextWaitlist = Array.isArray(payload.state.waitlist)
      ? payload.state.waitlist.map(entry =>
          normalizeWaitlistEntry(entry, Date.now())
        )
      : []
    const nextReminderSettings =
      payload.state.reminderSettings ?? DEFAULT_REMINDER_SETTINGS
    const nextAutomationSettings =
      payload.state.automationSettings ?? DEFAULT_AUTOMATION_SETTINGS
    const storedPreferredChannel = getStoredPreferredChannel()

    setReservations(nextReservations)
    setWaitlist(nextWaitlist)
    setReminderSettings(nextReminderSettings)
    setAutomationSettings({
      ...nextAutomationSettings,
      preferredChannel:
        storedPreferredChannel ?? nextAutomationSettings.preferredChannel
    })
    lastSyncedSignature.current = buildSnapshotSignature({
      reservations: nextReservations,
      waitlist: nextWaitlist,
      reminderSettings: nextReminderSettings,
      automationSettings: nextAutomationSettings
    })
  }, [currentRestaurantId, currentUserId])

  const syncSnapshotToDatabase = useCallback(async (snapshot: {
    reservations: Reservation[]
    waitlist: WaitlistEntry[]
    reminderSettings: ReminderSettings
    automationSettings: AutomationSettings
  }): Promise<void> => {
    if (!currentUserId) return

    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot)
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      setToast({
        message: payload.error
          ? `Sync fout: ${payload.error}`
          : "Sync fout: kon serverstate niet opslaan",
        id: Date.now()
      })
      return
    }
    lastSyncedSignature.current = buildSnapshotSignature(snapshot)
  }, [currentUserId])

  useEffect(() => {
    let active = true

    void (async () => {
      if (!currentUserId) {
        if (active) {
          setReservations([])
          setWaitlist([])
          setReminderSettings(DEFAULT_REMINDER_SETTINGS)
          setAutomationSettings(DEFAULT_AUTOMATION_SETTINGS)
          setIsHydratedFromServer(isAuthResolved)
        }
        return
      }
      await reloadFromDatabase()
      if (active) {
        setIsHydratedFromServer(true)
      }
    })()

    return () => {
      active = false
    }
  }, [currentUserId, isAuthResolved, reloadFromDatabase])

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
        string,
        {
          status: Reservation["status"]
          reminderCount: number
          lastReminderAt?: number
        }
      >()

      const nowDate = formatBrusselsDate(now)
      const toSend: Array<{
        name: string
        phone: string
        text: string
        templateKey: "reminder_first" | "reminder_final"
        templateVariables: Record<string, string | number | boolean>
      }> = []
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
            if (
              (isWhatsAppChannel(automationSettings.preferredChannel) ||
                isSmsChannel(automationSettings.preferredChannel)) &&
              reservation.phone.trim()
            ) {
              toSend.push({
                name: reservation.name,
                phone: reservation.phone,
                text: `Laatste herinnering: bevestig je reservatie om ${reservation.time}. Antwoord met JA om te bevestigen of NEE om te annuleren.`,
                templateKey: "reminder_final",
                templateVariables: {
                  "1": reservation.name,
                  "2": currentRestaurantName,
                  "3": nowDate,
                  "4": reservation.time
                }
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
            if (
              (isWhatsAppChannel(automationSettings.preferredChannel) ||
                isSmsChannel(automationSettings.preferredChannel)) &&
              reservation.phone.trim()
            ) {
              toSend.push({
                name: reservation.name,
                phone: reservation.phone,
                text: `Dag ${reservation.name}, bevestig je reservatie om ${reservation.time} voor ${reservation.partySize} personen. Antwoord met JA om te bevestigen of NEE om te annuleren.`,
                templateKey: "reminder_first",
                templateVariables: {
                  "1": reservation.name,
                  "2": currentRestaurantName,
                  "3": nowDate,
                  "4": reservation.time
                }
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
        if (isWhatsAppChannel(automationSettings.preferredChannel)) {
          void sendWhatsAppMessage(
            outbound.phone,
            outbound.text,
            "reservation_confirmation",
            undefined,
            outbound.templateKey,
            outbound.templateVariables
          ).catch(error => {
            setToast({
              message: `WhatsApp fout: ${error.message}`,
              id: Date.now()
            })
          })
        }
        if (isSmsChannel(automationSettings.preferredChannel)) {
          const links = buildSmsResponseLinks(outbound.phone)
          const smsText = links
            ? `${outbound.text} Bevestig: ${links.yes} Weiger: ${links.no}`
            : outbound.text
          void sendSmsMessage(
            outbound.phone,
            smsText,
            "reservation_confirmation"
          ).catch(error => {
            setToast({
              message: `SMS fout: ${error.message}`,
              id: Date.now()
            })
          })
        }
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [
    reminderSettings.firstReminderMinutesBefore,
    reminderSettings.finalReminderMinutesBefore,
    automationSettings.noShowThresholdMinutes,
    automationSettings.preferredChannel,
    currentRestaurantName
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      const attentionReservations = reservationsRef.current.filter(
        reservation =>
          reservation.status === "attention" &&
          reservation.reminderCount > 0 &&
          reservation.phone.trim().length > 0
      )
      if (!supportsReplyAutomation(automationSettings.preferredChannel)) return

      void (async () => {
        const confirmedIds = new Set<string>()
        const declinedIds = new Set<string>()

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
  }, [automationSettings.preferredChannel])

  useEffect(() => {
    if (!isHydratedFromServer) return

    if (syncTimeout.current) {
      clearTimeout(syncTimeout.current)
    }

    const snapshot = {
      reservations,
      waitlist,
      reminderSettings,
      automationSettings
    }
    const snapshotSignature = buildSnapshotSignature(snapshot)
    if (snapshotSignature === lastSyncedSignature.current) return

    syncTimeout.current = setTimeout(() => {
      void syncSnapshotToDatabase(snapshot)
    }, 250)

    return () => {
      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current)
      }
    }
  }, [
    isHydratedFromServer,
    reservations,
    waitlist,
    reminderSettings,
    automationSettings,
    syncSnapshotToDatabase
  ])

  function addReservation(entry: NewReservationEntry) {
    if (!currentUserId) {
      setToast({
        message: "Niet ingelogd",
        id: Date.now()
      })
      return
    }

    const createdAt = Date.now()
    setReservations(prev => {
      const nextId = crypto.randomUUID()

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

  function clearReservationAutomationState(ids: string[]) {
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

  function removeReservation(id: string) {
    if (!currentUserId) {
      setToast({
        message: "Niet ingelogd",
        id: Date.now()
      })
      return
    }

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
    if (!currentUserId) {
      setToast({
        message: "Niet ingelogd",
        id: Date.now()
      })
      return
    }
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
    storePreferredChannel(next.preferredChannel)
  }

  function addWaitlistEntry({ name, phone, partySize }: NewWaitlistEntry) {
    if (!currentUserId) {
      setToast({
        message: "Niet ingelogd",
        id: Date.now()
      })
      return
    }
    setWaitlist(prev => {
      const nextId = crypto.randomUUID()

      return [
        ...prev,
        {
          id: nextId,
          name,
          phone,
          partySize,
          status: "waiting",
          createdAt: Date.now()
        }
      ]
    })
    setToast({
      message: `${name} toegevoegd aan de wachtlijst`,
      id: Date.now()
    })
  }

  function removeWaitlistEntry(id: string) {
    if (!currentUserId) {
      setToast({
        message: "Niet ingelogd",
        id: Date.now()
      })
      return
    }
    const removedEntry = waitlist.find(entry => entry.id === id)
    setWaitlist(prev => prev.filter(entry => entry.id !== id))

    if (removedEntry) {
      setToast({
        message: `${removedEntry.name} verwijderd van de wachtlijst`,
        id: Date.now()
      })
    }
  }

  function markWaitlistContacted(id: string) {
    const entry = waitlist.find(item => item.id === id)
    if (!entry) return
    const replyAutomationEnabled = supportsReplyAutomation(
      automationSettings.preferredChannel
    )
    const whatsappEnabled = isWhatsAppChannel(automationSettings.preferredChannel)
    const smsEnabled = isSmsChannel(automationSettings.preferredChannel)

    const candidateReservation = reservations
      .filter(
        reservation =>
          (reservation.status === "expired" || reservation.status === "unfilled") &&
          reservation.partySize === entry.partySize &&
          !inFlightReservationIds.current.has(reservation.id)
      )
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0]

    if (!candidateReservation) {
      setToast({
        message: `Geen open tafel beschikbaar voor ${entry.partySize} personen`,
        id: Date.now()
      })
      return
    }

    if (!replyAutomationEnabled) {
      setWaitlist(prev =>
        prev.map(waitlistEntry =>
          waitlistEntry.id === id
            ? {
                ...waitlistEntry,
                status: "contacted",
                lastContactedAt: Date.now()
              }
            : waitlistEntry
        )
      )

      setToast({
        message: `${entry.name} gecontacteerd via ${formatChannelLabel(automationSettings.preferredChannel)} (manuele opvolging)`,
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

    if (whatsappEnabled && entry.phone.trim()) {
      void sendWhatsAppMessage(
        entry.phone,
        `Hallo ${entry.name}, er is mogelijk een tafel beschikbaar voor ${entry.partySize} personen. Antwoord met JA om te bevestigen of NEE om over te slaan.`,
        "waitlist_offer",
        offerExpiresAt,
        "waitlist_offer",
        {
          "1": entry.name,
          "2": currentRestaurantName,
          "3": formatBrusselsDate(Date.now()),
          "4": candidateReservation.time
        }
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
    if (smsEnabled && entry.phone.trim()) {
      const links = buildSmsResponseLinks(entry.phone)
      const smsText = links
        ? `Hallo ${entry.name}, er is mogelijk een tafel beschikbaar voor ${entry.partySize} personen. Bevestig: ${links.yes} Weiger: ${links.no}`
        : `Hallo ${entry.name}, er is mogelijk een tafel beschikbaar voor ${entry.partySize} personen. Antwoord met JA om te bevestigen of NEE om over te slaan.`
      void sendSmsMessage(
        entry.phone,
        smsText,
        "waitlist_offer",
        offerExpiresAt
      ).catch(error => {
        setToast({
          message: `SMS fout: ${error.message}`,
          id: Date.now()
        })
      })
    }
  }

  // MATCHING ENGINE
  useEffect(() => {
    if (!supportsReplyAutomation(automationSettings.preferredChannel)) return
    const whatsappEnabled = isWhatsAppChannel(automationSettings.preferredChannel)
    const smsEnabled = isSmsChannel(automationSettings.preferredChannel)

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

    if (whatsappEnabled && match.phone.trim()) {
      void sendWhatsAppMessage(
        match.phone,
        `Er is nu een tafel vrijgekomen voor ${match.partySize} personen. Antwoord met JA om deze te nemen of NEE om over te slaan.`,
        "waitlist_offer",
        offerExpiresAt,
        "waitlist_offer",
        {
          "1": match.name,
          "2": currentRestaurantName,
          "3": formatBrusselsDate(Date.now()),
          "4": expiredReservation.time
        }
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
    if (smsEnabled && match.phone.trim()) {
      const links = buildSmsResponseLinks(match.phone)
      const smsText = links
        ? `Er is nu een tafel vrijgekomen voor ${match.partySize} personen. Bevestig: ${links.yes} Weiger: ${links.no}`
        : `Er is nu een tafel vrijgekomen voor ${match.partySize} personen. Antwoord met JA om deze te nemen of NEE om over te slaan.`
      void sendSmsMessage(
        match.phone,
        smsText,
        "waitlist_offer",
        offerExpiresAt
      ).catch(error => {
        setToast({
          message: `SMS fout: ${error.message}`,
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
  }, [reservations, waitlist, automationSettings, currentRestaurantName])

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
    if (!currentUserId || !currentRestaurantId) return

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return
      void reloadFromDatabase()
    }, 4000)

    const onFocus = () => {
      void reloadFromDatabase()
    }
    window.addEventListener("focus", onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [currentRestaurantId, currentUserId, reloadFromDatabase])

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
