"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  createRecoveryBundle,
  exportRSAPrivateKeyToPEM,
  generateRecoveryCode,
} from "@/lib/crypto";
import RecoveryCodeDisplay from "./recovery-code-display";
import { AlertTriangle, X } from "lucide-react";

// Banner for accounts without a recovery code (created before this feature),
// plus the modal used both by the banner and by "New recovery code" in the
// user menu. A new code replaces the old one only after the user confirms
// they saved it.
export default function RecoverySetup({
  userId,
  username,
  open,
  onOpenChange,
}: {
  userId: string;
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { privateKeyDecrypted } = useAuth();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "has_recovery_setup"
      );
      if (!cancelled && !error) setMissing(data === false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <>
      {missing && privateKeyDecrypted && (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <p className="text-sm text-foreground flex-1">
            You have no recovery code. If you forget your password, your files
            cannot be recovered.
          </p>
          <button
            onClick={() => onOpenChange(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
          >
            Set up recovery
          </button>
        </div>
      )}

      {open && (
        <RecoveryModal
          userId={userId}
          username={username}
          replacing={!missing}
          privateKey={privateKeyDecrypted}
          onClose={() => onOpenChange(false)}
          onSaved={() => {
            setMissing(false);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

// Mounted only while open, so every opening gets a fresh, unsaved code.
function RecoveryModal({
  userId,
  username,
  replacing,
  privateKey,
  onClose,
  onSaved,
}: {
  userId: string;
  username: string;
  replacing: boolean;
  privateKey: CryptoKey | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code] = useState(generateRecoveryCode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (!privateKey) {
        throw new Error("Your key is locked. Sign out and sign in again.");
      }
      const pem = await exportRSAPrivateKeyToPEM(privateKey);
      const bundle = await createRecoveryBundle(pem, code);
      const { error: updateError } = await getSupabaseClient()
        .from("users")
        .update({
          recovery_key_encrypted: bundle.recoveryKeyEncrypted,
          recovery_verifier: bundle.recoveryVerifier,
        })
        .eq("id", userId);
      if (updateError) throw updateError;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the code.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-border rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
        {replacing && (
          <p className="mb-4 pr-8 text-sm text-muted-foreground">
            Saving this code replaces your current one, which will stop
            working.
          </p>
        )}
        <RecoveryCodeDisplay
          code={code}
          username={username}
          onContinue={save}
          continueLabel="Save recovery code"
          busy={saving}
        />
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
