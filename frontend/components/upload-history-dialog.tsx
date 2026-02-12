"use client"

import { useState } from "react"
import { useAuth } from "@clerk/nextjs" // <--- 1. IMPORTAR AUTH
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, Loader2, FileText, Trophy, XCircle, Clock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface UploadHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadComplete: () => void
}

export function UploadHistoryDialog({ open, onOpenChange, onUploadComplete }: UploadHistoryDialogProps) {
  const { getToken } = useAuth() // <--- 2. OBTENER LA FUNCIÓN DEL TOKEN
  
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string>("WON")
  const [isUploading, setIsUploading] = useState(false)
  const { toast } = useToast()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    try {
      const token = await getToken() // <--- 3. GENERAR EL TOKEN
      
      const formData = new FormData()
      formData.append("file", file)
      formData.append("status", status)

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history/upload`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}` // <--- 4. ENVIARLO EN LA CABECERA
        },
        body: formData,
      })

      if (!res.ok) throw new Error("Upload failed")

      toast({
        title: "✅ History Saved",
        description: status !== "PENDING" 
          ? "The AI model has been retrained with this case." 
          : "Saved to history as pending.",
        className: "bg-green-600 text-white border-none"
      })
      
      onUploadComplete() 
      onOpenChange(false) 
      setFile(null)       
      setStatus("WON")

    } catch (error) {
      console.error(error)
      toast({ 
        title: "Error", 
        description: "Could not upload file. Check your connection.", 
        variant: "destructive" 
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Upload Past Bid</DialogTitle>
          <DialogDescription>
            Upload an old PDF and set its outcome to train the AI.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          
          {/* 1. Selector de Archivo */}
          <div className="flex flex-col gap-3">
            <Label>Proposal Document (PDF)</Label>
            <div className="flex items-center justify-center w-full">
                <label htmlFor="history-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 border-border hover:border-primary/50 transition-all">
                    {file ? (
                        <div className="flex flex-col items-center">
                            <FileText className="size-8 text-primary mb-2" />
                            <p className="text-sm font-medium text-foreground">{file.name}</p>
                            <p className="text-xs text-muted-foreground">Click to change</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <Upload className="size-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">Click or drag here</p>
                        </div>
                    )}
                    <Input id="history-file" type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                </label>
            </div>
          </div>

          {/* 2. Selector de Estado */}
          <div className="flex flex-col gap-3">
            <Label>Project Outcome</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WON">
                    <div className="flex items-center text-green-500">
                        <Trophy className="size-4 mr-2" /> Won (Train Success)
                    </div>
                </SelectItem>
                <SelectItem value="LOST">
                    <div className="flex items-center text-red-500">
                        <XCircle className="size-4 mr-2" /> Lost (Train Failure)
                    </div>
                </SelectItem>
                <SelectItem value="PENDING">
                    <div className="flex items-center text-yellow-500">
                        <Clock className="size-4 mr-2" /> Pending (No Training)
                    </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
                * Only Won or Lost outcomes update the prediction algorithm.
            </p>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || isUploading} className="bg-primary text-primary-foreground">
            {isUploading ? <Loader2 className="animate-spin mr-2 size-4" /> : <Upload className="mr-2 size-4" />}
            {isUploading ? "Processing..." : "Upload & Train"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}