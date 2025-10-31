/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";

import { useState, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  generateAESKey,
  encryptFile,
  encryptAESKeyWithRSA,
  calculateChecksum,
  importRSAPublicKeyFromPEM,
} from "@/lib/crypto";
import { Upload, AlertCircle, CheckCircle } from "lucide-react";

export default function UploadForm({
  user,
  onUploadSuccess,
}: {
  user: any;
  onUploadSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError("");
      setSuccess("");
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = getSupabaseClient();

      // Get user's public key
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("public_key")
        .eq("id", user.id)
        .single();

      if (userError) throw userError;

      // Read file
      const fileBuffer = await file.arrayBuffer();

      // Generate AES key
      const aesKey = await generateAESKey();

      // Encrypt file
      const { encrypted, iv } = await encryptFile(fileBuffer, aesKey);

      // Calculate checksum
      const checksum = await calculateChecksum(fileBuffer);

      // Encrypt AES key with user's RSA public key
      const rsaPublicKey = await importRSAPublicKeyFromPEM(userData.public_key);
      const encryptedAESKey = await encryptAESKeyWithRSA(aesKey, rsaPublicKey);

      // Upload encrypted file to storage
      const storagePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("encrypted-files")
        .upload(storagePath, new Blob([encrypted]), {
          contentType: "application/octet-stream",
        });

      if (uploadError) throw uploadError;

      // Store metadata
      const { error: metadataError } = await supabase.from("files").insert({
        owner_id: user.id,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: storagePath,
        encrypted_aes_key: encryptedAESKey,
        iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
        checksum,
      });

      if (metadataError) throw metadataError;

      setSuccess(`File "${file.name}" uploaded successfully!`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploadSuccess();
    } catch (err: any) {
      setError(err.message || "Upload failed");
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Upload File</h3>

      <form onSubmit={handleUpload} className="space-y-4">
        {/* File Input */}
        <div
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
          <p className="text-foreground font-medium">
            {file ? file.name : "Click to select file"}
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
              : "Any file type supported"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
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

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {uploading ? "Uploading..." : "Upload & Encrypt"}
        </button>
      </form>

      {/* Info */}
      <div className="mt-6 p-4 bg-card border border-border rounded-lg">
        <p className="text-xs text-muted-foreground">
          <strong>Security:</strong> Files are encrypted client-side with
          AES-256 before upload. Only you can decrypt them.
        </p>
      </div>
    </div>
  );
}
