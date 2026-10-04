import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign in · Tiro" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { confirmation } = await searchParams;
  return (
    <AuthShell
      alternateAction="Create an account"
      alternateHref="/sign-up"
      alternatePrompt="New to Tiro?"
      description="Use the email and password for your Tiro account."
      title="Sign in"
    >
      <AuthForm confirmation={typeof confirmation === "string" ? confirmation : undefined} kind="sign-in" />
    </AuthShell>
  );
}
