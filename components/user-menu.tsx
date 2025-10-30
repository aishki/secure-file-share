"use client"

import { useState } from "react"
import { getSupabaseClient } from "@/lib/supabase"
import { LogOut, User } from "lucide-react"

export default function UserMenu({ user }: { user: any }) {
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:border-primary transition-colors"
      >
        <User className="w-4 h-4 text-primary" />
        <span className="text-sm text-foreground truncate max-w-[200px]">{user.email}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-3 text-foreground hover:bg-border transition-colors text-left"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
