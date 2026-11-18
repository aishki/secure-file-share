"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { getSupabaseClient } from "./supabase";
import { unwrapPrivateKey, wrapPrivateKey } from "./crypto";

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
          // The password unlocks the private key locally. Note it is ALSO sent
          // to Supabase Auth at login, so the backend is trusted with it.
          const password = sessionStorage.getItem(`pw_${authUser.id}`);
          if (password) {
            // The column is not selectable directly; this RPC returns only
            // the caller's own wrapped key.
            const { data: wrappedKey } = await supabase.rpc(
              "get_my_private_key"
            );

            if (typeof wrappedKey === "string" && wrappedKey) {
              try {
                const { privateKey, privateKeyPEM, needsRewrap } =
                  await unwrapPrivateKey(wrappedKey, password);
                setPrivateKeyDecrypted(privateKey);

                // Migrate legacy (unsalted SHA-256) blobs to PBKDF2 in place.
                if (needsRewrap) {
                  const rewrapped = await wrapPrivateKey(
                    privateKeyPEM,
                    password
                  );
                  const { error: rewrapError } = await supabase
                    .from("users")
                    .update({ private_key_encrypted: rewrapped })
                    .eq("id", authUser.id);
                  if (rewrapError) {
                    console.error(
                      "[v0] Failed to upgrade private key encryption:",
                      rewrapError
                    );
                  }
                }
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
