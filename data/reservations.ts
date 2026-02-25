export type Reservation = {
  id: string
  name: string
  phone: string
  time: string
  createdAt?: number
  partySize: number
  status: "confirmed" | "attention" | "expired" | "processing" | "filled" | "unfilled"
  filledFromWaitlist?: boolean
  originalGuestName?: string
  estimatedRevenue: number
  reminderCount: number
  lastReminderAt?: number
}

export const reservations: Reservation[] = []
