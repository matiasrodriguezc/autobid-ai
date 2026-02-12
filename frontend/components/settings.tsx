"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, BrainCircuit, Database, Save, AlertTriangle, Trash2, RefreshCw, Check } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

export function SettingsView() {
  const { getToken } = useAuth()
  const { toast } = useToast()
  
  const [loading, setLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false) 

  const [formData, setFormData] = useState({
    company_name: "",
    company_description: "",
    company_website: "",
    ai_tone: "formal",
    ai_creativity: 0.3,
    language: "es-latam"
  })

  const [stats, setStats] = useState({
    sql_bids: 0,
    sql_docs: 0,
    pinecone_vectors: 0,
    tokens_total: 0,
    tokens_input: 0,
    tokens_output: 0
  })

  useEffect(() => {
    loadSettings()
    loadStats()
  }, [])

  const loadSettings = async () => {
    try {
        const token = await getToken()
        if (!token) return
        
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
            headers: { "Authorization": `Bearer ${token}` }
        })
        if (res.ok) setFormData(await res.json())
    } catch (e) { console.error(e) }
  }

  const loadStats = async () => {
    try {
        const token = await getToken()
        if (!token) return

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/stats`, {
            headers: { "Authorization": `Bearer ${token}` }
        })
        if (res.ok) setStats(await res.json())
    } catch (e) { console.error(e) }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        })
        if (!res.ok) throw new Error()
        
        setIsSaved(true) 
        
        toast({
            title: "Settings Saved",
            description: "Changes will apply to the next generation.",
            className: "bg-green-600 text-white border-none"
        })

        setTimeout(() => {
            setIsSaved(false)
        }, 2000)

    } catch (error) {
        toast({ title: "Error", variant: "destructive" })
    } finally {
        setLoading(false)
    }
  }

  const handlePurge = async (target: "vectors" | "sql" | "all") => {
    if (!confirm("Are you 100% sure? This will permanently delete data.")) return

    try {
        const token = await getToken()
        const form = new FormData()
        form.append("target", target)
        
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/purge`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
            body: form
        })
        
        const data = await res.json()
        toast({ title: "System Purged", description: data.message })
        loadStats() 
    } catch (error) {
        toast({ title: "Error al purgar", variant: "destructive" })
    }
  }

  const renderSaveButton = (text: string) => (
    <Button 
        onClick={handleSave} 
        disabled={loading || isSaved} 
        className={`transition-all duration-300 w-full sm:w-auto px-6 ${
            isSaved 
            ? "bg-green-600 hover:bg-green-700 text-white sm:w-56" 
            : "sm:w-48"
        }`}
    >
        {loading ? (
            <RefreshCw className="mr-2 size-4 animate-spin"/>
        ) : isSaved ? (
            <Check className="mr-2 size-4 animate-in zoom-in" />
        ) : (
            <Save className="mr-2 size-4"/>
        )} 
        {loading ? "Saving..." : isSaved ? "Saved!" : text}
    </Button>
  )

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 h-full overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Customize your company identity and the system.</p>
      </div>

      <Tabs defaultValue="company" className="w-full">
        
        {/* --- FIX RESPONSIVE: Scroll en móvil, Grid en Desktop --- */}
        <div className="w-full overflow-x-auto pb-2 md:pb-0 -mb-2 md:mb-0">
            <TabsList className="flex w-max md:w-full md:grid md:grid-cols-3 mb-8 h-auto">
              <TabsTrigger value="company" className="flex gap-2 px-6 md:px-0"><Building2 size={16}/> Identity</TabsTrigger>
              <TabsTrigger value="ai" className="flex gap-2 px-6 md:px-0"><BrainCircuit size={16}/> AI & Model</TabsTrigger>
              <TabsTrigger value="system" className="flex gap-2 px-6 md:px-0"><Database size={16}/> Memory & System</TabsTrigger>
            </TabsList>
        </div>

        <TabsContent value="company" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>This information is injected into the system prompt.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="c-name">Company Name</Label>
                <Input 
                    id="c-name" 
                    value={formData.company_name} 
                    onChange={(e) => setFormData({...formData, company_name: e.target.value})} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-desc">Boilerplate (About Us)</Label>
                <Textarea 
                    value={formData.company_description}
                    onChange={(e) => setFormData({...formData, company_description: e.target.value})}
                    placeholder="Somos líderes en transformación digital..." 
                    className="h-24" 
                />
                <p className="text-xs text-muted-foreground">Summarize who you are and what you do in 2-3 sentences.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-web">Sitio Web</Label>
                <Input 
                    id="c-web" 
                    value={formData.company_website || ""} 
                    onChange={(e) => setFormData({...formData, company_website: e.target.value})} 
                />
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6 bg-muted/20 flex justify-end">
                {renderSaveButton("Save Changes")}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Cerebro de Redacción</CardTitle>
              <CardDescription>Ajusta cómo escribe el modelo Gemini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                      <Label>Voice Tone</Label>
                      <Select value={formData.ai_tone} onValueChange={(val) => setFormData({...formData, ai_tone: val})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="formal">👔 Formal (Corporativo)</SelectItem>
                            <SelectItem value="persuasive">🔥 Persuasivo (Ventas)</SelectItem>
                            <SelectItem value="technical">🛠️ Técnico (Directo)</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <Label>Language</Label>
                      <Select value={formData.language} onValueChange={(val) => setFormData({...formData, language: val})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="es-latam">Spanish (Latin America)</SelectItem>
                            <SelectItem value="en-us">English (US)</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                 <div className="flex justify-between items-center">
                    <Label>Creativity: {formData.ai_creativity}</Label>
                 </div>
                 <Slider 
                    defaultValue={[0.3]} 
                    max={1} 
                    step={0.1} 
                    value={[formData.ai_creativity]} 
                    onValueChange={(val) => setFormData({...formData, ai_creativity: val[0]})}
                 />
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6 bg-muted/20 flex justify-end">
                {renderSaveButton("Actualizar Modelo")}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-0">
          <div className="grid gap-6">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Indexed Docs</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.sql_docs}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Vectors (Est.)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.pinecone_vectors}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Bids</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.sql_bids}</div></CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Token Usage (Gemini)</CardTitle>
                    <CardDescription>Tokens processed by the language model in the current period.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg bg-background">
                        <p className="text-sm font-medium text-muted-foreground">Total Tokens</p>
                        <p className="text-2xl font-bold">{stats.tokens_total.toLocaleString()}</p>
                    </div>
                    <div className="p-4 border rounded-lg bg-background">
                        <p className="text-sm font-medium text-muted-foreground">Input Tokens</p>
                        <p className="text-2xl font-bold">{stats.tokens_input.toLocaleString()}</p>
                    </div>
                    <div className="p-4 border rounded-lg bg-background">
                        <p className="text-sm font-medium text-muted-foreground">Output Tokens</p>
                        <p className="text-2xl font-bold">{stats.tokens_output.toLocaleString()}</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                      <AlertTriangle className="size-5"/> Danger Zone
                  </CardTitle>
                  <CardDescription>Irreversible database cleanup actions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* FIX RESPONSIVE: stack vertical en móvil para que el botón no se solape */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg bg-background gap-4 sm:gap-0">
                        <div>
                            <p className="font-medium">Purge Vectors (Pinecone)</p>
                            <p className="text-xs text-muted-foreground">Removes AI knowledge but keeps SQL history.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handlePurge("vectors")} className="w-full sm:w-auto">
                            <Trash2 className="size-4 mr-2"/> Limpiar Vectores
                        </Button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg bg-background gap-4 sm:gap-0">
                        <div>
                            <p className="font-medium">Factory Reset (SQL + Vectors)</p>
                            <p className="text-xs text-muted-foreground">Deletes ALL documents, bids and memory.</p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => handlePurge("all")} className="w-full sm:w-auto">
                            <AlertTriangle className="size-4 mr-2"/> DELETE ALL
                        </Button>
                    </div>
                </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}

export default SettingsView;