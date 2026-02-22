"use client"

import { ReactNode } from "react"
import { ReservationProvider } from "@/context/ReservationContext"

import { useReservations } from "@/context/ReservationContext"
import Toast from "./toast"

function ToastWrapper() {
  const { toast } = useReservations()

  if (!toast) return null

  return <Toast key={toast.id} message={toast.message} />
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ReservationProvider>
      <ToastWrapper />
      {children}
    </ReservationProvider>
  )
}