"use client"

import { useState, useRef, useEffect } from "react"
import { useAuth } from "@clerk/nextjs" 
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Upload, Trash2, FileText, Loader2, Sparkles, AlertTriangle, Save, X, Calendar, Tag } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
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

interface Document {
  id: number
  filename: string
  category: string
  upload_date: string
}

export function KnowledgeBase() {
  const { getToken } = useAuth() 
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  
  const [pendingChanges, setPendingChanges] = useState<Record<number, string>>({})
  const [isSavingBulk, setIsSavingBulk] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [idsToDelete, setIdsToDelete] = useState<number[]>([])

  const fetchDocuments = async () => {
    try {
      const token = await getToken()
      if (!token) return
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/documents`, {
          headers: { "Authorization": `Bearer ${token}` } 
      })
      if (response.ok) {
        const data = await response.json()
        setDocuments(data)
        setPendingChanges({}) 
      }
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setIsLoadingData(false)
    }
  }

  useEffect(() => { fetchDocuments() }, [])

  const handleLocalCategoryChange = (id: number, newCategory: string) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, category: newCategory } : d))
    setPendingChanges(prev => ({ ...prev, [id]: newCategory }))
  }

  const handleSaveAllChanges = async () => {
    setIsSavingBulk(true)
    const updates = Object.entries(pendingChanges).map(([id, category]) => ({
        id: Number(id),
        category
    }))

    try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/documents/bulk-update`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ updates })
        })

        if (!res.ok) throw new Error("Bulk update error")

        const data = await res.json()
        
        toast({
            title: "✅ Changes Saved",
            description: data.message,
            className: "bg-green-600 text-white border-none"
        })
        
        setPendingChanges({}) 
        await fetchDocuments() 

    } catch (error) {
        console.error(error)
        toast({ title: "Error", description: "Could not save changes.", variant: "destructive" })
        fetchDocuments() 
    } finally {
        setIsSavingBulk(false)
    }
  }

  const handleCancelChanges = () => {
      setPendingChanges({})
      fetchDocuments() 
      toast({ description: "Changes discarded." })
  }

  const handleSelectAll = (checked: boolean) => {
    checked ? setSelectedIds(documents.map(d => d.id)) : setSelectedIds([])
  }

  const handleSelectOne = (id: number, checked: boolean) => {
    checked 
      ? setSelectedIds(prev => [...prev, id]) 
      : setSelectedIds(prev => prev.filter(item => item !== id))
  }

  const confirmDelete = (ids: number[]) => {
    setIdsToDelete(ids)
    setDeleteDialogOpen(true)
  }

  const executeDelete = async () => {
    try {
        const token = await getToken()
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/documents/delete`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ ids: idsToDelete })
        })

        if (!response.ok) throw new Error("Error API")

        setDocuments(prev => prev.filter(doc => !idsToDelete.includes(doc.id)))
        setSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)))
        toast({ title: "🗑️ Deleted", description: `${idsToDelete.length} file(s) removed.` })

    } catch (error) {
        toast({ title: "Error", variant: "destructive" })
    } finally {
        setDeleteDialogOpen(false)
        setIdsToDelete([])
    }
  }

  const uploadFile = async (file: File) => {
    setIsUploading(true)
    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append("file", file)
      formData.append("category", "auto") 
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/upload-pdf`, { 
          method: "POST", 
          headers: { "Authorization": `Bearer ${token}` }, 
          body: formData 
      })
      if (!response.ok) throw new Error("Error")
      const data = await response.json()
      fetchDocuments()
      toast({ title: "✅ Processed", description: `Category detected: ${data.detected_category}`, className: "bg-green-600 text-white border-none" })
    } catch (error) {
      toast({ title: "Error", variant: "destructive" })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) await uploadFile(e.target.files[0])
  }

  const getCategoryColor = (category: string) => {
      const cat = category?.toLowerCase() || ""
      if (cat.includes("cv")) return "text-blue-600 bg-blue-50 border-blue-200"
      if (cat.includes("case")) return "text-green-600 bg-green-50 border-green-200"
      if (cat.includes("finan")) return "text-yellow-600 bg-yellow-50 border-yellow-200"
      if (cat.includes("tech")) return "text-purple-600 bg-purple-50 border-purple-200"
      return "text-gray-600 bg-gray-50 border-gray-200"
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-"
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return "-"
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }
  
  const formatTime = (dateString?: string) => {
      if (!dateString) return ""
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return ""
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
  }

  const hasPendingChanges = Object.keys(pendingChanges).length > 0

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 h-full overflow-y-auto">
      
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="size-5"/>
                {idsToDelete.length > 1 
                  ? `Delete ${idsToDelete.length} documents?` 
                  : "Delete this document?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be removed from the database and the AI will forget their content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
               {idsToDelete.length > 1 ? "Yes, Delete All" : "Yes, Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Knowledge Base</h1>
            <p className="text-muted-foreground mt-1">Manage your company's knowledge documents.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-2 w-full md:w-auto">
            
            {hasPendingChanges && (
                <>
                    <Button 
                        variant="ghost" 
                        onClick={handleCancelChanges} 
                        className="flex-1 md:flex-none text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                        <X className="mr-2 size-4" /> Cancel
                    </Button>
                    <Button 
                        onClick={handleSaveAllChanges} 
                        disabled={isSavingBulk}
                        className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white shadow-lg transition-all hover:scale-105"
                    >
                        {isSavingBulk ? <Loader2 className="animate-spin mr-2 size-4"/> : <Save className="mr-2 size-4" />}
                        GUARDAR ({Object.keys(pendingChanges).length})
                    </Button>
                </>
            )}

            {selectedIds.length > 0 && !hasPendingChanges && (
                <Button 
                    variant="destructive" 
                    onClick={() => confirmDelete(selectedIds)}
                    className="flex-1 md:flex-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                >
                    <Trash2 className="mr-2 size-4" />
                    BORRAR ({selectedIds.length})
                </Button>
            )}
        </div>
      </div>

      <Card onClick={() => !isUploading && fileInputRef.current?.click()} className="border-2 border-dashed border-border bg-card hover:border-primary/50 transition-colors cursor-pointer group">
        <CardContent className="flex flex-col items-center justify-center py-12 px-4">
          {isUploading ? (
            <div className="flex flex-col items-center animate-pulse"><Loader2 className="size-12 text-primary animate-spin mb-4" /><p className="text-sm text-muted-foreground">Processing...</p></div>
          ) : (
            <>
              <div className="size-14 bg-primary/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Sparkles className="size-7 text-primary" /></div>
              <h3 className="text-lg font-semibold text-card-foreground mb-1">Upload New PDF</h3>
              <p className="text-muted-foreground text-center text-sm">Drag and drop or click. Auto-classification enabled.</p>
              <input type="file" accept=".pdf" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileChange}/>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div><CardTitle className="text-lg">Indexed Files</CardTitle></div>
          <div className="flex items-center gap-2">
               <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:inline">Select All</span>
               <Checkbox checked={documents.length > 0 && selectedIds.length === documents.length} onCheckedChange={(c) => handleSelectAll(c as boolean)} />
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-3">
            {isLoadingData ? <div className="text-center py-8 text-muted-foreground">Loading...</div> : documents.length === 0 ? <div className="text-center py-8 text-muted-foreground">Empty.</div> : (
                documents.map((doc) => {
                    const isModified = pendingChanges[doc.id] !== undefined
                    
                    return (
                        <div 
                            key={doc.id} 
                            className={`
                                flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border transition-all duration-200 relative
                                ${selectedIds.includes(doc.id) ? "bg-primary/5 border-primary/30" : "bg-muted/20 border-border"}
                                ${isModified ? "border-l-4 border-l-blue-500 bg-blue-50/10" : ""} 
                            `}
                        >
                            {/* 1. SECCIÓN DE INFO (Checkbox + Nombre) */}
                            <div className="flex items-start gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
                                <Checkbox className="mt-1" checked={selectedIds.includes(doc.id)} onCheckedChange={(c) => handleSelectOne(doc.id, c as boolean)} />
                                <div className="size-8 sm:size-10 bg-background border border-border rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileText className="size-4 sm:size-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate pr-6">{doc.filename}</p>
                                    <div className="flex items-center gap-2 mt-1 sm:hidden">
                                        <span className="text-[10px] text-muted-foreground font-mono bg-background px-1 rounded border">
                                            {formatDate(doc.upload_date)} {formatTime(doc.upload_date)}
                                        </span>
                                    </div>
                                    <p className="hidden sm:block text-xs text-muted-foreground font-mono mt-0.5">
                                        {formatDate(doc.upload_date)} <span className="opacity-50 mx-1">|</span> {formatTime(doc.upload_date)}
                                    </p>
                                </div>
                            </div>

                            {/* 2. SECCIÓN DE ACCIONES (Select + Botón) */}
                            {/* En móvil, esto va abajo con ancho completo */}
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end pl-8 sm:pl-0">
                                <Select 
                                    value={doc.category} 
                                    onValueChange={(val) => handleLocalCategoryChange(doc.id, val)}
                                >
                                    <SelectTrigger className={`h-8 text-xs font-medium border flex-1 sm:w-[140px] sm:flex-none ${getCategoryColor(doc.category)}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CV">CV / Profile</SelectItem>
                                        <SelectItem value="Case Study">Case Study</SelectItem>
                                        <SelectItem value="Financial">Financial</SelectItem>
                                        <SelectItem value="Technical">Technical</SelectItem>
                                        <SelectItem value="General">General</SelectItem>
                                    </SelectContent>
                                </Select>
                                
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => confirmDelete([doc.id])}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </div>
                    )
                })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}