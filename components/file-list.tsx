"use client"

import { useState } from "react"
import { getSupabaseClient } from "@/lib/supabase"
import FileCard from "./file-card"
import ShareModal from "./share-modal"

export default function FileList({
  files,
  user,
  onRefresh,
}: {
  files: any[]
  user: any
  onRefresh: () => void
}) {
  const [selectedFile, setSelectedFile] = useState<any>(null)
  const [showShareModal, setShowShareModal] = useState(false)

  const handleShare = (file: any) => {
    setSelectedFile(file)
    setShowShareModal(true)
  }

  const handleDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return

    try {
      const supabase = getSupabaseClient()

      // Get file metadata to find storage path
      const { data: fileData, error: fetchError } = await supabase
        .from("files")
        .select("storage_path")
        .eq("id", fileId)
        .single()

      if (fetchError) throw fetchError

      // Delete from storage
      const { error: storageError } = await supabase.storage.from("encrypted-files").remove([fileData.storage_path])

      if (storageError) throw storageError

      // Delete metadata
      const { error: deleteError } = await supabase.from("files").delete().eq("id", fileId)

      if (deleteError) throw deleteError

      onRefresh()
    } catch (err: any) {
      alert("Delete failed: " + err.message)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onShare={() => handleShare(file)}
            onDelete={() => handleDelete(file.id)}
          />
        ))}
      </div>

      {showShareModal && selectedFile && (
        <ShareModal
          file={selectedFile}
          user={user}
          onClose={() => setShowShareModal(false)}
          onSuccess={() => {
            setShowShareModal(false)
            onRefresh()
          }}
        />
      )}
    </>
  )
}
