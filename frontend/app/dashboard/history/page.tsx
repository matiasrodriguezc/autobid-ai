import { BidHistory } from "@/components/bid-history"
import { Suspense } from "react"
import { Loader2 } from "lucide-react" 

export default function HistoryPage() {
  return (
    <Suspense 
      fallback={
        <div className="flex h-full items-center justify-center p-8">
            <Loader2 className="size-10 animate-spin text-primary" />
        </div>
      }
    >
      <BidHistory />
    </Suspense>
  )
}