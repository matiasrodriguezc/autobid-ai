import { Sidebar } from "@/components/sidebar"
import { DashboardHeader } from "@/components/dashboard-header"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar (hidden on mobile) */}
      <Sidebar />
      
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile Header (hidden on desktop) */}
        <DashboardHeader />
      
        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-muted/10">
          {children}
        </main>
      </div>
    </div>
  )
}