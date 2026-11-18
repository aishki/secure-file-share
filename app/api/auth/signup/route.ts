import {
  getAdminClient,
  isHex64,
  isPasswordWrappedKey,
  isRecoveryWrappedKey,
  isValidPublicKeyPEM,
  json,
  readJsonBody,
  safeEqual,
  str,
} from "@/lib/server/auth-admin";
import {
  MIN_PASSWORD_LENGTH,
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/lib/username";

// Creates an account. Keys are generated in the browser; the server only
// checks their shape and stores them, all before the account becomes usable,
// so there is never a half-created user without keys.
export async function POST(req: Request) {
  const expectedInvite = process.env.SIGNUP_INVITE_CODE;
  if (!expectedInvite) {
    return json({ error: "Sign-up is disabled on this server." }, 403);
  }

  const body = await readJsonBody(req);
  if (!body) return json({ error: "Invalid request." }, 400);

  const inviteCode = str(body.inviteCode, 256);
  if (!inviteCode || !safeEqual(inviteCode, expectedInvite)) {
    return json({ error: "Invalid invite code." }, 403);
  }

  const username = normalizeUsername(str(body.username, 64) ?? "");
  const password = str(body.password, 1024);
  const publicKey = str(body.publicKey);
  const privateKeyEncrypted = str(body.privateKeyEncrypted);
  const recoveryKeyEncrypted = str(body.recoveryKeyEncrypted);
  const recoveryVerifier = str(body.recoveryVerifier, 64);

  if (!isValidUsername(username)) {
    return json({ error: "Invalid username." }, 400);
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      400
    );
  }
  if (
    !(await isValidPublicKeyPEM(publicKey)) ||
    !isPasswordWrappedKey(privateKeyEncrypted) ||
    !isRecoveryWrappedKey(recoveryKeyEncrypted) ||
    !isHex64(recoveryVerifier)
  ) {
    return json({ error: "Invalid key material." }, 400);
  }

  const admin = getAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (lookupError) {
    console.error("signup: username lookup failed", lookupError);
    return json({ error: "Sign-up failed. Please try again." }, 500);
  }
  if (existing) return json({ error: "That username is taken." }, 409);

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: usernameToAuthEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username },
    });
  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (/already|exists|registered/i.test(msg)) {
      return json({ error: "That username is taken." }, 409);
    }
    if (/password/i.test(msg)) return json({ error: msg }, 400);
    console.error("signup: createUser failed", createError);
    return json({ error: "Sign-up failed. Please try again." }, 500);
  }

  const { error: keyError } = await admin
    .from("users")
    .update({
      public_key: publicKey,
      private_key_encrypted: privateKeyEncrypted,
      recovery_key_encrypted: recoveryKeyEncrypted,
      recovery_verifier: recoveryVerifier,
    })
    .eq("id", created.user.id);

  if (keyError) {
    console.error("signup: storing keys failed", keyError);
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Sign-up failed. Please try again." }, 500);
  }

  return json({ ok: true }, 201);
}
