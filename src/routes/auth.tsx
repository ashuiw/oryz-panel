import { OryzMark } from "@/components/brand/oryz-mark";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Server } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const searchSchema = z.object({
  redirect: z.string().startsWith("/").optional().catch(undefined),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  ssr: false,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: search.redirect ?? "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — Oryz Panel" },
      {
        name: "description",
        content: "Sign in to Oryz to deploy, monitor and manage your game servers.",
      },
      { property: "og:title", content: "Sign in — Oryz Panel" },
      {
        property: "og:description",
        content: "Sign in to Oryz to deploy, monitor and manage your game servers.",
      },
    ],
  }),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const destination = search.redirect ?? "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        void navigate({ to: destination, replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [destination, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }

    setPending(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: {
            emailRedirectTo: `${window.location.origin}${destination}`,
            data: { display_name: displayName.trim() || parsed.data.email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setEmailSent(true);
          toast.success("Check your inbox to confirm your account");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    setPending(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setPending(false);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: destination, replace: true });
  }

  async function handleReset() {
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      toast.error("Enter your email address first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(60rem_40rem_at_50%_-10%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <OryzMark className="size-12 rounded-xl" />

          <div>
            <h1 className="text-xl font-semibold tracking-tight">Oryz Panel</h1>
            <p className="text-sm text-muted-foreground">Game server management, modernised.</p>
          </div>
        </div>

        <div className="panel rounded-xl p-6">
          <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value={mode} className="mt-5">
              {emailSent ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm font-medium">Confirm your email</p>
                  <p className="text-sm text-muted-foreground">
                    We sent a confirmation link to {email}. Open it to activate your account.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => setEmailSent(false)}>
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {mode === "signup" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="displayName">Display name</Label>
                      <Input
                        id="displayName"
                        value={displayName}
                        maxLength={64}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Ada Lovelace"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={255}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={() => void handleReset()}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={pending}>
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>

          {!emailSent && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() => void handleGoogle()}
              >
                <GoogleMark />
                Continue with Google
              </Button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline-offset-2 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 3.9l-.1.2 3.7 2.8.3.1c2.3-2.2 3.5-5.3 3.5-8.9Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5l-.2.1-3.8 2.9-.1.2A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4a7.4 7.4 0 0 1 0-4.7l-.1-.2-3.9-3-.1.1a12 12 0 0 0 0 10.8l4.1-3Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c2.2 0 3.7.9 4.6 1.7l3.3-3.2C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.2 6.6l4.1 3.1C6.2 6.8 8.9 4.7 12 4.7Z"
      />
    </svg>
  );
}
