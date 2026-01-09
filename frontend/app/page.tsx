"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { LoginScreen } from "@/components/login-screen"
import { Loader2 } from "lucide-react"

export default function HomePage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/dashboard")
    }
  }, [isLoaded, isSignedIn, router])

  // Mientras carga Clerk, mostramos un spinner elegante
  if (!isLoaded) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    )
  }

  // Si ya está logueado, no mostramos nada mientras redirige
  if (isSignedIn) {
    return null 
  }

  // Si no está logueado, mostramos tu pantalla de login personalizada
  return <LoginScreen />
}