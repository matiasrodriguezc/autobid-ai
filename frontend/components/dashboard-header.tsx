"use client"

import { Sparkles } from "lucide-react"
import { MobileSidebar } from "./mobile-sidebar"

export function DashboardHeader() {
  return (
    <header className="md:hidden flex items-center h-16 px-4 border-b bg-background shrink-0">
      <MobileSidebar />
      <div className="flex items-center gap-2 ml-4">
        <div className="size-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
          <Sparkles className="size-4 text-primary-foreground" />
        </div>
        <h1 className="text-lg font-bold text-foreground tracking-tight">AutoBid AI</h1>
      </div>
    </header>
  )
}
