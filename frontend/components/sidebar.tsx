"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  FileText, 
  Database, 
  History, 
  Settings, 
  Sparkles, 
  Bot 
} from "lucide-react"
import { cn } from "@/lib/utils"

// 1. IMPORTAMOS CLERK
import { useUser, UserButton } from "@clerk/nextjs"

// 2. IMPORTAMOS EL TOGGLE DE TEMA
import { ModeToggle } from "@/components/mode-toggle"

export function Sidebar() {
  const pathname = usePathname()
  
  // 3. OBTENEMOS DATOS REALES DEL USUARIO
  const { user, isLoaded } = useUser()

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/editor", label: "Active Bids", icon: FileText },
    { href: "/dashboard/bid-agent", label: "Bid Agent", icon: Bot }, 
    { href: "/dashboard/knowledge", label: "Knowledge Base", icon: Database },
    { href: "/dashboard/history", label: "Bid History", icon: History },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ]

  return (
    <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border flex-col h-full shrink-0 transition-all duration-300">
      {/* HEADER */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="size-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">AutoBid AI</h1>
        </div>
      </div>

      {/* NAVEGACIÓN */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* FOOTER - INTEGRACIÓN REAL CON CLERK + TEMA */}
      <div className="p-4 border-t border-sidebar-border bg-sidebar/50 flex items-center justify-between gap-2">
        {isLoaded && user ? (
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent/30 transition-colors flex-1 min-w-0">
              {/* El Botón de Usuario de Clerk */}
              <UserButton afterSignOutUrl="/" />
              
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-sm font-medium text-sidebar-foreground truncate">
                    {user.fullName || user.username || "Usuario"}
                </span>
                <span className="text-xs text-sidebar-foreground/60 truncate">
                    {user.primaryEmailAddress?.emailAddress}
                </span>
              </div>
            </div>
        ) : (
            // Skeleton de carga
            <div className="flex items-center gap-3 px-2 py-2 flex-1">
                <div className="size-8 rounded-full bg-sidebar-accent animate-pulse"/>
                <div className="space-y-1 flex-1">
                    <div className="h-3 w-20 bg-sidebar-accent animate-pulse rounded"/>
                </div>
            </div>
        )}

        {/* BOTÓN DE MODO OSCURO */}
        <ModeToggle />
      </div>
    </aside>
  )
}