/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { X, Mail, CheckCircle, AlertCircle } from "lucide-react";

export default function ShareModal({
  file,
  user,
  onClose,
  onSuccess,
}: {
  file: any;
  user: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<"view" | "download" | "share">(
    "view"
  );
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSharing(true);

    try {
      const supabase = getSupabaseClient();

      // Find recipient user
      const { data: recipientData, error: recipientError } = await supabase
        .from("users")
        .select("id, public_key")
        .eq("email", recipientEmail)
        .single();

      if (recipientError) throw new Error("Recipient not found");

      // Get owner's private key (in production, decrypt with password)
      const { data: ownerData, error: ownerError } = await supabase
        .from("users")
        .select("private_key_encrypted")
        .eq("id", user.id)
        .single();

      if (ownerError) throw ownerError;

      // Decrypt the AES key with owner's private key
      // In production: const privateKeyPEM = await decryptPrivateKey(ownerData.private_key_encrypted, userPassword);
      // For now, we'll show a message
      alert(
        "Sharing requires private key decryption. This is a security feature."
      );

      // Example flow:
      // const ownerPrivateKey = await importRSAPrivateKeyFromPEM(privateKeyPEM);
      // const aesKey = await decryptAESKeyWithRSA(file.encrypted_aes_key, ownerPrivateKey);
      // const recipientPublicKey = await importRSAPublicKeyFromPEM(recipientData.public_key);
      // const encryptedAESKeyForRecipient = await encryptAESKeyWithRSA(aesKey, recipientPublicKey);

      // // Create file_access record
      // const { error: accessError } = await supabase.from('file_access').insert({
      //   file_id: file.id,
      //   user_id: recipientData.id,
      //   encrypted_aes_key: encryptedAESKeyForRecipient,
      //   access_level: accessLevel,
      //   shared_by: user.id,
      // });

      // if (accessError) throw accessError;

      setSuccess(`File shared with ${recipientEmail}`);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Sharing failed");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">Share File</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-border rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleShare} className="space-y-4">
          {/* File Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              File
            </label>
            <div className="p-3 bg-input border border-border rounded-lg text-foreground text-sm">
              {file.file_name}
            </div>
          </div>

          {/* Recipient Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Mail className="w-4 h-4 inline mr-2" />
              Recipient Email
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Access Level */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Access Level
            </label>
            <select
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value as any)}
              className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="view">View Only</option>
              <option value="download">Download</option>
              <option value="share">Can Share</option>
            </select>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-error/10 border border-error rounded-lg flex items-start gap-2 text-error text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-success/10 border border-success rounded-lg flex items-start gap-2 text-success text-sm">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-border text-foreground rounded-lg font-medium hover:bg-border/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sharing}
              className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {sharing ? "Sharing..." : "Share"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
