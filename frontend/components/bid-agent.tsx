"use client"

import { useState, useRef, useEffect } from "react"
import { useAuth, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Bot, Send, Loader2, Sparkles, Upload, FileText, Trash2, 
  Mic, Square, Volume2, Copy, Check 
} from "lucide-react"
import { UploadTenderDialog } from "@/components/upload-tender-dialog"
import { useToast } from "@/components/ui/use-toast"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface ChatMessage {
  role: "user" | "bot"
  text: string
  timestamp: Date
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export function BidAgent() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const { toast } = useToast()
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      role: "bot", 
      text: "Hi! I'm your Bid Agent. I have the context of the last tender you uploaded. What would you like to analyze?", 
      timestamp: new Date() 
    }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  // --- 1. CONFIGURACIÓN STT ---
  useEffect(() => {
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'es-ES'

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
             // Lógica simplificada para input directo
             setInput(prev => event.results[i][0].transcript)
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) {
        toast({ title: "Not supported", description: "Your browser does not support voice recognition.", variant: "destructive" })
        return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      setInput("")
      recognitionRef.current.start()
      setIsListening(true)
      toast({ description: "🎙️ Listening..." })
    }
  }

  // --- 2. CONFIGURACIÓN TTS ---
  const handleSpeak = (text: string, index: number) => {
    if (!('speechSynthesis' in window)) return

    if (speakingMsgIndex === index) {
        window.speechSynthesis.cancel()
        setSpeakingMsgIndex(null)
        return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-ES'
    utterance.rate = 1.0
    utterance.onend = () => setSpeakingMsgIndex(null)
    
    setSpeakingMsgIndex(index)
    window.speechSynthesis.speak(utterance)
  }

  // --- 3. UTILIDAD COPIAR ---
  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
        }
    }, 100)
    return () => clearTimeout(timeoutId)
  }, [messages, loading, input])

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim()) return

    if (isListening && recognitionRef.current) {
        recognitionRef.current.stop()
        setIsListening(false)
    }

    const userMsg: ChatMessage = { role: "user", text: input, timestamp: new Date() }
    const botMsgPlaceholder: ChatMessage = { role: "bot", text: "", timestamp: new Date() }
    
    setMessages(prev => [...prev, userMsg, botMsgPlaceholder])
    setInput("")
    setLoading(true)

    try {
      const token = await getToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rag/chat/stream`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ question: userMsg.text })
      })

      if (!response.ok) throw new Error("Error")
      if (!response.body) throw new Error("No response body")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      let accumulatedText = ""

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        
        if (value) {
          const chunkValue = decoder.decode(value)
          accumulatedText += chunkValue
          setMessages(prev => {
            const newHistory = [...prev]
            if (newHistory[newHistory.length - 1].role === "bot") {
                newHistory[newHistory.length - 1].text = accumulatedText
            }
            return newHistory
          })
        }
      }

    } catch (error) {
      toast({ title: "Error", description: "Connection was interrupted.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleClearChat = () => {
      setMessages([messages[0]]) 
      toast({ description: "Chat cleared." })
  }

  return (
    // CAMBIO 1: Padding reducido en móvil (p-4) y flex-col
    <div className="h-full flex flex-col p-4 md:p-6 gap-4 md:gap-6 bg-background overflow-hidden relative">
      
      <UploadTenderDialog 
        open={showUploadDialog} 
        onOpenChange={setShowUploadDialog}
        onNavigateToEditor={() => {
            setMessages([{ 
                role: "bot", 
                text: "I've read the new document. How can I help you?", 
                timestamp: new Date() 
            }])
        }}
      />

      {/* HEADER RESPONSIVE */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between shrink-0 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-foreground">
            <Bot className="size-6 md:size-8 text-primary shrink-0" /> 
            Bid Agent
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Chat with the active tender.
          </p>
        </div>
        
        {/* BOTONES FULL WIDTH EN MÓVIL */}
        <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" onClick={handleClearChat} className="flex-1 md:flex-none gap-2">
              <Trash2 className="size-4 text-muted-foreground" /> 
              <span className="hidden sm:inline">Clear</span>
            </Button>
            <Button onClick={() => setShowUploadDialog(true)} className="flex-1 md:flex-none bg-primary text-primary-foreground">
                <Upload className="mr-2 size-4" /> 
                <span className="hidden sm:inline">Change Tender</span>
                <span className="sm:hidden">Upload PDF</span>
            </Button>
        </div>
      </div>

      {/* CHAT AREA */}
      <Card className="flex-1 flex flex-col min-h-0 border-border bg-card shadow-sm overflow-hidden">
        <ScrollArea className="flex-1 min-h-0">
          <div className="max-w-3xl mx-auto space-y-6 px-4 md:px-6 pb-2 pt-6 md:pt-10">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300 group`}>
                
                {/* AVATAR */}
                {msg.role === 'user' ? (
                   <Avatar className="size-8 md:size-10 border shadow-sm">
                      <AvatarImage src={user?.imageUrl} alt="User" />
                      <AvatarFallback className="bg-primary text-primary-foreground">U</AvatarFallback>
                   </Avatar>
                ) : (
                   <div className="size-8 md:size-10 rounded-full flex items-center justify-center shrink-0 border shadow-sm bg-background border-border text-primary">
                      <Sparkles className="size-4 md:size-5"/>
                   </div>
                )}

                {/* MENSAJE + TOOLBAR */}
                <div className={`flex flex-col max-w-[85%] md:max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    
                    <div className={`p-3 md:p-4 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap relative ${
                        msg.role === 'user' 
                            ? 'bg-primary text-primary-foreground rounded-tr-none' 
                            : 'bg-muted/50 text-foreground border border-border rounded-tl-none'
                    }`}>
                        {msg.role === 'bot' && msg.text === "" ? (
                           <div className="flex items-center gap-2 text-muted-foreground italic">
                                <Loader2 className="size-3 animate-spin"/>
                                <span>Thinking...</span>
                           </div>
                        ) : (
                           msg.text
                        )}
                    </div>

                    {/* CAMBIO 2: VISIBILIDAD DE HERRAMIENTAS 
                        - En móvil (default): opacity-100 (siempre visible).
                        - En desktop (md): opacity-0 y group-hover:opacity-100.
                        Esto soluciona el problema de que en touch no hay hover.
                    */}
                    {msg.role === 'bot' && msg.text !== "" && (
                        <div className="flex items-center gap-1 mt-1 transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6" 
                                onClick={() => handleSpeak(msg.text, i)}
                                title="Read aloud"
                            >
                                {speakingMsgIndex === i ? (
                                    <Square className="size-3 text-red-500 fill-current" />
                                ) : (
                                    <Volume2 className="size-3 text-muted-foreground" />
                                )}
                            </Button>
                            
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6" 
                                onClick={() => handleCopy(msg.text, i)}
                                title="Copy"
                            >
                                {copiedIndex === i ? (
                                    <Check className="size-3 text-green-500" />
                                ) : (
                                    <Copy className="size-3 text-muted-foreground" />
                                )}
                            </Button>
                        </div>
                    )}
                    
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
              </div>
            ))}
            <div ref={scrollRef} className="h-1" />
          </div>
        </ScrollArea>

        {/* INPUT AREA RESPONSIVE */}
        <div className="shrink-0 px-3 py-3 md:px-4 bg-background border-t border-border z-10">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                
                {/* ICONO INPUT (Oculto en móvil para ganar espacio si quieres, o más chico) */}
                <div className="absolute left-3 top-3 flex items-center justify-center size-6 pointer-events-none z-20">
                    {isListening ? (
                        <div className="flex space-x-1">
                             <div className="w-1 h-3 bg-red-500 animate-bounce delay-75"></div>
                             <div className="w-1 h-4 bg-red-500 animate-bounce delay-150"></div>
                             <div className="w-1 h-2 bg-red-500 animate-bounce delay-300"></div>
                        </div>
                    ) : (
                        <FileText className="size-5 text-muted-foreground/50"/>
                    )}
                </div>

                <Input 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    // Placeholder más corto para móvil
                    placeholder={isListening ? "Listening..." : "Ask a question..."}
                    className={`pl-10 h-12 text-base shadow-sm focus-visible:ring-primary/20 transition-all ${
                        isListening ? "border-red-500 ring-1 ring-red-500 bg-red-50 dark:bg-red-950/20" : "border-muted-foreground/20"
                    }`}
                    autoFocus
                    disabled={loading}
                />
                
                <Button 
                    type="button" 
                    variant="ghost"
                    size="icon"
                    className={`h-12 w-12 shrink-0 ${isListening ? "text-red-500 bg-red-100" : "text-muted-foreground"}`}
                    onClick={toggleListening}
                    disabled={loading}
                >
                    {isListening ? <Square className="size-5 fill-current"/> : <Mic className="size-5"/>}
                </Button>

                <Button type="submit" size="icon" className="h-12 w-12 shrink-0 shadow-md" disabled={!input || loading}>
                    {loading ? <Loader2 className="size-5 animate-spin"/> : <Send className="size-5"/>}
                </Button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  )
}