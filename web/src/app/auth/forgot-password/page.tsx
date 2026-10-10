import { ForgotPassword } from "@/modules/auth/components/ForgotPassword";

export const metadata = {
  title: "Reset your password | Pathivara Vidhya Mandir",
  description: "Securely reset your Pathivara school portal password.",
};

export default async function AuthForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  return <ForgotPassword role={role} />;
}
