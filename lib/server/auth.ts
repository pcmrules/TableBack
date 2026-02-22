import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

type CookieGetter = {
  get: (name: string) => { value: string } | undefined
}

export type AuthUser = {
  id: string
  name: string
  email: string
}

type StoredUser = AuthUser & {
  passwordHash: string
  createdAt: number
}

type StoredSession = {
  token: string
  userId: string
  expiresAt: number
}

type UsersPayload = {
  users: StoredUser[]
}

type SessionsPayload = {
  sessions: StoredSession[]
}

const dataDir = path.join(process.cwd(), ".data")
const usersFile = path.join(dataDir, "users.json")
const sessionsFile = path.join(dataDir, "sessions.json")
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const SESSION_COOKIE_NAME = "tableback_session"

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true })
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJsonFile<T>(filePath: string, payload: T) {
  ensureDataDir()
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8")
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toSafeUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex")
}

function createPasswordHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = hashPassword(password, salt)
  return `${salt}:${hash}`
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const [salt, currentHash] = encodedHash.split(":")
  if (!salt || !currentHash) return false
  const inputHash = hashPassword(password, salt)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(currentHash, "hex"),
      Buffer.from(inputHash, "hex")
    )
  } catch {
    return false
  }
}

function loadUsers(): StoredUser[] {
  const payload = readJsonFile<UsersPayload>(usersFile, { users: [] })
  return Array.isArray(payload.users) ? payload.users : []
}

function saveUsers(users: StoredUser[]) {
  writeJsonFile(usersFile, { users })
}

function loadSessions(): StoredSession[] {
  const payload = readJsonFile<SessionsPayload>(sessionsFile, { sessions: [] })
  return Array.isArray(payload.sessions) ? payload.sessions : []
}

function saveSessions(sessions: StoredSession[]) {
  writeJsonFile(sessionsFile, { sessions })
}

function cleanExpiredSessions(sessions: StoredSession[]): StoredSession[] {
  const now = Date.now()
  return sessions.filter(session => session.expiresAt > now)
}

export function createUser(input: {
  name: string
  email: string
  password: string
}): { user: AuthUser } | { error: string } {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)
  const password = input.password

  if (name.length < 2) return { error: "Naam is te kort." }
  if (!email.includes("@")) return { error: "E-mail is ongeldig." }
  if (password.length < 8) return { error: "Wachtwoord moet minstens 8 tekens hebben." }

  const users = loadUsers()
  const exists = users.some(user => user.email === email)
  if (exists) return { error: "Er bestaat al een account met dit e-mailadres." }

  const user: StoredUser = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: createPasswordHash(password),
    createdAt: Date.now()
  }
  users.push(user)
  saveUsers(users)
  return { user: toSafeUser(user) }
}

export function authenticateUser(
  emailInput: string,
  password: string
): AuthUser | null {
  const email = normalizeEmail(emailInput)
  const users = loadUsers()
  const user = users.find(entry => entry.email === email)
  if (!user) return null
  if (!verifyPassword(password, user.passwordHash)) return null
  return toSafeUser(user)
}

export function createSession(userId: string): string {
  const sessions = cleanExpiredSessions(loadSessions())
  const token = crypto.randomBytes(32).toString("hex")

  sessions.push({
    token,
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS
  })

  saveSessions(sessions)
  return token
}

export function revokeSession(token: string) {
  const sessions = cleanExpiredSessions(loadSessions())
  saveSessions(sessions.filter(session => session.token !== token))
}

function getUserById(userId: string): AuthUser | null {
  const users = loadUsers()
  const user = users.find(entry => entry.id === userId)
  return user ? toSafeUser(user) : null
}

export function getSessionUserFromToken(token: string): AuthUser | null {
  if (!token) return null

  const sessions = cleanExpiredSessions(loadSessions())
  const session = sessions.find(entry => entry.token === token)
  saveSessions(sessions)
  if (!session) return null
  return getUserById(session.userId)
}

export function getSessionUserFromCookies(cookies: CookieGetter): AuthUser | null {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value ?? ""
  return getSessionUserFromToken(token)
}

export function getSessionUserFromCookieHeader(cookieHeader: string): AuthUser | null {
  if (!cookieHeader) return null
  const token = cookieHeader
    .split(";")
    .map(chunk => chunk.trim())
    .find(chunk => chunk.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1] ?? ""

  return getSessionUserFromToken(decodeURIComponent(token))
}
