"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@clerk/nextjs" 
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
// AGREGADO: RefreshCw y Info a los imports
import { Plus, Pencil, Trash2, Loader2, Save, AlertTriangle, FileText, Copy, Check, X, Briefcase, DollarSign, Calendar, RefreshCw, Info } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { UploadHistoryDialog } from "@/components/upload-history-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"

interface Bid {
  id: number
  project_name: string
  industry: string
  budget: number
  status: "WON" | "LOST" | "PENDING"
  content_text?: string 
  created_at: string
}

export function BidHistory() {
  const { getToken } = useAuth() 
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null)
  
  // Estado para el botón de re-entrenar
  const [isRetraining, setIsRetraining] = useState(false)

  const [pendingChanges, setPendingChanges] = useState<Record<number, string>>({})
  const [isSavingBulk, setIsSavingBulk] = useState(false)

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editingBid, setEditingBid] = useState<Bid | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [idsToDelete, setIdsToDelete] = useState<number[]>([])
  const [viewingBid, setViewingBid] = useState<Bid | null>(null)
  const [copied, setCopied] = useState(false)

  const { toast } = useToast()
  const searchParams = useSearchParams()
  const highlightParam = searchParams.get('highlight')

  const fetchBids = async () => {
    try {
      const token = await getToken()
      if (!token) return
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bids`, {
          headers: { "Authorization": `Bearer ${token}` } 
      })
      const data = await res.json()
      if (Array.isArray(data)) setBids(data)
      else setBids([])
      setPendingChanges({}) 
    } catch (e) {
      setBids([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchBids() }, [])

  useEffect(() => {
    if (!loading && highlightParam && bids.length > 0) {
        const idToHighlight = Number(highlightParam)
        setActiveHighlight(idToHighlight)
        setTimeout(() => {
            const row = document.getElementById(`bid-row-${idToHighlight}`)
            if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
        const timer = setTimeout(() => setActiveHighlight(null), 4000)
        return () => clearTimeout(timer)
    }
  }, [loading, highlightParam, bids])

  // --- NUEVA LÓGICA: RE-ENTRENAMIENTO MANUAL ---
  const handleForceRetrain = async () => {
    setIsRetraining(true)
    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ml/force-retrain`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      })

      if (!res.ok) throw new Error("Error contactando al servidor")
      
      const data = await res.json()
      
      if (data.status === "trained") {
        toast({
             title: "🧠 Modelo Actualizado",
             description: `Entrenado con ${data.total_samples} ejemplos.`,
             className: "bg-green-600 text-white border-none"
        })
      } else if (data.status === "skipped") {
        toast({
            description: "ℹ️ No hay suficientes datos nuevos para entrenar (< 5).",
        })
      } else {
        toast({ title: "Error", description: "Error en el entrenamiento.", variant: "destructive" })
      }

    } catch (error) {
      console.error(error)
      toast({ title: "Error", description: "Fallo al conectar con el servidor.", variant: "destructive" })
    } finally {
      setIsRetraining(false)
    }
  }

  const handleLocalStatusChange = (id: number, newStatus: string) => {
    setBids(prev => prev.map(b => b.id === id ? { ...b, status: newStatus as any } : b))
    setPendingChanges(prev => ({
        ...prev,
        [id]: newStatus
    }))
  }

  const handleCancelChanges = () => {
      setPendingChanges({}) 
      fetchBids() 
      toast({ description: "Cambios descartados." })
  }

  const handleSaveAllChanges = async () => {
    setIsSavingBulk(true)
    const updates = Object.entries(pendingChanges).map(([id, status]) => ({
        id: Number(id),
        status
    }))

    try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bids/bulk-update-status`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ updates })
        })

        if (!res.ok) throw new Error("Error en bulk update")
        const data = await res.json()

        toast({
            title: "✅ Cambios Guardados",
            description: data.message,
            className: "bg-green-600 text-white border-none"
        })
        setPendingChanges({}) 
        // Opcional: Podríamos re-fetch para asegurar sincronización
    } catch (error) {
        toast({ title: "Error", description: "No se pudieron guardar los cambios.", variant: "destructive" })
        fetchBids()
    } finally {
        setIsSavingBulk(false)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(bids.map(b => b.id))
    else setSelectedIds([])
  }
  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id])
    else setSelectedIds(prev => prev.filter(item => item !== id))
  }
  const confirmDelete = (ids: number[]) => { setIdsToDelete(ids); setDeleteDialogOpen(true) }
  
  const executeDelete = async () => {
    try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bids/delete`, { 
            method: "POST", 
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            }, 
            body: JSON.stringify({ ids: idsToDelete }) 
        })
        if (!res.ok) throw new Error("Error")
        setBids(prev => prev.filter(b => !idsToDelete.includes(b.id)))
        setSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)))
        toast({ title: "🗑️ Eliminado", description: `Se eliminaron ${idsToDelete.length} registros.` })
    } catch (error) { toast({ title: "Error", variant: "destructive" }) } finally { setDeleteDialogOpen(false); setIdsToDelete([]) }
  }
  
  const handleSaveEdit = async () => {
    if (!editingBid) return
    setIsSaving(true)
    try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bids/${editingBid.id}`, { 
            method: "PATCH", 
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            }, 
            body: JSON.stringify({ project_name: editingBid.project_name, industry: editingBid.industry, budget: editingBid.budget }) 
        })
        if (!res.ok) throw new Error("Error")
        setBids(prev => prev.map(b => b.id === editingBid.id ? editingBid : b))
        setEditingBid(null)
        toast({ title: "Cambios Guardados", className: "bg-green-600 text-white border-none" })
    } catch (error) { toast({ title: "Error", variant: "destructive" }) } finally { setIsSaving(false) }
  }
  
  const handleCopyContent = () => { if (viewingBid?.content_text) { navigator.clipboard.writeText(viewingBid.content_text); setCopied(true); setTimeout(() => setCopied(false), 2000); toast({ description: "Copiado" }) } }
  const getStatusColor = (status: string) => {
    switch (status) { case "WON": return "bg-green-500/10 text-green-600 border-green-200"; case "LOST": return "bg-red-500/10 text-red-600 border-red-200"; default: return "bg-yellow-500/10 text-yellow-600 border-yellow-200" }
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "-"
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const hasPendingChanges = Object.keys(pendingChanges).length > 0

  if (loading) {
    return (
        <div className="flex h-full items-center justify-center p-8">
            <Loader2 className="size-10 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 h-full overflow-y-auto bg-background/50">
      
      {/* DIÁLOGOS */}
      <Dialog open={!!viewingBid} onOpenChange={(open) => !open && setViewingBid(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="size-5 text-primary"/> Propuesta: {viewingBid?.project_name}</DialogTitle><DialogDescription>Texto guardado.</DialogDescription></DialogHeader><div className="flex-1 overflow-y-auto border rounded-md bg-muted/30 p-4 mt-2">{viewingBid?.content_text ? (<div className="whitespace-pre-wrap font-mono text-sm text-foreground/80 leading-relaxed">{viewingBid.content_text}</div>) : (<div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><AlertTriangle className="size-8 mb-2 opacity-50"/><p>Sin contenido.</p></div>)}</div><DialogFooter className="mt-2"><Button variant="outline" onClick={() => setViewingBid(null)}>Cerrar</Button>{viewingBid?.content_text && <Button onClick={handleCopyContent}>{copied ? <Check className="mr-2 size-4"/> : <Copy className="mr-2 size-4"/>} {copied ? "Copiado" : "Copiar"}</Button>}</DialogFooter></DialogContent>
      </Dialog>
      
      <Dialog open={!!editingBid} onOpenChange={(open) => !open && setEditingBid(null)}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Editar Licitación</DialogTitle></DialogHeader>
            {editingBid && (
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2"><Label>Nombre</Label><Input value={editingBid.project_name} onChange={(e) => setEditingBid({...editingBid, project_name: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2"><Label>Industria</Label><Input value={editingBid.industry} onChange={(e) => setEditingBid({...editingBid, industry: e.target.value})} /></div>
                        <div className="grid gap-2">
                            <Label>Presupuesto</Label>
                            <Input type="number" value={editingBid.budget === 0 ? "" : editingBid.budget} onChange={(e) => { const val = e.target.value; setEditingBid({...editingBid, budget: val === "" ? 0 : parseFloat(val)}) }} />
                        </div>
                    </div>
                </div>
            )}
            <DialogFooter><Button variant="outline" onClick={() => setEditingBid(null)}>Cancelar</Button><Button onClick={handleSaveEdit} disabled={isSaving}>{isSaving ? <Loader2 className="animate-spin size-4 mr-2"/> : <Save className="size-4 mr-2"/>} Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="size-5"/> {idsToDelete.length > 1 ? `¿Borrar ${idsToDelete.length} registros?` : "¿Borrar esta licitación?"}</AlertDialogTitle><AlertDialogDescription>Se eliminarán del historial y la IA olvidará estos resultados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={executeDelete} className="bg-destructive hover:bg-destructive/90">{idsToDelete.length > 1 ? "Sí, Eliminar Selección" : "Sí, Eliminar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* HEADER RESPONSIVE MODIFICADO CON BOTÓN DE RE-ENTRENAR E INFO */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Historial</h1>
          <p className="text-muted-foreground">Gestiona tus propuestas y entrena a la IA.</p>
        </div>
        
        {/* Acciones en bloque responsive */}
        <div className="flex flex-col items-end gap-2 w-full md:w-auto animate-in fade-in slide-in-from-top-2">
            
            <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                {selectedIds.length > 0 ? (
                    <Button variant="destructive" onClick={() => confirmDelete(selectedIds)} className="shadow-lg w-full md:w-auto">
                        <Trash2 className="mr-2 size-4" /> BORRAR ({selectedIds.length})
                    </Button>
                ) : hasPendingChanges ? (
                    <>
                        <Button variant="ghost" onClick={handleCancelChanges} className="flex-1 md:flex-none text-muted-foreground hover:text-foreground">
                            <X className="mr-2 size-4" /> Cancelar
                        </Button>
                        <Button onClick={handleSaveAllChanges} disabled={isSavingBulk} className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white shadow-lg">
                            {isSavingBulk ? <Loader2 className="animate-spin mr-2 size-4"/> : <Save className="mr-2 size-4" />}
                            GUARDAR CAMBIOS
                        </Button>
                    </>
                ) : (
                    <>
                        {/* NUEVO BOTÓN DE RE-ENTRENAR */}
                        <Button 
                            variant="outline" 
                            onClick={handleForceRetrain} 
                            disabled={isRetraining}
                            className="w-full md:w-auto border-primary/20 hover:bg-primary/5"
                        >
                            <RefreshCw className={`mr-2 size-4 ${isRetraining ? "animate-spin" : ""}`} />
                            {isRetraining ? "Entrenando..." : "Re-entrenar IA"}
                        </Button>

                        <Button onClick={() => setShowUploadDialog(true)} className="w-full md:w-auto bg-primary text-primary-foreground">
                            <Plus className="mr-2 size-4"/> Subir Licitación Pasada
                        </Button>
                    </>
                )}
            </div>

            {/* TEXTO ACLARATORIO (Visible si no hay selección/cambios) */}
            {!selectedIds.length && !hasPendingChanges && (
                <div className="flex items-center text-[10px] md:text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded border border-border self-start md:self-end">
                    <Info className="size-3 mr-1.5 text-blue-500" />
                    <span>Nota: El modelo se auto-actualiza cada 5 cambios.</span>
                </div>
            )}
        </div>
      </div>

      <UploadHistoryDialog open={showUploadDialog} onOpenChange={setShowUploadDialog} onUploadComplete={fetchBids} />

      {/* --- VISTA DESKTOP: TABLA --- */}
      <Card className="hidden md:block border-border bg-card shadow-sm mt-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/50">
                <TableHead className="w-[50px]"><Checkbox checked={bids.length > 0 && selectedIds.length === bids.length} onCheckedChange={(c) => handleSelectAll(c as boolean)} /></TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Industria</TableHead>
                <TableHead>Presupuesto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bids.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Sin historial.</TableCell></TableRow> : (
                bids.map((bid) => {
                    const isNew = bid.id === activeHighlight
                    const isSelected = selectedIds.includes(bid.id)
                    const isModified = pendingChanges[bid.id] !== undefined
                    return (
                        <TableRow key={bid.id} id={`bid-row-${bid.id}`} className={`transition-all duration-300 border-b ${isSelected ? "bg-primary/5" : ""} ${isNew ? "bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20" : ""} ${isModified ? "bg-blue-500/10 border-l-4 border-l-blue-500" : "hover:bg-muted/50 border-l-4 border-l-transparent"}`}>
                            <TableCell><Checkbox checked={isSelected} onCheckedChange={(c) => handleSelectOne(bid.id, c as boolean)} /></TableCell>
                            <TableCell className="text-muted-foreground text-xs font-mono">{formatDateTime(bid.created_at)}</TableCell>
                            <TableCell className="font-medium py-4"><span className="text-base">{bid.project_name}</span></TableCell>
                            <TableCell>{bid.industry || "-"}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{bid.budget > 0 ? `$${bid.budget.toLocaleString()}` : "-"}</TableCell>
                            <TableCell>
                                <Select value={bid.status} onValueChange={(val) => handleLocalStatusChange(bid.id, val)}>
                                    <SelectTrigger className={`w-[140px] h-9 border font-medium ${getStatusColor(bid.status)} transition-colors`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PENDING">⏳ Pendiente</SelectItem>
                                        <SelectItem value="WON">🏆 Ganada</SelectItem>
                                        <SelectItem value="LOST">❌ Perdida</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-blue-600" onClick={() => setViewingBid(bid)} title="Ver"><FileText className="size-4" /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditingBid(bid)}><Pencil className="size-4" /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => confirmDelete([bid.id])}><Trash2 className="size-4" /></Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* --- VISTA MÓVIL: TARJETAS --- */}
      <div className="md:hidden space-y-4">
        {bids.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">Sin historial.</div>
        ) : (
            bids.map((bid) => {
                const isSelected = selectedIds.includes(bid.id)
                const isModified = pendingChanges[bid.id] !== undefined
                
                return (
                    <Card key={bid.id} className={`transition-all border-l-4 ${isSelected ? "border-primary bg-primary/5" : isModified ? "border-blue-500 bg-blue-500/5" : "border-transparent bg-card"}`}>
                        <CardContent className="p-4 space-y-4">
                            {/* Header Tarjeta: Checkbox + Título + Acciones */}
                            <div className="flex items-start justify-between gap-3">
                                <Checkbox checked={isSelected} onCheckedChange={(c) => handleSelectOne(bid.id, c as boolean)} className="mt-1" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-base leading-tight truncate">{bid.project_name}</h3>
                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        <Calendar className="size-3"/> {formatDateTime(bid.created_at)}
                                    </p>
                                </div>
                                <div className="flex shrink-0">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingBid(bid)}><FileText className="size-4 text-muted-foreground" /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingBid(bid)}><Pencil className="size-4 text-muted-foreground" /></Button>
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="bg-muted/50 p-2 rounded flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><Briefcase className="size-3"/> Industria</span>
                                    <span className="font-medium truncate">{bid.industry || "N/A"}</span>
                                </div>
                                <div className="bg-muted/50 p-2 rounded flex flex-col">
                                    <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1"><DollarSign className="size-3"/> Presupuesto</span>
                                    <span className="font-mono font-medium">{bid.budget > 0 ? `$${bid.budget.toLocaleString()}` : "-"}</span>
                                </div>
                            </div>

                            {/* Selector de Estado Full Width */}
                            <div>
                                <Select value={bid.status} onValueChange={(val) => handleLocalStatusChange(bid.id, val)}>
                                    <SelectTrigger className={`w-full h-10 border font-medium ${getStatusColor(bid.status)}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PENDING">⏳ Pendiente</SelectItem>
                                        <SelectItem value="WON">🏆 Ganada</SelectItem>
                                        <SelectItem value="LOST">❌ Perdida</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                )
            })
        )}
      </div>

    </div>
  )
}