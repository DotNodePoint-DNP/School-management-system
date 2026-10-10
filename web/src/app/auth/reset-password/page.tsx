import { ResetPassword } from "@/modules/auth/components/ResetPassword";

export const metadata = {
  title: "Choose a new password | Pathivara Vidhya Mandir",
  description: "Create a new secure school portal password.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; token?: string }>;
}) {
  const { role, token } = await searchParams;
  return <ResetPassword role={role} token={token} />;
}
