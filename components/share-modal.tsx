/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  encryptAESKeyWithRSA,
  importRSAPublicKeyFromPEM,
  decryptAESKeyWithRSA,
} from "@/lib/crypto";
import { X, Mail, Trash2, Download, Share2 } from "lucide-react";

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
  const [accessLevel, setAccessLevel] = useState<"downloader" | "collaborator">(
    "downloader"
  );
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [peopleWithAccess, setPeopleWithAccess] = useState<any[]>([]);
  const [accessUsers, setAccessUsers] = useState<Map<string, string>>(
    new Map()
  );
  const [loadingAccess, setLoadingAccess] = useState(true);
  const { privateKeyDecrypted } = useAuth();

  useEffect(() => {
    loadAccessList();
  }, [file.id]);

  const loadAccessList = async () => {
    try {
      setLoadingAccess(true);
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("file_access")
        .select(
          `
          id,
          user_id,
          access_level,
          shared_by,
          users!user_id(email)
        `
        )
        .eq("file_id", file.id);

      if (error) throw error;

      // Map user IDs to access levels
      const accessMap = new Map<string, string>();
      const people: any[] = [];

      // Add owner first
      const { data: ownerData, error: ownerError } = await supabase
        .from("users")
        .select("email")
        .eq("id", file.owner_id)
        .maybeSingle();

      if (ownerError && ownerError.code !== "PGRST116") throw ownerError;

      if (ownerData) {
        people.push({
          id: file.owner_id,
          email: ownerData.email,
          role: "Owner",
          isOwner: true,
        });
        accessMap.set(file.owner_id, "Owner");
      }

      // Add shared users
      data?.forEach((access: any) => {
        if (access.users) {
          people.push({
            id: access.user_id,
            email: access.users.email,
            role: access.access_level,
            accessId: access.id,
            isOwner: false,
          });
          accessMap.set(access.user_id, access.access_level);
        }
      });

      setPeopleWithAccess(people);
      setAccessUsers(accessMap);
    } catch (err) {
      console.error("Error loading access list:", err);
    } finally {
      setLoadingAccess(false);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSharing(true);

    try {
      const supabase = getSupabaseClient();

      console.log("[v0] Starting share process for file:", file.id);

      const { data: recipientData, error: recipientError } = await supabase
        .from("users")
        .select("id, public_key")
        .eq("email", recipientEmail)
        .single();

      if (recipientError) {
        throw new Error(`Recipient "${recipientEmail}" not found`);
      }

      if (!recipientData || !recipientData.public_key) {
        throw new Error("Recipient public key not found");
      }

      console.log("[v0] Found recipient:", recipientData.id);

      // Check if already shared
      const { data: existingAccess, error: existingError } = await supabase
        .from("file_access")
        .select("id, access_level")
        .eq("file_id", file.id)
        .eq("user_id", recipientData.id)
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") {
        throw new Error(
          "Error checking existing access: " + existingError.message
        );
      }

      if (existingAccess) {
        throw new Error(
          `File is already shared with ${recipientEmail} (${existingAccess.access_level})`
        );
      }

      console.log("[v0] Using decrypted private key from auth context");

      if (!privateKeyDecrypted) {
        throw new Error(
          "Your private key is not available. Please unlock your key or sign in again."
        );
      }

      const encryptedAESKey = file.encrypted_aes_key;
      if (!encryptedAESKey) {
        throw new Error(
          "File AES key not found. This file may not be properly encrypted."
        );
      }

      console.log("[v0] Decrypting AES key with private key");

      const aesKey = await decryptAESKeyWithRSA(
        encryptedAESKey,
        privateKeyDecrypted
      );

      console.log("[v0] Encrypting AES key for recipient");

      const recipientPublicKeyPEM = recipientData.public_key;
      const recipientPublicKey = await importRSAPublicKeyFromPEM(
        recipientPublicKeyPEM
      );
      const encryptedAESKeyForRecipient = await encryptAESKeyWithRSA(
        aesKey,
        recipientPublicKey
      );

      console.log("[v0] Inserting file_access record");

      const { error: accessError } = await supabase.from("file_access").insert({
        file_id: file.id,
        user_id: recipientData.id,
        encrypted_aes_key: encryptedAESKeyForRecipient,
        access_level: accessLevel,
        shared_by: user.id,
      });

      if (accessError) {
        console.error("[v0] Access error:", accessError);
        throw new Error(`Sharing failed: ${accessError.message}`);
      }

      console.log("[v0] Inserting audit log");

      const { error: auditError } = await supabase.from("audit_log").insert({
        user_id: user.id,
        action: "share",
        file_id: file.id,
        target_user_id: recipientData.id,
      });

      if (auditError) {
        console.error("[v0] Audit log error:", auditError);
      }

      setSuccess(`File shared with ${recipientEmail} as ${accessLevel}`);
      setRecipientEmail("");
      setAccessLevel("downloader");
      await loadAccessList();

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      console.error("[v0] Share error:", err);
      setError(
        err.message || "Sharing failed. Please check the console for details."
      );
    } finally {
      setSharing(false);
    }
  };

  const handleAccessLevelChange = async (userId: string, newLevel: string) => {
    try {
      const supabase = getSupabaseClient();

      const { data: accessRecord } = await supabase
        .from("file_access")
        .select("id")
        .eq("file_id", file.id)
        .eq("user_id", userId)
        .single();

      if (!accessRecord) throw new Error("Access record not found");

      const { error } = await supabase
        .from("file_access")
        .update({ access_level: newLevel })
        .eq("id", accessRecord.id);

      if (error) throw error;

      await loadAccessList();
    } catch (err: any) {
      setError(err.message || "Failed to update access level");
    }
  };

  const handleRemoveAccess = async (userId: string) => {
    if (!confirm("Remove access for this user?")) return;

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from("file_access")
        .delete()
        .eq("file_id", file.id)
        .eq("user_id", userId);

      if (error) throw error;

      await supabase.from("audit_log").insert({
        user_id: user.id,
        action: "revoke_access",
        file_id: file.id,
        target_user_id: userId,
      });

      await loadAccessList();
    } catch (err: any) {
      setError(err.message || "Failed to remove access");
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role.toLowerCase()) {
      case "downloader":
        return <Download className="w-4 h-4" />;
      case "collaborator":
        return <Share2 className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">Share File</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-border rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* File Name */}
        <div className="mb-6 p-3 bg-input border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">File</p>
          <p className="font-medium text-foreground text-sm break-all">
            {file.file_name}
          </p>
        </div>

        {/* Share Form */}
        <form
          onSubmit={handleShare}
          className="space-y-4 mb-6 pb-6 border-b border-border"
        >
          {/* Recipient Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Mail className="w-4 h-4 inline mr-2" />
              Add People
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="email@example.com"
                className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as any)}
                className="px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="downloader">Downloader</option>
                <option value="collaborator">Collaborator</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-500 text-sm flex items-start gap-2">
              <span className="mt-0.5">✓</span>
              <span>{success}</span>
            </div>
          )}

          {/* Share Button */}
          <button
            type="submit"
            disabled={sharing}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {sharing ? "Sharing..." : "Share"}
          </button>
        </form>

        {/* People with Access */}
        <div>
          <h4 className="text-sm font-bold text-foreground mb-3">
            People with access
          </h4>

          {loadingAccess ? (
            <div className="text-center py-4">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
          ) : peopleWithAccess.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one yet</p>
          ) : (
            <div className="space-y-2">
              {peopleWithAccess.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between p-3 bg-input rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {person.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {person.role}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {person.isOwner ? (
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                        Owner
                      </span>
                    ) : file.owner_id === user.id ? (
                      <>
                        <select
                          value={person.role}
                          onChange={(e) =>
                            handleAccessLevelChange(person.id, e.target.value)
                          }
                          className="text-xs px-2 py-1 bg-input border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="downloader">Downloader</option>
                          <option value="collaborator">Collaborator</option>
                        </select>
                        <button
                          onClick={() => handleRemoveAccess(person.id)}
                          className="p-1 hover:bg-red-500/10 rounded transition-colors text-muted-foreground hover:text-red-500"
                          title="Remove access"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : person.role.toLowerCase() === "collaborator" &&
                      user.id !== file.owner_id ? (
                      <>
                        <span className="text-xs px-2 py-1 bg-muted/50 text-muted-foreground rounded cursor-default">
                          {person.role}
                        </span>
                        {!person.isOwner && (
                          <button
                            onClick={() => handleRemoveAccess(person.id)}
                            className="p-1 hover:bg-red-500/10 rounded transition-colors text-muted-foreground hover:text-red-500"
                            title="Remove access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-muted/50 text-muted-foreground rounded cursor-default">
                        {person.role}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
