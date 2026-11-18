import {
  getAdminClient,
  isHex64,
  isPasswordWrappedKey,
  isRecoveryWrappedKey,
  json,
  proofMatchesVerifier,
  readJsonBody,
  str,
} from "@/lib/server/auth-admin";
import {
  MIN_PASSWORD_LENGTH,
  isValidUsername,
  normalizeUsername,
} from "@/lib/username";

// Password recovery with a recovery code, in two steps:
//   begin:    prove knowledge of the code -> get the code-wrapped private key
//   complete: prove it again, set the new password, store the private key
//             re-wrapped under the new password and a fresh recovery code
//             (codes are single-use).
// The code itself never leaves the browser; only an HKDF-derived proof does.
const GENERIC = "Username or recovery code is incorrect.";

export async function POST(req: Request) {
  const body = await readJsonBody(req);
  if (!body) return json({ error: "Invalid request." }, 400);

  const step = body.step;
  const username = normalizeUsername(str(body.username, 64) ?? "");
  const proof = str(body.proof, 64);
  if ((step !== "begin" && step !== "complete") || !isValidUsername(username) || !isHex64(proof)) {
    return json({ error: GENERIC }, 400);
  }

  const admin = getAdminClient();
  const { data: user, error } = await admin
    .from("users")
    .select("id, recovery_key_encrypted, recovery_verifier")
    .eq("username", username)
    .maybeSingle();
  if (error) {
    console.error("recover: lookup failed", error);
    return json({ error: "Recovery failed. Please try again." }, 500);
  }
  // Same response for unknown user, no recovery set up, and wrong code.
  if (
    !user?.recovery_verifier ||
    !user.recovery_key_encrypted ||
    !proofMatchesVerifier(proof, user.recovery_verifier)
  ) {
    return json({ error: GENERIC }, 400);
  }

  if (step === "begin") {
    return json({ recoveryKeyEncrypted: user.recovery_key_encrypted });
  }

  const newPassword = str(body.newPassword, 1024);
  const privateKeyEncrypted = str(body.privateKeyEncrypted);
  const recoveryKeyEncrypted = str(body.recoveryKeyEncrypted);
  const recoveryVerifier = str(body.recoveryVerifier, 64);
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      400
    );
  }
  if (
    !isPasswordWrappedKey(privateKeyEncrypted) ||
    !isRecoveryWrappedKey(recoveryKeyEncrypted) ||
    !isHex64(recoveryVerifier)
  ) {
    return json({ error: "Invalid key material." }, 400);
  }

  // Password first. If the key update below then fails, the old recovery
  // code is still valid, so simply running recovery again repairs it.
  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (pwError) {
    if (/password/i.test(pwError.message)) {
      return json({ error: pwError.message }, 400);
    }
    console.error("recover: password update failed", pwError);
    return json({ error: "Recovery failed. Please try again." }, 500);
  }

  // Only replace the keys if the code was not rotated concurrently.
  const { data: updated, error: keyError } = await admin
    .from("users")
    .update({
      private_key_encrypted: privateKeyEncrypted,
      recovery_key_encrypted: recoveryKeyEncrypted,
      recovery_verifier: recoveryVerifier,
    })
    .eq("id", user.id)
    .eq("recovery_verifier", user.recovery_verifier)
    .select("id");
  if (keyError || !updated?.length) {
    console.error("recover: key update failed", keyError);
    return json(
      {
        error:
          "Your password was changed but your keys could not be updated. Run recovery again with the same recovery code.",
      },
      500
    );
  }

  return json({ ok: true });
}
