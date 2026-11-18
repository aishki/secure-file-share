// Server-only helpers for the auth API routes. Never import from a client
// component: this module reads the service-role key.
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function readJsonBody(
  req: Request,
  maxBytes = 64 * 1024
): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function str(v: unknown, max = 16 * 1024): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

// Compare secrets without leaking length or position via timing.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const HEX64 = /^[0-9a-f]{64}$/;

export function isHex64(v: string | null): v is string {
  return v !== null && HEX64.test(v);
}

// SHA-256(proof) compared with the stored verifier, in constant time.
export function proofMatchesVerifier(proofHex: string, verifierHex: string) {
  if (!HEX64.test(proofHex) || !HEX64.test(verifierHex)) return false;
  const digest = createHash("sha256")
    .update(Buffer.from(proofHex, "hex"))
    .digest();
  return timingSafeEqual(digest, Buffer.from(verifierHex, "hex"));
}

function decodeJsonBlob(blob: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(blob, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Shape checks only; the server cannot (and must not be able to) decrypt.
export function isPasswordWrappedKey(blob: string | null): blob is string {
  if (!blob) return false;
  const p = decodeJsonBlob(blob);
  return (
    !!p &&
    p.v === 2 &&
    p.kdf === "PBKDF2-SHA256" &&
    Number.isInteger(p.iter) &&
    (p.iter as number) >= 600_000 &&
    (p.iter as number) <= 10_000_000 &&
    typeof p.salt === "string" && B64.test(p.salt) &&
    typeof p.iv === "string" && B64.test(p.iv) &&
    typeof p.data === "string" && B64.test(p.data)
  );
}

export function isRecoveryWrappedKey(blob: string | null): blob is string {
  if (!blob) return false;
  const p = decodeJsonBlob(blob);
  return (
    !!p &&
    p.v === "recovery-1" &&
    typeof p.iv === "string" && B64.test(p.iv) &&
    typeof p.data === "string" && B64.test(p.data)
  );
}

// Must be a 4096-bit RSA-OAEP SPKI key, the only kind the app produces.
export async function isValidPublicKeyPEM(pem: string | null) {
  if (!pem) return false;
  const m = pem.match(
    /^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END PUBLIC KEY-----$/
  );
  if (!m) return false;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      Buffer.from(m[1].replace(/\n/g, ""), "base64"),
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );
    return (key.algorithm as RsaHashedKeyAlgorithm).modulusLength === 4096;
  } catch {
    return false;
  }
}
