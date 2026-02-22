export function normalizePhone(input: string): string {
  const stripped = input
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")

  if (!stripped) return ""
  if (stripped.startsWith("+")) {
    return `+${stripped.slice(1).replace(/\D/g, "")}`
  }

  return stripped.replace(/\D/g, "")
}

export function toWhatsAppAddress(input: string): string {
  const normalized = normalizePhone(input)
  return normalized.startsWith("whatsapp:")
    ? normalized
    : `whatsapp:${normalized}`
}

export function getPhoneLookupKeys(input: string): string[] {
  const normalized = normalizePhone(input)
  if (!normalized) return []

  const keys = new Set<string>()
  const digits = normalized.replace(/\D/g, "")

  keys.add(normalized)
  if (digits) {
    keys.add(digits)
    if (digits.startsWith("0") && digits.length > 1) {
      keys.add(digits.slice(1))
    }
    if ((digits.startsWith("31") || digits.startsWith("32")) && digits.length > 2) {
      keys.add(digits.slice(2))
    }
  }

  return [...keys]
}
