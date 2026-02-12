"use client"

import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation" 
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Upload, Loader2, CheckCircle, AlertCircle, TrendingUp, DollarSign, Briefcase, MessageSquare, FileText, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface UploadTenderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigateToEditor: () => void
}

// Estructura para SHAP
interface ShapFactor {
  feature: string
  impact_value: number
  direction: string
}

interface AnalysisResult {
  detected_industry: string
  detected_budget: number
  win_probability: number
  explanation?: ShapFactor[]
}

export function UploadTenderDialog({ open, onOpenChange, onNavigateToEditor }: UploadTenderDialogProps) {
  const { getToken } = useAuth()
  const router = useRouter() 
  
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setUploadStatus("idle")
      setAnalysis(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    setUploadStatus("idle")
    setAnalysis(null)

    try {
      const token = await getToken()
      
      const formData = new FormData()
      formData.append("file", file)
      formData.append("category", "active_tender")

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/upload-pdf`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`
        },
        body: formData,
      })

      if (!response.ok) throw new Error("Upload error")

      const data = await response.json()
      
      const resultData: AnalysisResult = {
        detected_industry: data.analysis?.detected_industry || "General",
        detected_budget: data.analysis?.detected_budget || 0,
        win_probability: data.analysis?.win_probability || 0, 
        explanation: data.analysis?.explanation || [] 
      }

      setAnalysis(resultData)
      setUploadStatus("success")

    } catch (error) {
      console.error("Error subiendo archivo:", error)
      setUploadStatus("error")
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setUploadStatus("idle")
    setAnalysis(null)
    onOpenChange(false)
  }

  const handleContinue = () => {
    sessionStorage.setItem("should_generate_draft", "true")
    sessionStorage.removeItem("should_open_chat") 
    onOpenChange(false)
    onNavigateToEditor() 
  }

  const handleChatOnly = () => {
    sessionStorage.setItem("should_open_chat", "true")
    sessionStorage.removeItem("should_generate_draft")
    
    onOpenChange(false)
    router.push("/dashboard/bid-agent")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Analyze New Tender</DialogTitle>
          <DialogDescription>
            Upload the PDF. The AI will extract key data and explain your win probability.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          
          {/* FASE 1: SELECCIÓN Y CARGA */}
          {(uploadStatus !== "success" || !analysis) && (
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors relative">
              
              {!isUploading && file && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.preventDefault(); setFile(null); }}
                  >
                    <X className="size-4"/>
                  </Button>
              )}

              {!isUploading && (
                <label htmlFor="pdf-upload" className="cursor-pointer text-center w-full flex flex-col items-center">
                  {file ? (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <div className="mx-auto size-16 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                            <FileText className="size-8 text-primary" />
                        </div>
                        <p className="text-sm font-semibold text-foreground max-w-[200px] truncate mx-auto">
                            {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {(file.size / 1024 / 1024).toFixed(2)} MB • Click to change
                        </p>
                    </div>
                  ) : (
                    <div>
                        <div className="mx-auto size-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <Upload className="size-6 text-primary" />
                        </div>
                        <span className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                            Select PDF
                        </span>
                        <p className="text-xs text-muted-foreground mt-3">PDF files only (max 10MB)</p>
                    </div>
                  )}
                  <Input id="pdf-upload" type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                </label>
              )}

              {isUploading && (
                <div className="flex flex-col items-center">
                  <Loader2 className="size-10 text-primary animate-spin mb-2" />
                  <p className="text-sm font-medium">Analyzing document...</p>
                  <p className="text-xs text-muted-foreground mt-1">Calculating win prediction...</p>
                </div>
              )}

              {uploadStatus === "error" && (
                <div className="flex flex-col items-center mt-4">
                    <div className="flex items-center text-destructive font-bold gap-2 mb-2">
                        <AlertCircle className="size-5"/> Processing error
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setUploadStatus("idle")}>Try again</Button>
                </div>
              )}
            </div>
          )}

          {/* FASE 2: RESULTADOS + SHAP */}
          {uploadStatus === "success" && analysis && (
            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="flex flex-col items-center justify-center p-3 bg-green-100 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle className="size-6 text-green-600 dark:text-green-400 mb-1" />
                <h3 className="text-md font-bold text-green-700 dark:text-green-300">Analysis complete!</h3>
              </div>

              <div className="col-span-2 bg-card border border-border rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-3">
                        <div className="size-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <TrendingUp className="size-5 text-primary"/>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Win Probability</p>
                            <h4 className="text-2xl font-bold">{analysis.win_probability}%</h4>
                        </div>
                     </div>
                     <Badge className={`px-3 py-1 text-sm ${analysis.win_probability > 50 ? "bg-green-600" : "bg-destructive"}`}>
                        {analysis.win_probability > 50 ? "GO 🟢" : "NO GO 🔴"}
                     </Badge>
                  </div>
                  
                  {/* --- SECCIÓN SHAP VISUAL (CORREGIDA Y MEJORADA) --- */}
                  {analysis.explanation && analysis.explanation.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">DECISION FACTORS ({analysis.explanation.length})</p>
                          {/* Contenedor con Scroll por si hay muchos atributos */}
                          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2">
                              {/* Mapeo completo SIN .slice() */}
                              {analysis.explanation.map((factor, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-sm group hover:bg-muted/50 p-1 rounded transition-colors">
                                      <span className="truncate max-w-[180px] text-muted-foreground font-medium" title={factor.feature}>
                                          {factor.feature}
                                      </span>
                                      <div className="flex items-center gap-2">
                                          {/* Barra visual proporcional */}
                                          <div className="h-2 w-20 bg-muted rounded-full overflow-hidden flex justify-end"> 
                                              <div 
                                                className={`h-full ${factor.direction === "Positivo" ? "bg-green-500" : "bg-red-500"}`} 
                                                // Factor x10 para que valores pequeños de SHAP sean visibles
                                                style={{ width: `${Math.min(Math.abs(factor.impact_value) * 100 * 10, 100)}%` }} 
                                              />
                                          </div>
                                          <span className={`text-xs font-bold w-16 text-right ${factor.direction === "Positivo" ? "text-green-600" : "text-red-600"}`}>
                                              {factor.direction === "Positivo" ? "+" : "-"} Impact
                                          </span>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                    <DollarSign className="size-3"/> <span className="text-xs font-medium">Budget</span>
                  </div>
                  <p className="text-sm font-semibold">${analysis.detected_budget.toLocaleString()}</p>
                </div>
                
                <div className="bg-muted/30 border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                    <Briefcase className="size-3"/> <span className="text-xs font-medium">Industry</span>
                  </div>
                  <p className="text-sm font-semibold truncate" title={analysis.detected_industry}>{analysis.detected_industry}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 pt-4 border-t border-border">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          
          {uploadStatus === "success" ? (
            <div className="flex gap-2">
                <Button variant="outline" onClick={handleChatOnly}>
                    <MessageSquare className="size-4 mr-2 text-primary"/> Chat
                </Button>
                
                <Button onClick={handleContinue} className="bg-green-600 hover:bg-green-700 text-white">
                    Generar Proposal
                </Button>
            </div>
          ) : (
            <Button onClick={handleUpload} disabled={!file || isUploading}>
                {isUploading ? "Analyzing..." : "Analyze"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}