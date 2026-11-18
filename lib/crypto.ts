// AES-GCM Encryption/Decryption
export async function generateAESKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

export async function encryptFile(
  fileData: ArrayBuffer,
  aesKey: CryptoKey
): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    fileData
  );
  return { encrypted, iv };
}

export async function decryptFile(
  encryptedData: ArrayBuffer,
  aesKey: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  return await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    encryptedData
  );
}

export async function exportAESKey(key: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey("jwk", key);
}

export async function importAESKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// RSA Key Generation
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

// Export RSA keys to PEM format
export async function exportRSAPublicKeyToPEM(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("spki", key);
  const exportedAsString = String.fromCharCode.apply(
    null,
    Array.from(new Uint8Array(exported))
  );
  const exportedAsBase64 = btoa(exportedAsString);
  return `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64
    .match(/.{1,64}/g)
    ?.join("\n")}\n-----END PUBLIC KEY-----`;
}

export async function exportRSAPrivateKeyToPEM(
  key: CryptoKey
): Promise<string> {
  const exported = await crypto.subtle.exportKey("pkcs8", key);
  const exportedAsString = String.fromCharCode.apply(
    null,
    Array.from(new Uint8Array(exported))
  );
  const exportedAsBase64 = btoa(exportedAsString);
  return `-----BEGIN PRIVATE KEY-----\n${exportedAsBase64
    .match(/.{1,64}/g)
    ?.join("\n")}\n-----END PRIVATE KEY-----`;
}

// Import RSA keys from PEM format
export async function importRSAPublicKeyFromPEM(
  pem: string
): Promise<CryptoKey> {
  const binaryString = atob(
    pem
      .replace(/-----BEGIN PUBLIC KEY-----\n?|\n?-----END PUBLIC KEY-----/g, "")
      .replace(/\n/g, "")
  );
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await crypto.subtle.importKey(
    "spki",
    bytes.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

export async function importRSAPrivateKeyFromPEM(
  pem: string
): Promise<CryptoKey> {
  const binaryString = atob(
    pem
      .replace(
        /-----BEGIN PRIVATE KEY-----\n?|\n?-----END PRIVATE KEY-----/g,
        ""
      )
      .replace(/\n/g, "")
  );
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

// Encrypt AES key with RSA public key
export async function encryptAESKeyWithRSA(
  aesKey: CryptoKey,
  rsaPublicKey: CryptoKey
): Promise<string> {
  const aesKeyJwk = await exportAESKey(aesKey);
  const aesKeyJson = JSON.stringify(aesKeyJwk);
  const aesKeyBytes = new TextEncoder().encode(aesKeyJson);

  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    aesKeyBytes
  );

  return btoa(
    String.fromCharCode.apply(null, Array.from(new Uint8Array(encrypted)))
  );
}

// Decrypt AES key with RSA private key
export async function decryptAESKeyWithRSA(
  encryptedAESKey: string,
  rsaPrivateKey: CryptoKey
): Promise<CryptoKey> {
  const encryptedBytes = new Uint8Array(
    atob(encryptedAESKey)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKey,
    encryptedBytes
  );

  const aesKeyJson = new TextDecoder().decode(decrypted);
  const aesKeyJwk = JSON.parse(aesKeyJson);

  return await importAESKey(aesKeyJwk);
}

// ---------------------------------------------------------------------------
// Password-based wrapping of the user's RSA private key
//
// v2 format (current): PBKDF2-HMAC-SHA256, per-user random 16-byte salt,
//   600k iterations (OWASP 2023 guidance), AES-256-GCM.
//   Stored as base64(JSON({ v: 2, kdf, iter, salt, iv, data })) with
//   base64-encoded salt/iv/data.
// v1 format (legacy): AES-GCM key = SHA-256(password), no salt, no stretching.
//   Stored as base64(JSON({ iv: number[], data: number[] })). Only ever read
//   so existing users can log in and be re-wrapped to v2.
// ---------------------------------------------------------------------------

export const PBKDF2_ITERATIONS = 600_000;
// Bounds on the iteration count read from storage: refuse weakened or
// absurdly expensive parameters supplied by whoever controls the database.
const PBKDF2_MIN_ITERATIONS = 600_000;
const PBKDF2_MAX_ITERATIONS = 10_000_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // never extractable
    ["encrypt", "decrypt"]
  );
}

async function deriveLegacyPasswordKey(password: string): Promise<CryptoKey> {
  const keyHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );
  return await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, [
    "decrypt",
  ]);
}

// Encrypt a PEM private key under a password (always produces v2).
export async function wrapPrivateKey(
  privateKeyPEM: string,
  password: string
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(privateKeyPEM)
  );
  return btoa(
    JSON.stringify({
      v: 2,
      kdf: "PBKDF2-SHA256",
      iter: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(ciphertext)),
    })
  );
}

