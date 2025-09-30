"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { getSupabaseClient } from "./supabase";

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  privateKeyDecrypted: CryptoKey | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [privateKeyDecrypted, setPrivateKeyDecrypted] =
    useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (authUser) {
          setUser({
            id: authUser.id,
            email: authUser.email || "",
          });
          // The password is only used to decrypt the private key, never sent to the server
          const password = sessionStorage.getItem(`pw_${authUser.id}`);
          if (password) {
            // Try to decrypt the private key
            const { data: userData } = await supabase
              .from("users")
              .select("private_key_encrypted")
              .eq("id", authUser.id)
              .single();

            if (userData?.private_key_encrypted) {
              try {
                const decrypted = await decryptPrivateKeyFromEncrypted(
                  userData.private_key_encrypted,
                  password
                );
                setPrivateKeyDecrypted(decrypted);
              } catch (err) {
                console.error("[v0] Failed to decrypt private key:", err);
              }
            }
          }
        }
      } catch (err) {
        console.error("[v0] Auth init error:", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const logout = async () => {
    const supabase = getSupabaseClient();
    const authUser = user;
    if (authUser) {
      sessionStorage.removeItem(`pw_${authUser.id}`);
    }
    setUser(null);
    setPrivateKeyDecrypted(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, privateKeyDecrypted, loading, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// Helper function to decrypt private key from encrypted storage
async function decryptPrivateKeyFromEncrypted(
  encryptedPrivateKeyString: string,
  password: string
): Promise<CryptoKey> {
  const { importRSAPrivateKeyFromPEM } = await import("./crypto");

  // Parse the encrypted data
  const { iv, data } = JSON.parse(atob(encryptedPrivateKeyString));

  // Derive key from password
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(password);
  const keyHash = await crypto.subtle.digest("SHA-256", keyMaterial);
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

  // Decrypt
  const decryptedData = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(data)
  );

  // Convert back to PEM and import as RSA key
  const privateKeyPEM = new TextDecoder().decode(decryptedData);
  return await importRSAPrivateKeyFromPEM(privateKeyPEM);
}
