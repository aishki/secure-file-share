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

// Calculate SHA-256 checksum
export async function calculateChecksum(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
