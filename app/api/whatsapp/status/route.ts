import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const formData = await request.formData()

  const messageSid = String(formData.get("MessageSid") ?? "")
  const messageStatus = String(formData.get("MessageStatus") ?? "")
  const errorCode = String(formData.get("ErrorCode") ?? "")
  const errorMessage = String(formData.get("ErrorMessage") ?? "")

  if (messageSid) {
    console.log("Twilio status callback", {
      messageSid,
      messageStatus,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null
    })
  }

  return new NextResponse(null, { status: 204 })
}
