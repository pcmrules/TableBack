import fs from "node:fs"
import path from "node:path"
import type { Reservation } from "@/data/reservations"
import type { WaitlistEntry } from "@/data/waitlist"
import {
  DEFAULT_AUTOMATION_SETTINGS,
  DEFAULT_REMINDER_SETTINGS,
  type AutomationSettings,
  type ReminderSettings
} from "@/lib/shared/settings"

export type PersistedAppState = {
  reservations: Reservation[]
  waitlist: WaitlistEntry[]
  reminderSettings: ReminderSettings
  automationSettings: AutomationSettings
}

const dataDir = path.join(process.cwd(), ".data", "state")

function getDefaultState(): PersistedAppState {
  return {
    reservations: [],
    waitlist: [],
    reminderSettings: DEFAULT_REMINDER_SETTINGS,
    automationSettings: DEFAULT_AUTOMATION_SETTINGS
  }
}

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true })
}

function fileForUser(userId: string): string {
  return path.join(dataDir, `${userId}.json`)
}

function isValidReminderSettings(value: unknown): value is ReminderSettings {
  if (!value || typeof value !== "object") return false
  const candidate = value as ReminderSettings
  return (
    Number.isFinite(candidate.firstReminderMinutesBefore) &&
    Number.isFinite(candidate.finalReminderMinutesBefore) &&
    candidate.firstReminderMinutesBefore > 0 &&
    candidate.finalReminderMinutesBefore > 0 &&
    candidate.finalReminderMinutesBefore < candidate.firstReminderMinutesBefore
  )
}

function isValidAutomationSettings(value: unknown): value is AutomationSettings {
  if (!value || typeof value !== "object") return false
  const candidate = value as AutomationSettings
  return (
    Number.isFinite(candidate.noShowThresholdMinutes) &&
    Number.isFinite(candidate.waitlistResponseMinutes) &&
    candidate.noShowThresholdMinutes > 0 &&
    candidate.waitlistResponseMinutes > 0 &&
    (candidate.preferredChannel === "whatsapp" ||
      candidate.preferredChannel === "sms" ||
      candidate.preferredChannel === "email")
  )
}

export function loadUserState(userId: string): PersistedAppState {
  const filePath = fileForUser(userId)
  try {
    if (!fs.existsSync(filePath)) return getDefaultState()
    const raw = fs.readFileSync(filePath, "utf8")
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>
    const base = getDefaultState()

    return {
      reservations: Array.isArray(parsed.reservations)
        ? parsed.reservations
        : base.reservations,
      waitlist: Array.isArray(parsed.waitlist) ? parsed.waitlist : base.waitlist,
      reminderSettings: isValidReminderSettings(parsed.reminderSettings)
        ? parsed.reminderSettings
        : base.reminderSettings,
      automationSettings: isValidAutomationSettings(parsed.automationSettings)
        ? parsed.automationSettings
        : base.automationSettings
    }
  } catch {
    return getDefaultState()
  }
}

export function saveUserState(userId: string, next: PersistedAppState) {
  ensureDir()
  const payload: PersistedAppState = {
    reservations: Array.isArray(next.reservations) ? next.reservations : [],
    waitlist: Array.isArray(next.waitlist) ? next.waitlist : [],
    reminderSettings: isValidReminderSettings(next.reminderSettings)
      ? next.reminderSettings
      : DEFAULT_REMINDER_SETTINGS,
    automationSettings: isValidAutomationSettings(next.automationSettings)
      ? next.automationSettings
      : DEFAULT_AUTOMATION_SETTINGS
  }

  fs.writeFileSync(fileForUser(userId), JSON.stringify(payload), "utf8")
}
