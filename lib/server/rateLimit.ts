import fs from "node:fs"
import path from "node:path"

type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitOptions = {
  key: string
  windowMs: number
  max: number
}

declare global {
  var __tablebackRateLimitStore: Map<string, RateLimitBucket> | undefined
}

const store = globalThis.__tablebackRateLimitStore ?? new Map<string, RateLimitBucket>()
const dataDir = path.join(process.cwd(), ".data")
const dataFile = path.join(dataDir, "rate-limit.json")

function hydrateFromDisk() {
  try {
    if (!fs.existsSync(dataFile)) return
    const raw = fs.readFileSync(dataFile, "utf8")
    const parsed = JSON.parse(raw) as Record<string, Partial<RateLimitBucket>>
    const now = Date.now()

    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value.count === "number" &&
        typeof value.resetAt === "number" &&
        value.count > 0 &&
        value.resetAt > now
      ) {
        store.set(key, {
          count: value.count,
          resetAt: value.resetAt
        })
      }
    }
  } catch {
    // Ignore invalid on-disk state.
  }
}

function persistToDisk() {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    const now = Date.now()
    const payload: Record<string, RateLimitBucket> = {}

    for (const [key, value] of store.entries()) {
      if (value.resetAt > now && value.count > 0) {
        payload[key] = value
      }
    }

    fs.writeFileSync(dataFile, JSON.stringify(payload), "utf8")
  } catch {
    // Ignore write errors; in-memory limiting still works.
  }
}

if (!globalThis.__tablebackRateLimitStore) {
  globalThis.__tablebackRateLimitStore = store
  hydrateFromDisk()
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp

  const cfIp = request.headers.get("cf-connecting-ip")
  if (cfIp) return cfIp

  return "unknown"
}

export function consumeRateLimit(options: RateLimitOptions): {
  ok: boolean
  retryAfterSeconds: number
} {
  const now = Date.now()
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key)
    }
  }

  const existing = store.get(options.key)

  if (!existing || existing.resetAt <= now) {
    store.set(options.key, {
      count: 1,
      resetAt: now + options.windowMs
    })
    persistToDisk()
    return { ok: true, retryAfterSeconds: 0 }
  }

  existing.count += 1
  store.set(options.key, existing)
  persistToDisk()

  if (existing.count <= options.max) {
    return { ok: true, retryAfterSeconds: 0 }
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  return { ok: false, retryAfterSeconds }
}
