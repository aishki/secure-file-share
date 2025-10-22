/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { Download, Share2, Trash2, Lock, AlertCircle } from "lucide-react";
import "@/lib/crypto";
import { useAuth } from "@/lib/auth-context";

export default function FileCard({
  file,
  onShare,
  onDelete,
  canShare = true,
  accessLevel,
}: {
  file: any;
  onShare: () => void;
  onDelete?: () => void;
  canShare?: boolean;
  accessLevel?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { privateKeyDecrypted } = useAuth();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { decryptAESKeyWithRSA } = await import("@/lib/crypto");
      const supabase = getSupabaseClient();

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("encrypted-files")
        .download(file.storage_path);

      if (downloadError) throw downloadError;

      if (!privateKeyDecrypted) {
        throw new Error("Private key not available. Please sign in again.");
      }

      const encryptedAESKey = file.encrypted_aes_key;
      if (!encryptedAESKey) {
        throw new Error("File key not found");
      }

      console.log("[v0] Decrypting AES key with private key");
      const aesKey = await decryptAESKeyWithRSA(
        encryptedAESKey,
        privateKeyDecrypted
      );

      const { decryptFile } = await import("@/lib/crypto");
      const iv = new Uint8Array(
        atob(file.iv)
          .split("")
          .map((c) => c.charCodeAt(0))
      );
      const decrypted = await decryptFile(
        await fileData.arrayBuffer(),
        aesKey,
        iv
      );

      const blob = new Blob([decrypted]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("[v0] Download error:", err);
      alert("Download failed: " + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const index = Math.max(0, Math.min(i, sizes.length - 1));
    return (
      Math.round((bytes / Math.pow(k, index)) * 100) / 100 + " " + sizes[index]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getRoleDescription = (role?: string) => {
    switch (role?.toLowerCase()) {
      case "downloader":
        return "Downloader";
      case "collaborator":
        return "Collaborator";
      default:
        return null;
    }
  };

  const canDownloadFile = accessLevel
    ? ["downloader", "collaborator"].includes(accessLevel.toLowerCase())
    : true;
  const canShareFile = !accessLevel || accessLevel === "collaborator";

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <h4 className="font-medium text-foreground truncate">
                {file.file_name}
              </h4>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{formatFileSize(file.file_size)}</span>
              <span>{formatDate(file.created_at)}</span>
              {accessLevel && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded capitalize">
                  {getRoleDescription(accessLevel)}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4 relative">
            {canDownloadFile && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="p-2 hover:bg-border rounded-lg transition-colors disabled:opacity-50"
                title="Download"
              >
                <Download className="w-4 h-4 text-gray-400" />
              </button>
            )}

            {canShare && canShareFile && (
              <button
                onClick={onShare}
                className="p-2 hover:bg-border rounded-lg transition-colors"
                title="Share"
              >
                <Share2 className="w-4 h-4 text-gray-400" />
              </button>
            )}

            {onDelete && (
              <div>
                <button
                  onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                  className="p-2 hover:bg-error/10 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-error" />
                </button>
                {showDeleteConfirm && (
                  <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-lg shadow-lg p-3 z-10 whitespace-nowrap">
                    <p className="text-sm text-foreground mb-2">Delete file?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onDelete();
                          setShowDeleteConfirm(false);
                        }}
                        className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1 bg-border text-foreground rounded text-xs hover:bg-border/80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!canDownloadFile && accessLevel && (
              <div
                className="p-2 text-muted-foreground hover:text-foreground cursor-help"
                title={`No download access to this file`}
              >
                <AlertCircle className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
