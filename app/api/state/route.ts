import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { getSessionUserFromCookieHeader } from "@/lib/server/auth"
import { supabaseAdmin } from "@/lib/server/supabaseAdmin"
import type { Reservation } from "@/data/reservations"
import type { WaitlistEntry } from "@/data/waitlist"
import {
  DEFAULT_AUTOMATION_SETTINGS,
  DEFAULT_REMINDER_SETTINGS,
  type AutomationSettings,
  type ReminderSettings
} from "@/lib/shared/settings"

type PersistedAppState = {
  reservations: Reservation[]
  waitlist: WaitlistEntry[]
  reminderSettings: ReminderSettings
  automationSettings: AutomationSettings
}

type ReservationRow = {
  id: string
  user_id: string
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
  user_id: string
  name: string
  phone: string
  party_size: number
  status: "waiting" | "contacted" | "declined" | null
  created_at: string | null
  last_contacted_at: string | null
}

type SettingsRow = {
  id?: number
  user_id: string
  first_reminder_minutes_before: number | null
  final_reminder_minutes_before: number | null
  no_show_threshold_minutes: number | null
  waitlist_response_minutes: number | null
  preferred_channel: "whatsapp" | "sms" | "email" | null
}

function ensureUuidId(value: unknown): string {
  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value
  }
  return crypto.randomUUID()
}

function parseTimestamp(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(value.includes(" ") ? value.replace(" ", "T") : value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function reservationFromRow(row: ReservationRow): Reservation {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    time: row.time,
    createdAt: parseTimestamp(row.created_at) ?? Date.now(),
    partySize: row.party_size,
    status: row.status,
    filledFromWaitlist: Boolean(row.filled_from_waitlist),
    originalGuestName: row.original_guest_name ?? undefined,
    estimatedRevenue: row.estimated_revenue,
    reminderCount: row.reminder_count ?? 0,
    lastReminderAt: parseTimestamp(row.last_reminder_at)
  }
}

function reservationToRow(entry: Reservation, userId: string): ReservationRow {
  return {
    id: entry.id,
    user_id: userId,
    name: entry.name,
    phone: entry.phone,
    time: entry.time,
    created_at: new Date(entry.createdAt ?? Date.now()).toISOString(),
    party_size: entry.partySize,
    status: entry.status,
    filled_from_waitlist: Boolean(entry.filledFromWaitlist),
    original_guest_name: entry.originalGuestName ?? null,
    estimated_revenue: entry.estimatedRevenue,
    reminder_count: entry.reminderCount,
    last_reminder_at: entry.lastReminderAt
      ? new Date(entry.lastReminderAt).toISOString()
      : null
  }
}

function waitlistFromRow(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    partySize: row.party_size,
    status: row.status ?? "waiting",
    createdAt: parseTimestamp(row.created_at),
    lastContactedAt: parseTimestamp(row.last_contacted_at)
  }
}

function waitlistToRow(entry: WaitlistEntry, userId: string): WaitlistRow {
  return {
    id: entry.id,
    user_id: userId,
    name: entry.name,
    phone: entry.phone,
    party_size: entry.partySize,
    status: entry.status ?? "waiting",
    created_at: new Date(entry.createdAt ?? Date.now()).toISOString(),
    last_contacted_at: entry.lastContactedAt
      ? new Date(entry.lastContactedAt).toISOString()
      : null
  }
}

export async function GET(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  const [reservationsResult, waitlistResult, settingsResult] = await Promise.all([
    supabaseAdmin
      .from("reservations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("waitlist")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("settings").select("*").eq("user_id", user.id).maybeSingle()
  ])

  if (reservationsResult.error || waitlistResult.error || settingsResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          reservationsResult.error?.message ??
          waitlistResult.error?.message ??
          settingsResult.error?.message ??
          "Kon state niet laden."
      },
      { status: 500 }
    )
  }

  const settings = settingsResult.data as SettingsRow | null
  const preferredChannel =
    settings?.preferred_channel === "whatsapp" ||
    settings?.preferred_channel === "sms" ||
    settings?.preferred_channel === "email"
      ? settings.preferred_channel
      : DEFAULT_AUTOMATION_SETTINGS.preferredChannel

  const state: PersistedAppState = {
    reservations: ((reservationsResult.data ?? []) as ReservationRow[]).map(
      reservationFromRow
    ),
    waitlist: ((waitlistResult.data ?? []) as WaitlistRow[]).map(waitlistFromRow),
    reminderSettings: {
      firstReminderMinutesBefore:
        settings?.first_reminder_minutes_before ??
        DEFAULT_REMINDER_SETTINGS.firstReminderMinutesBefore,
      finalReminderMinutesBefore:
        settings?.final_reminder_minutes_before ??
        DEFAULT_REMINDER_SETTINGS.finalReminderMinutesBefore
    },
    automationSettings: {
      noShowThresholdMinutes:
        settings?.no_show_threshold_minutes ??
        DEFAULT_AUTOMATION_SETTINGS.noShowThresholdMinutes,
      waitlistResponseMinutes:
        settings?.waitlist_response_minutes ??
        DEFAULT_AUTOMATION_SETTINGS.waitlistResponseMinutes,
      preferredChannel
    }
  }

  return NextResponse.json({ ok: true, state })
}

