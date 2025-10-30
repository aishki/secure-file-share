/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { generateRSAKeyPair, exportRSAPublicKeyToPEM } from "@/lib/crypto";
import { Lock, Mail, Key, AlertCircle, CheckCircle } from "lucide-react";

function formatErrorMessage(error: any): string {
  const message = error?.message || error?.toString() || "Unknown error";

  // Handle specific Supabase errors
  if (message.includes("duplicate key")) {
    return "This email is already registered. Please sign in instead.";
  }
  if (message.includes("Invalid login credentials")) {
    return "Invalid email or password. Please try again.";
  }
  if (message.includes("Password should be at least 6 characters")) {
    return "Password must be at least 6 characters long.";
  }
  if (message.includes("violates foreign key constraint")) {
    return "Account creation failed. Please try again or contact support.";
  }
  if (message.includes("violates row-level security policy")) {
    return "Permission denied. Please try again or contact support.";
  }
  if (message.includes("Network")) {
    return "Network error. Please check your connection and try again.";
  }
  if (message.includes("PGRST")) {
    return "Server error. Please try again later.";
  }

  return message;
}

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(""); // Added success message state

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const supabase = getSupabaseClient();

      if (isSignUp) {
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }

        // Generate RSA key pair for new user
        const keyPair = await generateRSAKeyPair();
        const publicKeyPEM = await exportRSAPublicKeyToPEM(keyPair.publicKey);

        const redirectUrl =
          process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL ||
          `${window.location.origin}/auth/callback`;

        // Sign up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          try {
            // Wait a moment for the trigger to create the user record
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const { error: updateError } = await supabase
              .from("users")
              .update({ public_key: publicKeyPEM })
              .eq("id", data.user.id);

            if (updateError) {
              console.error(
                "[v0] Error updating user public key:",
                updateError
              );
              throw updateError;
            }

            setSuccess(
              "Sign up successful! Please check your email to confirm your account."
            );
            setEmail("");
            setPassword("");
          } catch (err: any) {
            console.error("[v0] Error in post-signup:", err);
            // Don't throw here - the user was created, just the public key update failed
            setSuccess(
              "Account created! Please check your email to confirm. You may need to refresh after confirming."
            );
          }
        }
      } else {
        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        setSuccess("Sign in successful! Redirecting...");
      }
    } catch (err: any) {
      console.error("[v0] Auth error:", err);
      const formattedError = formatErrorMessage(err);
      setError(formattedError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Lock className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">SecureShare</h1>
          </div>
          <p className="text-muted-foreground">
            End-to-end encrypted file sharing
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-lg p-8 shadow-lg">
          <form onSubmit={handleAuth} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Key className="w-4 h-4 inline mr-2" />
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
                disabled={loading}
              />
              {isSignUp && (
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum 6 characters
                </p>
              )}
            </div>

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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError("");
                  setSuccess("");
                }}
                className="text-primary hover:underline font-medium"
                disabled={loading}
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        </div>

        {/* Info */}
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
