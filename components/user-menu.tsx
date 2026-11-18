/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/username";
import { KeyRound, LogOut, User } from "lucide-react";

export default function UserMenu({
  user,
  onNewRecoveryCode,
}: {
  user: any;
  onNewRecoveryCode: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { logout } = useAuth();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:border-primary transition-colors"
      >
        <User className="w-4 h-4 text-primary" />
        <span className="text-sm text-foreground truncate max-w-[200px]">
          {displayName(user)}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-50">
          <button
            onClick={() => {
              setOpen(false);
              onNewRecoveryCode();
            }}
            className="w-full flex items-center gap-2 px-4 py-3 text-foreground hover:bg-border transition-colors text-left"
          >
            <KeyRound className="w-4 h-4" />
            New recovery code
          </button>
          {/* logout() also forgets the cached password and unlocked key. */}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-4 py-3 text-foreground hover:bg-border transition-colors text-left"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
