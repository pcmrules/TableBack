"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

export default function Toast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const duration = 6000
    const intervalTime = 50
    const step = 100 / (duration / intervalTime)

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev <= 0) return 0
        return prev - step
      })
    }, intervalTime)

    const timeout = setTimeout(() => {
      setVisible(false)
    }, duration)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
      bg-[#1f3d2b] text-white px-8 py-5 rounded-2xl shadow-2xl
      flex items-center justify-between gap-8 min-w-[380px]"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">💰 {message}</p>
      </div>

      <Link
        href="/dashboard"
        className="text-sm underline hover:opacity-80"
      >
        Dashboard →
      </Link>

      <div
        className="absolute bottom-0 left-0 h-1 bg-green-400 rounded-b-2xl"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
