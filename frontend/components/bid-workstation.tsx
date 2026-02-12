"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { 
  RefreshCw, FileText, Printer, Save, Loader2, Sparkles, 
  CheckCircle, Upload, XCircle, FileClock, AlertTriangle 
} from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle 
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { UploadTenderDialog }  from "@/components/upload-tender-dialog"

export default function BidWorkstation() {
  const { getToken } = useAuth()
  const router = useRouter()
  
  const [proposalText, setProposalText] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLearning, setIsLearning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false)

  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false)
  
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false) 

  const abortControllerRef = useRef<AbortController | null>(null)

  const [finalizeData, setFinalizeData] = useState({
    title: "",
    budget: 0,
    industry: "Technology"
  })

  const { toast } = useToast()

  // 1. EFECTO DE CARGA
  useEffect(() => {
    const savedDraft = localStorage.getItem("autobid_draft_text")
    const savedMeta = localStorage.getItem("autobid_draft_meta")

    if (savedDraft) {
        setProposalText(savedDraft)
        if (savedMeta) {
            setFinalizeData(JSON.parse(savedMeta))
        }
        if (savedDraft.length > 10) {
            toast({ 
                title: "Draft Recovered", 
                description: "Your previous work has been restored.",
                duration: 3000
            })
        }
    }
    setHasLoadedDraft(true)
  }, [])

  // 2. EFECTO DE AUTO-GUARDADO
  useEffect(() => {
    if (hasLoadedDraft) {
        localStorage.setItem("autobid_draft_text", proposalText)
        localStorage.setItem("autobid_draft_meta", JSON.stringify(finalizeData))
    }
  }, [proposalText, finalizeData, hasLoadedDraft])


  const handleGenerateClick = () => {
    if (proposalText.length > 50 && !isGenerating) {
        setShowOverwriteDialog(true) 
    } else {
        executeGeneration() 
    }
  }

  const executeGeneration = async () => {
    setShowOverwriteDialog(false) 

    if (abortControllerRef.current) {
        abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsGenerating(true)
    try {
      const token = await getToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/generate-proposal`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        signal: controller.signal
      })
      
      const data = await response.json()
      setProposalText(data.draft_text)
      setFinalizeData(prev => ({...prev, title: "AI-Generated Proposal", budget: 0}))

    } catch (error: any) {
      if (error.name === 'AbortError') {
         console.log('🛑 Generación cancelada por el usuario')
      } else {
         console.error("Error:", error)
         setProposalText("Error connecting to server.")
      }
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        toast({ title: "Cancelled", description: "Generation stopped.", variant: "destructive" })
    }
  }

  const handleSaveAndLearn = async () => {
    setIsLearning(true)
    try {
        const token = await getToken()
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/learn-from-proposal`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ text: proposalText })
        })
        if (response.ok) {
            toast({
                title: "🧠 Memoria Actualizada",
                className: "bg-green-600 text-white border-none",
            })
        }
    } catch (error) {
        toast({ title: "Error", variant: "destructive" })
    } finally {
        setIsLearning(false)
    }
  }

  const handleOpenFinalize = () => {
    if (!proposalText) return
    setShowFinalizeDialog(true)
  }

  const confirmFinalize = async () => {
    setIsSaving(true)
    try {
        const token = await getToken()
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bids/finalize`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                title: finalizeData.title || "Untitled Proposal", 
                content: proposalText,
                industry: finalizeData.industry, 
                budget: finalizeData.budget 
            })
        })
        
        const data = await response.json()

        localStorage.removeItem("autobid_draft_text")
        localStorage.removeItem("autobid_draft_meta")
        setProposalText("") 

        toast({ 
            title: "✅ Saved", 
            description: "Redirecting...",
            className: "bg-green-600 text-white border-none"
        })

        setShowFinalizeDialog(false)
        router.push(`/dashboard/history?highlight=${data.id}`)

    } catch (e) {
        toast({ title: "Error", description: "Could not save.", variant: "destructive" })
    } finally {
        setIsSaving(false)
    }
  }

  const handleExportPDF = () => {
     const printWindow = window.open('', '', 'height=800,width=800');
     if (printWindow) {
         const cleanHtml = proposalText.replace(/\n/g, '<br/>')
         printWindow.document.write(`<html><body>${cleanHtml}</body></html>`); 
         printWindow.document.close();
         printWindow.print();
     }
  }

  useEffect(() => {
    const shouldGenerate = sessionStorage.getItem("should_generate_draft")
    if (shouldGenerate === "true") {
        executeGeneration()
        sessionStorage.removeItem("should_generate_draft")
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-background p-4 md:p-6 gap-6 relative">
      
      <UploadTenderDialog 
        open={showUploadDialog} 
        onOpenChange={setShowUploadDialog}
        onNavigateToEditor={() => executeGeneration()} 
      />

      {/* --- DIALOGO DE ADVERTENCIA --- */}
      <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
        <DialogContent className="sm:max-w-[425px] border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5" />
                Warning: Overwrite Draft
            </DialogTitle>
            <DialogDescription className="pt-2">
              You already have a proposal written. If you generate a new version with AI, you will <strong>permanently lose the current content</strong>.
              <br/><br/>
              Do you want to continue anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-3 sm:justify-end sm:gap-4">
            <Button variant="outline" onClick={() => setShowOverwriteDialog(false)}>
                Cancel
            </Button>
            <Button variant="destructive" onClick={executeGeneration}>
                Yes, Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- DIALOGO DE FINALIZAR --- */}
      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>Finalize and Save</DialogTitle>
            <DialogDescription>
              It will be saved as <strong>PENDING</strong> in history.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Project Name</Label>
              <Input 
                id="title" 
                value={finalizeData.title} 
                onChange={(e) => setFinalizeData({...finalizeData, title: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="budget">Budget ($)</Label>
                    <Input 
                        id="budget" 
                        type="number"
                        placeholder="0"
                        value={finalizeData.budget === 0 ? "" : finalizeData.budget} 
                        onChange={(e) => {
                            const val = e.target.value;
                            setFinalizeData({
                                ...finalizeData, 
                                budget: val === "" ? 0 : parseFloat(val)
                            })
                        }}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input 
                        id="industry" 
                        value={finalizeData.industry} 
                        onChange={(e) => setFinalizeData({...finalizeData, industry: e.target.value})}
                    />
                </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)}>Cancel</Button>
            <Button onClick={confirmFinalize} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
              {isSaving ? <Loader2 className="animate-spin size-4 mr-2"/> : <Save className="size-4 mr-2"/>}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HEADER PRINCIPAL RESPONSIVE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="size-6 text-primary shrink-0" />
          <span className="truncate">Proposal Editor</span>
          {proposalText && (
             <span className="text-xs font-normal text-muted-foreground flex items-center gap-1 bg-muted px-2 py-1 rounded-full whitespace-nowrap">
                <FileClock className="size-3"/> <span className="hidden sm:inline">Saved</span>
             </span>
          )}
        </h1>
        
        {/* GRUPO DE ACCIONES RESPONSIVE */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {proposalText && (
                <Button variant="outline" onClick={() => setShowUploadDialog(true)} className="flex-1 md:flex-none">
                    <Upload className="mr-2 size-4" />
                    <span className="hidden sm:inline">New</span>
                    <span className="sm:hidden">New</span>
                </Button>
            )}

            {isGenerating ? (
                <Button variant="destructive" onClick={handleCancelGeneration} className="animate-pulse flex-1 md:flex-none">
                    <XCircle className="mr-2 size-4" /> Cancel
                </Button>
            ) : (
                <Button variant="outline" onClick={handleGenerateClick} disabled={!proposalText} className="flex-1 md:flex-none">
                    <RefreshCw className="mr-2 size-4" /> 
                    <span className="hidden sm:inline">Regenerate</span>
                    <span className="sm:hidden">Regen.</span>
                </Button>
            )}
            
            <Button 
                variant="secondary" 
                onClick={handleSaveAndLearn} 
                disabled={isLearning || isGenerating || !proposalText}
                className="bg-purple-600 hover:bg-purple-700 text-white flex-1 md:flex-none"
            >
                {isLearning ? <Loader2 className="animate-spin size-4 mr-2"/> : <Sparkles className="size-4 mr-2"/>} 
                <span className="hidden sm:inline">Learn</span>
                <span className="sm:hidden">Learn</span>
            </Button>

            <Button onClick={handleOpenFinalize} className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-none" disabled={!proposalText}>
                <CheckCircle className="mr-2 size-4" /> 
                <span className="hidden sm:inline">Finalizar</span>
                <span className="sm:hidden">Fin.</span>
            </Button>

            <Button onClick={handleExportPDF} className="bg-primary text-primary-foreground flex-1 md:flex-none" disabled={!proposalText}>
                <Printer className="mr-2 size-4" /> 
                <span className="hidden sm:inline">Exportar</span>
                <span className="sm:hidden">PDF</span>
            </Button>
        </div>
      </div>

      {/* ÁREA DE EDICIÓN */}
      <div className="flex-1 min-h-0 relative">
        <Card className="h-full flex flex-col border-border bg-card overflow-hidden relative">
            
            {isGenerating && (
                <div className="absolute inset-0 z-50 bg-background flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <div className="flex flex-col items-center gap-6 px-4">
                         <div className="relative">
                             <div className="size-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                             <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles className="size-6 text-primary animate-pulse" />
                             </div>
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-xl font-semibold">Drafting proposal...</p>
                            <p className="text-muted-foreground">Checking history and credentials</p>
                            <p className="text-xs text-muted-foreground mt-4 opacity-70">Taking too long? Click "Cancel" above.</p>
                        </div>
                    </div>
                </div>
            )}

            <CardContent className="flex-1 p-0 h-full">
                {proposalText ? (
                    <Textarea 
                        className="w-full h-full p-6 md:p-12 resize-none bg-background text-foreground border-0 focus-visible:ring-0 font-sans text-base leading-relaxed overflow-y-auto shadow-none"
                        value={proposalText}
                        onChange={(e) => setProposalText(e.target.value)}
                        disabled={isGenerating} 
                    />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-muted/5 animate-in fade-in zoom-in duration-300">
                        <div className="bg-primary/5 p-8 rounded-full mb-6 border border-primary/10">
                            <FileText className="size-16 text-primary/40" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground mb-3">No active proposal</h2>
                        <p className="text-muted-foreground max-w-md mb-8 text-lg">To get started, upload the PDF of a tender.</p>
                        <Button 
                            size="lg" 
                            onClick={() => setShowUploadDialog(true)}
                            className="bg-primary text-primary-foreground text-lg px-8 py-6 h-auto shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 w-full sm:w-auto"
                        >
                            <Upload className="mr-3 size-6" /> Analizar Nuevo Tender
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
      </div>
    </div>
  )
}