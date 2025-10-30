/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { Download, Share2, Trash2, Lock } from "lucide-react";

export default function FileCard({
  file,
  onShare,
  onDelete,
}: {
  file: any;
  onShare: () => void;
  onDelete: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const supabase = getSupabaseClient();

      // Get encrypted file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("encrypted-files")
        .download(file.storage_path);

      if (downloadError) throw downloadError;

      // Get user's private key (in production, this would be decrypted with password)
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("private_key_encrypted")
        .single();

      if (userError) throw userError;

      // For now, we'll show a message that decryption requires the private key
      // In production, you'd decrypt the private key with the user's password
      alert(
        "Download feature requires private key decryption setup. This is a security feature."
      );

      // Example of how it would work:
      // const privateKeyPEM = await decryptPrivateKey(userData.private_key_encrypted, userPassword);
      // const rsaPrivateKey = await importRSAPrivateKeyFromPEM(privateKeyPEM);
      // const aesKey = await decryptAESKeyWithRSA(file.encrypted_aes_key, rsaPrivateKey);
      // const iv = new Uint8Array(atob(file.iv).split('').map(c => c.charCodeAt(0)));
      // const decrypted = await decryptFile(await fileData.arrayBuffer(), aesKey, iv);
      // Download the decrypted file
    } catch (err: any) {
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

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-primary" />
            <h4 className="font-medium text-foreground truncate">
              {file.file_name}
            </h4>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{formatFileSize(file.file_size)}</span>
            <span>{formatDate(file.created_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-2 hover:bg-border rounded-lg transition-colors disabled:opacity-50"
            title="Download"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onShare}
            className="p-2 hover:bg-border rounded-lg transition-colors"
            title="Share"
          >
            <Share2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-error/10 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-error" />
          </button>
        </div>
      </div>
    </div>
  );
}
