"use client"

import { useState } from "react"
import { useSignIn, useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Sparkles, Loader2, AlertCircle, ArrowLeft, Mail } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function LoginScreen() {
  const { isLoaded: isSignInLoaded, signIn, setActive: setActiveSignIn } = useSignIn()
  const { isLoaded: isSignUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp()
  const router = useRouter()
  
  // ESTADOS: "login" | "signup" | "verify"
  const [view, setView] = useState<"login" | "signup" | "verify">("login")
  
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("") // Para el código de email
  const [firstName, setFirstName] = useState("")
  
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  // 1. MANEJAR LOGIN
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSignInLoaded) return
    setIsLoading(true)
    setError("")

    try {
      const result = await signIn.create({ identifier: email, password })

      if (result.status === "complete") {
        await setActiveSignIn({ session: result.createdSessionId })
        router.push("/dashboard")
      } else {
        console.log(result)
        setError("An additional step is required.")
      }
    } catch (err: any) {
      console.error(err)
      if (err.errors?.[0]?.code === "form_password_incorrect") setError("Incorrect password.")
      else if (err.errors?.[0]?.code === "form_identifier_not_found") setError("No account found with this email.")
      else setError("Error signing in.")
    } finally {
      setIsLoading(false)
    }
  }

  // 2. MANEJAR REGISTRO (SIGN UP)
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSignUpLoaded) return
    setIsLoading(true)
    setError("")

    try {
      // a) Crear el usuario
      await signUp.create({ emailAddress: email, password, firstName })

      // b) Enviar código de verificación al email
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" })

      // c) Cambiar a vista de verificación
      setView("verify")
      
    } catch (err: any) {
      console.error(err)
      if (err.errors?.[0]?.code === "form_identifier_exists") setError("This email is already registered.")
      else if (err.errors?.[0]?.code === "form_password_pwned") setError("Use a stronger password.")
      else setError("Error creating account: " + err.errors?.[0]?.message)
    } finally {
      setIsLoading(false)
    }
  }

  // 3. MANEJAR VERIFICACIÓN DE EMAIL (OTP)
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSignUpLoaded) return
    setIsLoading(true)
    setError("")

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({ code })

      if (completeSignUp.status === "complete") {
        await setActiveSignUp({ session: completeSignUp.createdSessionId })
        router.push("/dashboard")
      } else {
        setError("Invalid or incomplete code.")
      }
    } catch (err: any) {
      console.error(err)
      setError("Incorrect code.")
    } finally {
      setIsLoading(false)
    }
  }

  // 4. LOGIN SOCIAL (GOOGLE)
  const handleGoogleLogin = async () => {
    if (!isSignInLoaded) return
    try {
        await signIn.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl: "/sso-callback",
            redirectUrlComplete: "/dashboard",
        })
    } catch (err) {
        console.error(err)
        setError("Error connecting with Google")
    }
  }

  // --- RENDERIZADO CONDICIONAL ---

  // VISTA DE VERIFICACIÓN (CÓDIGO)
  if (view === "verify") {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md border-border bg-card">
            <CardHeader className="text-center">
                <div className="mx-auto size-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <Mail className="size-6 text-blue-600" />
                </div>
                <CardTitle>Verify your Email</CardTitle>
                <CardDescription>We've sent a 6-digit code to <b>{email}</b></CardDescription>
            </CardHeader>
            <CardContent>
                {error && <Alert variant="destructive" className="mb-4"><AlertCircle className="size-4"/><AlertDescription>{error}</AlertDescription></Alert>}
                <form onSubmit={handleVerify} className="space-y-4">
                    <Input 
                        placeholder="Code (e.g. 123456)" 
                        value={code} 
                        onChange={(e) => setCode(e.target.value)} 
                        className="text-center text-lg tracking-widest"
                        maxLength={6}
                    />
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? <Loader2 className="animate-spin" /> : "Verify Account"}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setView("signup")} type="button">
                        Go back
                    </Button>
                </form>
            </CardContent>
          </Card>
        </div>
    )
  }

  // VISTA PRINCIPAL (LOGIN O SIGNUP)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card shadow-lg transition-all duration-300">
        <CardHeader className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="size-10 bg-primary rounded-lg flex items-center justify-center shadow-md">
              <Sparkles className="size-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">AutoBid AI</h1>
          </div>
          <CardTitle className="text-xl">
            {view === "login" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {view === "login" 
                ? "Sign in to manage your bids" 
                : "Start winning contracts with AI today"}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={view === "login" ? handleSignIn : handleSignUp} className="space-y-4">
            
            {/* Campo Nombre (Solo en Sign Up) */}
            {view === "signup" && (
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="Your name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input id="email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                  view === "login" ? "Sign In" : "Create Account"
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or continue with</span></div>
          </div>

          <Button variant="outline" className="w-full border-border bg-transparent" onClick={handleGoogleLogin} type="button">
            <svg className="mr-2 size-4" viewBox="0 0 24 24">
               <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
               <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
               <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
               <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </Button>

          <div className="text-center text-sm">
            {view === "login" ? (
                <p className="text-muted-foreground">
                    Don't have an account?{" "}
                    <button onClick={() => setView("signup")} className="text-primary hover:underline font-medium">
                        Sign up free
                    </button>
                </p>
            ) : (
                <p className="text-muted-foreground">
                    Already have an account?{" "}
                    <button onClick={() => setView("login")} className="text-primary hover:underline font-medium">
                        Sign in
                    </button>
                </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}