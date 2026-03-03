const required = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_TO"]
const missing = required.filter(name => !process.env[name])

if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(", ")}`)
  process.exit(1)
}

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const to = process.env.TWILIO_TO
const from = process.env.TWILIO_WHATSAPP_FROM
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
const body = process.env.TWILIO_TEST_BODY || "Testbericht vanuit TableBack"
const contentSid = process.env.TWILIO_CONTENT_SID
const contentVariables = process.env.TWILIO_CONTENT_VARIABLES

if (!from && !messagingServiceSid) {
  console.error("Set TWILIO_WHATSAPP_FROM of TWILIO_MESSAGING_SERVICE_SID")
  process.exit(1)
}

const form = new URLSearchParams()
form.set("To", to.startsWith("whatsapp:") ? to : `whatsapp:${to}`)
if (messagingServiceSid) {
  form.set("MessagingServiceSid", messagingServiceSid)
} else {
  form.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`)
}

if (contentSid) {
  form.set("ContentSid", contentSid)
  if (contentVariables) {
    form.set("ContentVariables", contentVariables)
  }
} else {
  form.set("Body", body)
}

async function main() {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    }
  )

  const payload = await response.json()
  if (!response.ok) {
    console.error("Twilio send failed:", payload)
    process.exit(1)
  }

  console.log("Twilio send ok:", {
    sid: payload.sid,
    status: payload.status,
    to: payload.to,
    from: payload.from,
    messagingServiceSid: payload.messaging_service_sid
  })
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
