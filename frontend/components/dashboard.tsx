"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useUser } from "@clerk/nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
    Trophy, Target, DollarSign, Activity, Briefcase, TrendingUp, 
    TrendingDown, Upload, ArrowRight, Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Badge } from "@/components/ui/badge"

import { UploadTenderDialog } from "@/components/upload-tender-dialog" 

interface DashboardData {
    kpis: {
        total_bids: number
        win_rate: number
        total_won_amount: number
        pipeline_amount: number
    }
    charts: {
        industry_distribution: { name: string, value: number }[]
    }
    recent_activity: any[]
}

export default function Dashboard() { 
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const router = useRouter()

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  useEffect(() => {
    async function loadStats() {
        if (!isLoaded || !isSignedIn) return 

        try {
            const token = await getToken()
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
            const res = await fetch(`${apiUrl}/dashboard/stats`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            })
            
            if (res.ok) {
                const json = await res.json()
                setData(json)
            } else {
                console.error("Error fetching stats:", res.status)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }
    loadStats()
  }, [isLoaded, isSignedIn, getToken])

  const handleNavigateToEditor = () => {
    setShowUploadDialog(false)
    router.push("/dashboard/editor")
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  }

  const getBadgeVariant = (status: string) => {
    if (status === 'WON') return { variant: "default" as const, className: "bg-green-600 text-white hover:bg-green-700" }
    if (status === 'LOST') return { variant: "destructive" as const, className: "" }
    return { variant: "secondary" as const, className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200" }
  }

  if (loading) {
    return (
        <div className="flex h-full items-center justify-center p-8">
            <Loader2 className="size-10 animate-spin text-primary" />
        </div>
    )
  }

  if (!data) return <div className="p-8 text-center text-muted-foreground">No se pudieron cargar los datos.</div>

  return (
    <div className="p-8 space-y-8 bg-background/50 relative">
        <UploadTenderDialog 
            open={showUploadDialog} 
            onOpenChange={setShowUploadDialog}
            onNavigateToEditor={handleNavigateToEditor}
        />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    Hola, {user?.firstName || "Bid Manager"}
                </h1>
                <p className="text-muted-foreground mt-1">Monitor your pipeline and bid performance</p>
            </div>
            
            <Button 
                onClick={() => setShowUploadDialog(true)} 
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md w-full sm:w-auto"
            >
                <Upload className="mr-2 size-4" />
                Analyze New Tender
            </Button>
        </div>

        {/* --- KPIS (CARRUSEL EN MÓVIL / GRID EN DESKTOP) --- */}
        {/* - flex: Alinea horizontalmente.
            - overflow-x-auto: Permite scroll lateral.
            - snap-x snap-mandatory: Hace que las tarjetas se "imanten" al centro.
            - md:grid: En pantallas medianas para arriba, vuelve a ser grilla.
        */}
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0 scrollbar-hide">
            
            <Card className="min-w-[85vw] sm:min-w-[300px] md:min-w-0 snap-center">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Won Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatMoney(data.kpis.total_won_amount)}</div>
                    <p className="text-xs text-muted-foreground">Lifetime value</p>
                </CardContent>
            </Card>

            <Card className="min-w-[85vw] sm:min-w-[300px] md:min-w-0 snap-center">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                    <Trophy className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{data.kpis.win_rate}%</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {data.kpis.win_rate > 50 ? <TrendingUp className="size-3 text-green-500"/> : <TrendingDown className="size-3 text-red-500"/>}
                        Based on history
                    </p>
                </CardContent>
            </Card>

            <Card className="min-w-[85vw] sm:min-w-[300px] md:min-w-0 snap-center">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                    <Target className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatMoney(data.kpis.pipeline_amount)}</div>
                    <p className="text-xs text-muted-foreground">Active opportunities</p>
                </CardContent>
            </Card>

            <Card className="min-w-[85vw] sm:min-w-[300px] md:min-w-0 snap-center">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Bids</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{data.kpis.total_bids}</div>
                    <p className="text-xs text-muted-foreground">Processed in DB</p>
                </CardContent>
            </Card>
        </div>

        {/* --- GRÁFICOS INFERIORES --- */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 border-border bg-card">
                <CardHeader>
                    <CardTitle>Industry Distribution</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <div className="h-[300px] w-full">
                        {data.charts.industry_distribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.charts.industry_distribution}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted"/>
                                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                                    <Tooltip cursor={{fill: 'hsl(var(--muted)/0.2)'}} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                                        {data.charts.industry_distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--primary)/0.8)"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground bg-muted/20 rounded border border-dashed">
                                Sin datos suficientes
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="col-span-4 lg:col-span-3 border-border bg-card">
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {data.recent_activity.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground space-y-2">
                                <Activity className="size-8 opacity-20" />
                                <p className="text-sm">No recent activity.</p>
                                <p className="text-xs">Start by uploading a tender.</p>
                            </div>
                        ) : (
                            data.recent_activity.map((bid: any) => {
                                const badgeStyle = getBadgeVariant(bid.status)
                                return (
                                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors" key={bid.id}>
                                    <div className="space-y-1 min-w-0 pr-2">
                                        <p className="text-sm font-medium leading-none truncate">{bid.project_name}</p>
                                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                                            <Briefcase className="size-3"/> {bid.industry || "General"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={badgeStyle.variant} className={`text-[10px] px-2 h-5 ${badgeStyle.className}`}>
                                            {bid.status}
                                        </Badge>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6" 
                                        >
                                            <ArrowRight className="size-3" />
                                        </Button>
                                    </div>
                                </div>
                            )})
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
  )
}