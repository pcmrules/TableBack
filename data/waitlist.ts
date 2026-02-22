export type WaitlistEntry = {
  id: number
  name: string
  phone: string
  partySize: number
  status?: "waiting" | "contacted" | "declined"
  createdAt?: number
  lastContactedAt?: number
}

export const initialWaitlist = [] satisfies WaitlistEntry[]
