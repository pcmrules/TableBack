"use client"

import { supabase } from "@/lib/supabaseClient"

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

type ReservationRow = {
  id: string
  user_id: string | null
  name: string
  phone: string | null
  time: string
  created_at: string | null
  party_size: number
  status: Reservation["status"]
  filled_from_waitlist: boolean | null
  original_guest_name: string | null
  estimated_revenue: number
  reminder_count: number | null
  last_reminder_at: string | null
}

type WaitlistRow = {
  id: string
  user_id: string | null
  name: string
  phone: string
  party_size: number
  status: "waiting" | "contacted" | "declined" | null
  created_at: string | null
  last_contacted_at: string | null
}

type SettingsRow = {
  id?: number
  user_id: string | null
  first_reminder_minutes_before: number | null
  final_reminder_minutes_before: number | null
  no_show_threshold_minutes: number | null
  waitlist_response_minutes: number | null
  preferred_channel: ContactChannel | null
}

function parseDatabaseTimestamp(value: string | null): number | undefined {
  if (!value) return undefined

  const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)
  const normalized = value.includes(" ") ? value.replace(" ", "T") : value
  const candidate = hasTimezone ? normalized : `${normalized}Z`
  const parsed = Date.parse(candidate)
  return Number.isFinite(parsed) ? parsed : undefined
}

function reservationFromRow(row: ReservationRow): Reservation {
  return normalizeReservation({
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    time: row.time,
    createdAt: parseDatabaseTimestamp(row.created_at) ?? Date.now(),
    partySize: row.party_size,
    status: row.status,
    filledFromWaitlist: Boolean(row.filled_from_waitlist),
    originalGuestName: row.original_guest_name ?? undefined,
    estimatedRevenue: row.estimated_revenue,
    reminderCount: typeof row.reminder_count === "number" ? row.reminder_count : 0,
    lastReminderAt: parseDatabaseTimestamp(row.last_reminder_at)
  })
}

function waitlistFromRow(row: WaitlistRow): WaitlistEntry {
  return normalizeWaitlistEntry(
    {
      id: row.id,
      name: row.name,
      phone: row.phone,
      partySize: row.party_size,
      status: row.status ?? "waiting",
      createdAt: parseDatabaseTimestamp(row.created_at),
      lastContactedAt: parseDatabaseTimestamp(row.last_contacted_at)
    },
    Date.now()
  )
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
    let active = true

    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" })
        if (!active) return

        if (!response.ok) {
          setCurrentUserId(null)
          setIsAuthResolved(true)
          return
        }

        const payload = (await response.json()) as {
          ok?: boolean
          user?: { id?: string }
        }
        setCurrentUserId(payload.ok && payload.user?.id ? payload.user.id : null)
      } catch {
        if (!active) return
        setCurrentUserId(null)
      } finally {
        if (active) setIsAuthResolved(true)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  const fetchReservationsFromDatabase = useCallback(async (): Promise<
    Reservation[]
  > => {
    if (!currentUserId) return []

    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Supabase reservations fetch error:", error)
      return []
    }

    const rows = (data ?? []) as unknown as ReservationRow[]
    return rows.map(reservationFromRow)
  }, [currentUserId])

  const fetchWaitlistFromDatabase = useCallback(async (): Promise<
    WaitlistEntry[]
  > => {
    if (!currentUserId) return []

    const { data, error } = await supabase
      .from("waitlist")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Supabase waitlist fetch error:", error)
      return []
    }

    const rows = (data ?? []) as unknown as WaitlistRow[]
    return rows.map(waitlistFromRow)
  }, [currentUserId])

  const fetchSettingsFromDatabase = useCallback(async (): Promise<{
    reminder: ReminderSettings
    automation: AutomationSettings
  }> => {
    if (!currentUserId) {
      return {
        reminder: DEFAULT_REMINDER_SETTINGS,
        automation: DEFAULT_AUTOMATION_SETTINGS
      }
    }

    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", currentUserId)
      .maybeSingle()

    if (error) {
      console.error("Supabase settings fetch error:", error)
      return {
        reminder: DEFAULT_REMINDER_SETTINGS,
        automation: DEFAULT_AUTOMATION_SETTINGS
      }
    }

    if (!data) {
      return {
        reminder: DEFAULT_REMINDER_SETTINGS,
        automation: DEFAULT_AUTOMATION_SETTINGS
      }
    }

    const row = data as unknown as SettingsRow
    const preferredChannel =
      row.preferred_channel === "whatsapp" ||
      row.preferred_channel === "sms" ||
      row.preferred_channel === "email"
        ? row.preferred_channel
        : DEFAULT_AUTOMATION_SETTINGS.preferredChannel

    return {
      reminder: {
        firstReminderMinutesBefore:
          row.first_reminder_minutes_before ??
          DEFAULT_REMINDER_SETTINGS.firstReminderMinutesBefore,
        finalReminderMinutesBefore:
          row.final_reminder_minutes_before ??
          DEFAULT_REMINDER_SETTINGS.finalReminderMinutesBefore
      },
      automation: {
        noShowThresholdMinutes:
          row.no_show_threshold_minutes ??
          DEFAULT_AUTOMATION_SETTINGS.noShowThresholdMinutes,
        waitlistResponseMinutes:
          row.waitlist_response_minutes ??
          DEFAULT_AUTOMATION_SETTINGS.waitlistResponseMinutes,
        preferredChannel
      }
    }
  }, [currentUserId])

  const reloadFromDatabase = useCallback(async (): Promise<void> => {
    const [nextReservations, nextWaitlist, settings] = await Promise.all([
      fetchReservationsFromDatabase(),
      fetchWaitlistFromDatabase(),
      fetchSettingsFromDatabase()
    ])

    setReservations(nextReservations)
    setWaitlist(nextWaitlist)
    setReminderSettings(settings.reminder)
    setAutomationSettings(settings.automation)
    lastSyncedSignature.current = buildSnapshotSignature({
      reservations: nextReservations,
      waitlist: nextWaitlist,
      reminderSettings: settings.reminder,
      automationSettings: settings.automation
    })
  }, [
    fetchReservationsFromDatabase,
    fetchSettingsFromDatabase,
    fetchWaitlistFromDatabase
  ])

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
  }, [])

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
    if (!currentUserId) return

    let reloadTimeout: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = () => {
      if (reloadTimeout) clearTimeout(reloadTimeout)
      reloadTimeout = setTimeout(() => {
        void reloadFromDatabase()
      }, 150)
    }

    const channel = supabase
      .channel(`tableback-sync-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `user_id=eq.${currentUserId}`
        },
        scheduleReload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waitlist",
          filter: `user_id=eq.${currentUserId}`
        },
        scheduleReload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "settings",
          filter: `user_id=eq.${currentUserId}`
        },
        scheduleReload
      )
      .subscribe()

    return () => {
      if (reloadTimeout) clearTimeout(reloadTimeout)
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, reloadFromDatabase])

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