// Decrypt a wrapped private key (v2 or legacy v1). `needsRewrap` is true when
// the stored blob uses the legacy format and should be replaced with
// `wrapPrivateKey(privateKeyPEM, password)`.
export async function unwrapPrivateKey(
  wrapped: string,
  password: string
): Promise<{
  privateKey: CryptoKey;
  privateKeyPEM: string;
  needsRewrap: boolean;
}> {
  const parsed = JSON.parse(atob(wrapped));

  let plaintext: ArrayBuffer;
  let needsRewrap: boolean;

  if (parsed.v === 2) {
    if (parsed.kdf !== "PBKDF2-SHA256") {
      throw new Error(`Unsupported key derivation: ${parsed.kdf}`);
    }
    const iter = parsed.iter;
    if (
      !Number.isInteger(iter) ||
      iter < PBKDF2_MIN_ITERATIONS ||
      iter > PBKDF2_MAX_ITERATIONS
    ) {
      throw new Error("Invalid key derivation parameters");
    }
    const key = await derivePasswordKey(
      password,
      base64ToBytes(parsed.salt),
      iter
    );
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(parsed.iv) },
      key,
      base64ToBytes(parsed.data)
    );
    needsRewrap = iter < PBKDF2_ITERATIONS;
  } else if (Array.isArray(parsed.iv) && Array.isArray(parsed.data)) {
    const key = await deriveLegacyPasswordKey(password);
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(parsed.iv) },
      key,
      new Uint8Array(parsed.data)
    );
    needsRewrap = true;
  } else {
    throw new Error("Unrecognized private key format");
  }

  const privateKeyPEM = new TextDecoder().decode(plaintext);
  const privateKey = await importRSAPrivateKeyFromPEM(privateKeyPEM);
  return { privateKey, privateKeyPEM, needsRewrap };
}

// ---------------------------------------------------------------------------
// Recovery codes
//
// A recovery code is 130 random bits shown to the user once, as 26 Crockford
// base32 characters (e.g. "7K3M-QX9P-..."). Two independent values are
// derived from it with HKDF-SHA256:
//   * a wrap key (AES-256-GCM) that encrypts a second copy of the private key;
//   * a proof that the client sends to the server to show it knows the code.
// The server stores SHA-256(proof) as the verifier. It never sees the code
// or the wrap key, so a leaked database cannot be used to unwrap the copy.
// The code is high-entropy, so no slow KDF is needed.
// ---------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_CODE_LENGTH = 26;
const RECOVERY_SALT = new TextEncoder().encode("secure-file-share/recovery/v1");

export function generateRecoveryCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_LENGTH));
  // 256 is a multiple of 32, so `% 32` is unbiased.
  const chars = Array.from(random, (b) => CROCKFORD[b % 32]).join("");
  return chars.match(/.{1,4}/g)!.join("-");
}

// Canonical form of a typed code, or null if it cannot be a valid code.
// Accepts any case, spaces and dashes, and the usual Crockford look-alikes.
export function normalizeRecoveryCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== RECOVERY_CODE_LENGTH) return null;
  for (const c of s) if (!CROCKFORD.includes(c)) return null;
  return s;
}

async function recoveryBaseKey(code: string): Promise<CryptoKey> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new Error("Invalid recovery code format");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalized),
    "HKDF",
    false,
    ["deriveKey", "deriveBits"]
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Proof of knowledge of the code, sent to the server during recovery.
export async function recoveryProof(code: string): Promise<string> {
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: RECOVERY_SALT,
      info: new TextEncoder().encode("auth"),
    },
    await recoveryBaseKey(code),
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function recoveryWrapKey(code: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: RECOVERY_SALT,
      info: new TextEncoder().encode("wrap"),
    },
    await recoveryBaseKey(code),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// What the server stores: the private key wrapped under the code, and
// SHA-256(proof) to check recovery attempts against.
export async function createRecoveryBundle(
  privateKeyPEM: string,
  code: string
): Promise<{ recoveryKeyEncrypted: string; recoveryVerifier: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await recoveryWrapKey(code),
    new TextEncoder().encode(privateKeyPEM)
  );
  const proof = await recoveryProof(code);
  const proofBytes = new Uint8Array(
    proof.match(/../g)!.map((h) => parseInt(h, 16))
  );
  const verifier = await crypto.subtle.digest("SHA-256", proofBytes);
  return {
    recoveryKeyEncrypted: btoa(
      JSON.stringify({
        v: "recovery-1",
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(ciphertext)),
      })
    ),
    recoveryVerifier: bytesToHex(new Uint8Array(verifier)),
  };
}

// Returns the private key PEM; throws if the code is wrong.
export async function unwrapPrivateKeyWithRecovery(
  recoveryKeyEncrypted: string,
  code: string
): Promise<string> {
  const parsed = JSON.parse(atob(recoveryKeyEncrypted));
  if (parsed.v !== "recovery-1") throw new Error("Unrecognized recovery format");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(parsed.iv) },
    await recoveryWrapKey(code),
    base64ToBytes(parsed.data)
  );
  const pem = new TextDecoder().decode(plaintext);
  await importRSAPrivateKeyFromPEM(pem); // sanity check
  return pem;
}

// Calculate SHA-256 checksum
export async function calculateChecksum(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
