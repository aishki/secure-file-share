"use client";

import { useState } from "react";
import { Copy, Download, KeyRound, Check } from "lucide-react";

// Shows a recovery code once. The parent decides what "Continue" does
// (e.g. save it to the account, or sign in after signup).
export default function RecoveryCodeDisplay({
  code,
  username,
  onContinue,
  continueLabel = "Continue",
  busy = false,
}: {
  code: string;
  username: string;
  onContinue: () => void;
  continueLabel?: string;
  busy?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the code is still on screen */
    }
  };

  const download = () => {
    const text = [
      "SecureShare recovery code",
      "",
      `Username: ${username}`,
      `Recovery code: ${code}`,
      "",
      "Use this on the sign-in page under \"Forgot password?\".",
      "It is the only way to reset your password without losing your files.",
      "Each code works once; you get a new one after using it.",
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `secureshare-recovery-${username}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">
          Save your recovery code
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        If you forget your password, this code is the only way back into your
        files. Nobody, including the admin, can recover them without it. It
        will not be shown again.
      </p>

      <div className="p-4 bg-input border border-border rounded-lg text-center">
        <code className="font-mono text-base sm:text-lg tracking-wider text-foreground break-all select-all">
          {code}
        </code>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 border border-border rounded-lg text-sm text-foreground hover:border-primary transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={download}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 border border-border rounded-lg text-sm text-foreground hover:border-primary transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1"
        />
        I have stored this code somewhere safe (e.g. a password manager).
      </label>

      <button
        type="button"
        onClick={onContinue}
        disabled={!saved || busy}
        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {busy ? "Please wait..." : continueLabel}
      </button>
    </div>
  );
}
