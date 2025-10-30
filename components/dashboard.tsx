"use client"

import { useState, useEffect } from "react"
import { getSupabaseClient } from "@/lib/supabase"
import UploadForm from "./upload-form"
import FileList from "./file-list"
import UserMenu from "./user-menu"
import { Upload, FileText } from "lucide-react"

export default function Dashboard({ user }: { user: any }) {
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const supabase = getSupabaseClient()
        const { data, error } = await supabase
          .from("files")
          .select("*")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })

        if (error) throw error
        setFiles(data || [])
      } catch (err) {
        console.error("Error loading files:", err)
      } finally {
        setLoading(false)
      }
    }

    loadFiles()
  }, [user.id, refreshTrigger])

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">SecureShare</h1>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <UploadForm user={user} onUploadSuccess={handleUploadSuccess} />
          </div>

          {/* Files Section */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-foreground mb-2">Your Files</h2>
              <p className="text-muted-foreground text-sm">
                {files.length} file{files.length !== 1 ? "s" : ""} encrypted and stored securely
              </p>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading files...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-12 text-center">
                <Upload className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No files yet. Upload your first file to get started.</p>
              </div>
            ) : (
              <FileList files={files} user={user} onRefresh={handleUploadSuccess} />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
