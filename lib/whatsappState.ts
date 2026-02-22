import { getPhoneLookupKeys } from "@/lib/phone"
import fs from "node:fs"
import path from "node:path"

export type WhatsAppConversationType = "reservation_confirmation" | "waitlist_offer"

type ConfirmationRecord = {
  confirmed: boolean
  declined: boolean
  lastReply: string
  updatedAt: number
  conversationType?: WhatsAppConversationType
  offerExpiresAt?: number | null
  offerClosed?: boolean
}

declare global {
  var __tablebackWhatsappConfirmations:
    | Map<string, ConfirmationRecord>
    | undefined
}

const confirmations =
  globalThis.__tablebackWhatsappConfirmations ??
  new Map<string, ConfirmationRecord>()

const dataDir = path.join(process.cwd(), ".data")
const dataFile = path.join(dataDir, "whatsapp-confirmations.json")

function hydrateFromDisk() {
  try {
    if (!fs.existsSync(dataFile)) return
    const raw = fs.readFileSync(dataFile, "utf8")
    const parsed = JSON.parse(raw) as Record<string, Partial<ConfirmationRecord>>
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value.confirmed === "boolean" &&
        typeof value.lastReply === "string" &&
        typeof value.updatedAt === "number"
      ) {
        confirmations.set(key, {
          confirmed: value.confirmed,
          lastReply: value.lastReply,
          updatedAt: value.updatedAt,
          declined: typeof value.declined === "boolean" ? value.declined : false,
          conversationType:
            value.conversationType === "waitlist_offer"
              ? "waitlist_offer"
              : "reservation_confirmation",
          offerExpiresAt:
            typeof value.offerExpiresAt === "number"
              ? value.offerExpiresAt
              : null,
          offerClosed: value.offerClosed === true
        })
      }
    }
  } catch {
    // Ignore invalid or unreadable persisted state.
  }
}

function persistToDisk() {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    const payload = Object.fromEntries(confirmations.entries())
    fs.writeFileSync(dataFile, JSON.stringify(payload), "utf8")
  } catch {
    // Ignore write errors; in-memory behavior still works.
  }
}

if (!globalThis.__tablebackWhatsappConfirmations) {
  globalThis.__tablebackWhatsappConfirmations = confirmations
  hydrateFromDisk()
}

export function setPhoneConfirmation(
  phone: string,
  payload: ConfirmationRecord
) {
  const keys = getPhoneLookupKeys(phone)
  for (const key of keys) {
    confirmations.set(key, payload)
  }
  persistToDisk()
}

export function getPhoneConfirmation(phone: string): ConfirmationRecord | null {
  const keys = getPhoneLookupKeys(phone)
  for (const key of keys) {
    const match = confirmations.get(key)
    if (match) return match
  }
  return null
}
