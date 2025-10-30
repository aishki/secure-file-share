export interface User {
  id: string
  email: string
  full_name: string | null
  public_key: string
  created_at: string
}

export interface FileMetadata {
  id: string
  owner_id: string
  file_name: string
  file_size: number
  file_type: string
  storage_path: string
  encrypted_aes_key: string
  iv: string
  checksum: string | null
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface FileAccess {
  id: string
  file_id: string
  user_id: string
  encrypted_aes_key: string
  access_level: "view" | "download" | "share"
  shared_by: string
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: "upload" | "download" | "share" | "delete"
  file_id: string | null
  target_user_id: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface EncryptedFile {
  data: ArrayBuffer
  iv: Uint8Array
  aesKey: CryptoKey
}
