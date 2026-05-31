import { useState } from "react";
import { Link } from "wouter";
import { Zap, Lock } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const signupEnabled = import.meta.env.VITE_ALLOW_SIGNUP === "true";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsPending(true);
    const { error } = await authClient.signUp.email({ email, password, name });
    if (error) {
      setError(error.message ?? "Sign up failed");
      setIsPending(false);
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm px-4">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-base tracking-tight">Oncident</span>
        </div>

        <div className="rounded-xl bg-card border border-border/60 p-6 space-y-5">
          {!signupEnabled ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Lock className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Sign up is disabled</p>
                <p className="text-xs text-muted-foreground mt-1">This instance is invite-only.</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Create account</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Join Oncident</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-muted/50 border-border/60 rounded-lg text-sm"
                    placeholder="Your name"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-muted/50 border-border/60 rounded-lg text-sm"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-muted/50 border-border/60 rounded-lg text-sm"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <Button type="submit" disabled={isPending} className="w-full rounded-lg">
                  {isPending ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
