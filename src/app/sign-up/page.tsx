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
      description="Create an account with an invite code, or use the email an expert invited to a workflow."
      title="Create your account"
    >
      <AuthForm kind="sign-up" />
    </AuthShell>
  );
}
