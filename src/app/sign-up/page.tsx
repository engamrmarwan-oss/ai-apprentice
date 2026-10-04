import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Create account · Tiro" };

export default function SignUpPage() {
  return (
    <AuthShell
      alternateAction="Sign in"
      alternateHref="/sign-in"
      alternatePrompt="Already have an account?"
      description="Use your name, your work email and a password. If an expert invited you, use the email they invited."
      title="Create your account"
    >
      <AuthForm kind="sign-up" />
    </AuthShell>
  );
}
