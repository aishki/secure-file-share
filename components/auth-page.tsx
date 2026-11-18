/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  generateRSAKeyPair,
  exportRSAPublicKeyToPEM,
  exportRSAPrivateKeyToPEM,
  wrapPrivateKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
  createRecoveryBundle,
  recoveryProof,
  unwrapPrivateKeyWithRecovery,
} from "@/lib/crypto";
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_RULES,
  isValidUsername,
  loginIdentifierToEmail,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/lib/username";
import RecoveryCodeDisplay from "./recovery-code-display";
import {
  Lock,
  User,
  Key,
  KeyRound,
  Ticket,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

type Mode = "login" | "signup" | "recover";

function formatErrorMessage(error: any): string {
  const message = error?.message || error?.toString() || "Unknown error";
  if (message.includes("Invalid login credentials")) {
    return "Incorrect username or password.";
  }
  if (message.includes("Network") || message.includes("Failed to fetch")) {
    return "Network error. Please check your connection and try again.";
  }
  return message;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const inputClass =
  "w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // Set after signup or recovery: the code to show before signing in.
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setRecoveryCode("");
  };

  const signIn = async (email: string, pw: string) => {
    const supabase = getSupabaseClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword(
      { email, password: pw }
    );
    if (signInError) throw signInError;
    if (data.user) sessionStorage.setItem(`pw_${data.user.id}`, pw);
    window.location.href = "/";
  };

  const checkNewPassword = () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
    }
    if (password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }
  };

  const handleSignup = async () => {
    const name = normalizeUsername(username);
    if (!isValidUsername(name)) throw new Error(`Username: ${USERNAME_RULES}.`);
    checkNewPassword();

    setSuccess("Generating your encryption keys...");
    const keyPair = await generateRSAKeyPair();
    const publicKeyPEM = await exportRSAPublicKeyToPEM(keyPair.publicKey);
    const privateKeyPEM = await exportRSAPrivateKeyToPEM(keyPair.privateKey);
    const privateKeyEncrypted = await wrapPrivateKey(privateKeyPEM, password);
    const code = generateRecoveryCode();
    const recovery = await createRecoveryBundle(privateKeyPEM, code);

    setSuccess("Creating your account...");
    await postJson("/api/auth/signup", {
      inviteCode,
      username: name,
      password,
      publicKey: publicKeyPEM,
      privateKeyEncrypted,
      ...recovery,
    });

    setSuccess("");
    setUsername(name);
    setNewRecoveryCode(code);
  };

  const handleRecover = async () => {
    const name = normalizeUsername(username);
    const code = normalizeRecoveryCode(recoveryCode);
    if (!isValidUsername(name) || !code) {
      throw new Error("Username or recovery code is incorrect.");
    }
    checkNewPassword();

    const proof = await recoveryProof(code);
    const { recoveryKeyEncrypted } = await postJson("/api/auth/recover", {
      step: "begin",
      username: name,
      proof,
    });

    let privateKeyPEM: string;
    try {
      privateKeyPEM = await unwrapPrivateKeyWithRecovery(
        recoveryKeyEncrypted,
        code
      );
    } catch {
      throw new Error("Username or recovery code is incorrect.");
    }

    const privateKeyEncrypted = await wrapPrivateKey(privateKeyPEM, password);
    const nextCode = generateRecoveryCode();
    const recovery = await createRecoveryBundle(privateKeyPEM, nextCode);

    await postJson("/api/auth/recover", {
      step: "complete",
      username: name,
      proof,
      newPassword: password,
      privateKeyEncrypted,
      ...recovery,
    });

    setUsername(name);
    setNewRecoveryCode(nextCode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (mode === "signup") await handleSignup();
      else if (mode === "recover") await handleRecover();
      else await signIn(loginIdentifierToEmail(username), password);
    } catch (err: any) {
      console.error("[v0] Auth error:", err);
      setSuccess("");
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const continueAfterCode = async () => {
    setError("");
    setLoading(true);
    try {
      await signIn(usernameToAuthEmail(username), password);
    } catch (err: any) {
      setError(formatErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Lock className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">SecureShare</h1>
          </div>
          <p className="text-muted-foreground">
            End-to-end encrypted file sharing
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-8 shadow-lg">
          {newRecoveryCode ? (
            <>
              <RecoveryCodeDisplay
                code={newRecoveryCode}
                username={username}
                onContinue={continueAfterCode}
                continueLabel="Continue to SecureShare"
                busy={loading}
              />
              {error && (
                <p className="mt-4 text-error text-sm">{error}</p>
              )}
            </>
          ) : (
            <>
              {mode === "recover" && (
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-foreground">
                    Reset your password
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Enter the recovery code you saved when you created your
                    account. Your files stay readable.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <User className="w-4 h-4 inline mr-2" />
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="yourname"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={inputClass}
                    required
                    disabled={loading}
                  />
                  {mode === "signup" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {USERNAME_RULES}
                    </p>
                  )}
                </div>

                {mode === "recover" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      <KeyRound className="w-4 h-4 inline mr-2" />
                      Recovery code
                    </label>
                    <input
                      type="text"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                      required
                      disabled={loading}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <Key className="w-4 h-4 inline mr-2" />
                    {mode === "recover" ? "New password" : "Password"}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    className={inputClass}
                    required
                    disabled={loading}
                  />
                  {mode !== "login" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Minimum {MIN_PASSWORD_LENGTH} characters
                    </p>
                  )}
                </div>

                {mode !== "login" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      <Key className="w-4 h-4 inline mr-2" />
                      Confirm password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                      className={inputClass}
                      required
                      disabled={loading}
                    />
                  </div>
                )}

                {mode === "signup" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      <Ticket className="w-4 h-4 inline mr-2" />
                      Invite code
                    </label>
                    <input
                      type="password"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="From your team admin"
                      autoComplete="off"
                      className={inputClass}
                      required
                      disabled={loading}
                    />
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-error/10 border border-error rounded-lg flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
                    <p className="text-error text-sm">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-green-500/10 border border-green-500 rounded-lg flex gap-2 items-start">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-green-500 text-sm">{success}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading
                    ? "Please wait..."
                    : mode === "signup"
                    ? "Create account"
                    : mode === "recover"
                    ? "Reset password"
                    : "Log In"}
                </button>

                {mode === "login" && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => switchMode("recover")}
                      className="text-sm text-muted-foreground hover:text-primary hover:underline"
                      disabled={loading}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </form>

              <div className="mt-6 text-center">
                <p className="text-muted-foreground text-sm">
                  {mode === "login"
                    ? "Don't have an account?"
                    : mode === "signup"
                    ? "Already have an account?"
                    : "Remembered your password?"}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      switchMode(mode === "login" ? "signup" : "login")
                    }
                    className="text-primary hover:underline font-medium"
                    disabled={loading}
                  >
                    {mode === "login" ? "Sign Up" : "Log In"}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="text-center">
            <Lock className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">AES-256 Encryption</p>
          </div>
          <div className="text-center">
            <Key className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">RSA Key Exchange</p>
          </div>
          <div className="text-center">
            <Lock className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">End-to-End</p>
          </div>
        </div>
      </div>
    </div>
  );
}
