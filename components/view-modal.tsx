/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function ViewModal({
  file,
  onClose,
}: {
  file: any;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trigger preview loading on mount
  useState(() => {
    loadPreview();
  });

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);

      // For different file types, show appropriate preview
      const fileType = file.file_type?.toLowerCase() || "";

      if (fileType.startsWith("image/")) {
        // For images, we'd need to decrypt and load
        // For now, show a message that the file is encrypted
        setPreview("image");
      } else if (fileType.includes("text") || fileType.includes("pdf")) {
        setPreview("document");
      } else if (fileType.includes("video")) {
        setPreview("video");
      } else if (fileType.includes("audio")) {
        setPreview("audio");
      } else {
        setPreview("file");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load preview");
    } finally {
      setLoading(false);
    }
  };

  const getPreviewContent = () => {
    const fileType = file.file_type?.toLowerCase() || "";

    if (fileType.startsWith("image/")) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            Image preview unavailable - file is encrypted
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Download the file to view the decrypted image
          </p>
        </div>
      );
    } else if (fileType.includes("text")) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            Text file - Preview requires decryption
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Download the file to view the decrypted content
          </p>
        </div>
      );
    } else if (fileType.includes("pdf")) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            PDF file - Preview requires decryption
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Download the file to view the decrypted PDF
          </p>
        </div>
      );
    } else {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            File Type: {file.file_type || "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            This is an encrypted file. Download it to view.
          </p>
          <div className="mt-4 p-3 bg-primary/10 rounded text-sm text-primary">
            All files are encrypted end-to-end and can only be viewed by
            downloading them locally.
          </div>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              {file.file_name}
            </h3>
            <p className="text-sm text-muted-foreground">{file.file_type}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-border rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Preview Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading preview...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
            {error}
          </div>
        ) : (
          <div className="bg-input rounded-lg p-8 min-h-[300px] flex items-center justify-center">
            {getPreviewContent()}
          </div>
        )}
      </div>
    </div>
  );
}
