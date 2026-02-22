export type ReminderSettings = {
  firstReminderMinutesBefore: number
  finalReminderMinutesBefore: number
}

export type ContactChannel = "whatsapp" | "sms" | "email"

export type AutomationSettings = {
  noShowThresholdMinutes: number
  waitlistResponseMinutes: number
  preferredChannel: ContactChannel
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  firstReminderMinutesBefore: 120,
  finalReminderMinutesBefore: 30
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  noShowThresholdMinutes: 15,
  waitlistResponseMinutes: 10,
  preferredChannel: "whatsapp"
}
