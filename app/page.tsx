"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = getSupabaseClient();

        // Get the session from the URL
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
          // User is authenticated, redirect to dashboard
          router.push("/dashboard");
        } else {
          // No session, redirect to auth
          router.push("/");
        }
      } catch (error) {
        console.error("[v0] Auth callback error:", error);
        router.push("/");
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Confirming your email...</p>
      </div>
    </div>
  );
}
