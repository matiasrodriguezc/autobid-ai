import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from "@/components/theme-provider" // <--- IMPORTAR
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
            colorPrimary: "#7c3aed",
            colorBackground: "#09090b",
            colorText: "#fafafa",
            borderRadius: "0.5rem",
        },
        elements: {
            userButtonPopoverCard: "bg-popover border border-border shadow-md rounded-lg",
            userButtonPopoverActionButton: "hover:bg-muted transition-colors text-foreground",
            userButtonPopoverActionButtonIcon: "text-muted-foreground",
            userButtonPopoverActionButtonText: "text-foreground font-medium",
            userButtonPopoverFooter: "hidden",
            userButtonTrigger: "focus:shadow-none focus:ring-2 focus:ring-primary/20",
        }
      }}
    >
      <html lang="es" suppressHydrationWarning className="h-full">
        <body className="h-full overflow-hidden">
            {/* AGREGAMOS EL THEME PROVIDER AQUÍ */}
            <ThemeProvider
                attribute="class"  // <--- ESTO ES CRUCIAL
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
            >
                {children}
            </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}