export async function PUT(request: Request) {
  const user = getSessionUserFromCookieHeader(request.headers.get("cookie") ?? "")
  if (!user) {
    return NextResponse.json({ ok: false, error: "Niet ingelogd." }, { status: 401 })
  }

  let body: Partial<PersistedAppState>
  try {
    body = (await request.json()) as Partial<PersistedAppState>
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is ongeldig." },
      { status: 400 }
    )
  }

  const reservations = Array.isArray(body.reservations) ? body.reservations : []
  const waitlist = Array.isArray(body.waitlist) ? body.waitlist : []
  const reminderSettings = body.reminderSettings ?? DEFAULT_REMINDER_SETTINGS
  const automationSettings = body.automationSettings ?? DEFAULT_AUTOMATION_SETTINGS

  const reservationRows = reservations.map(entry =>
    reservationToRow({ ...entry, id: ensureUuidId(entry.id) }, user.id)
  )
  const waitlistRows = waitlist.map(entry =>
    waitlistToRow({ ...entry, id: ensureUuidId(entry.id) }, user.id)
  )

  if (reservationRows.length > 0) {
    const { error } = await supabaseAdmin
      .from("reservations")
      .upsert(reservationRows, { onConflict: "id" })
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  const { data: existingReservations, error: reservationIdsError } =
    await supabaseAdmin.from("reservations").select("id").eq("user_id", user.id)
  if (reservationIdsError) {
    return NextResponse.json(
      { ok: false, error: reservationIdsError.message },
      { status: 500 }
    )
  }

  const reservationIdSet = new Set(reservationRows.map(entry => entry.id))
  const staleReservationIds = (existingReservations ?? [])
    .map(row => row.id as string)
    .filter(id => !reservationIdSet.has(id))

  if (staleReservationIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("reservations")
      .delete()
      .eq("user_id", user.id)
      .in("id", staleReservationIds)
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  if (waitlistRows.length > 0) {
    const { error } = await supabaseAdmin
      .from("waitlist")
      .upsert(waitlistRows, { onConflict: "id" })
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  const { data: existingWaitlist, error: waitlistIdsError } =
    await supabaseAdmin.from("waitlist").select("id").eq("user_id", user.id)
  if (waitlistIdsError) {
    return NextResponse.json({ ok: false, error: waitlistIdsError.message }, { status: 500 })
  }

  const waitlistIdSet = new Set(waitlistRows.map(entry => entry.id))
  const staleWaitlistIds = (existingWaitlist ?? [])
    .map(row => row.id as string)
    .filter(id => !waitlistIdSet.has(id))

  if (staleWaitlistIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("waitlist")
      .delete()
      .eq("user_id", user.id)
      .in("id", staleWaitlistIds)
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  const settingsPayload: SettingsRow = {
    user_id: user.id,
    first_reminder_minutes_before: reminderSettings.firstReminderMinutesBefore,
    final_reminder_minutes_before: reminderSettings.finalReminderMinutesBefore,
    no_show_threshold_minutes: automationSettings.noShowThresholdMinutes,
    waitlist_response_minutes: automationSettings.waitlistResponseMinutes,
    preferred_channel: automationSettings.preferredChannel
  }

  const { data: existingSettings, error: settingsSelectError } = await supabaseAdmin
    .from("settings")
    .select("id")
    .eq("user_id", user.id)
    .order("id", { ascending: false })
    .limit(1)
  if (settingsSelectError) {
    return NextResponse.json({ ok: false, error: settingsSelectError.message }, { status: 500 })
  }

  if (existingSettings && existingSettings.length > 0) {
    const { error } = await supabaseAdmin
      .from("settings")
      .update({
        first_reminder_minutes_before:
          settingsPayload.first_reminder_minutes_before,
        final_reminder_minutes_before: settingsPayload.final_reminder_minutes_before,
        no_show_threshold_minutes: settingsPayload.no_show_threshold_minutes,
        waitlist_response_minutes: settingsPayload.waitlist_response_minutes,
        preferred_channel: settingsPayload.preferred_channel
      })
      .eq("id", existingSettings[0].id as number)
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabaseAdmin.from("settings").insert([settingsPayload])
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
