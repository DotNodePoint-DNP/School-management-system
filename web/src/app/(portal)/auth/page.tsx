import { RoleLogin } from "@/modules/auth/components/RoleLogin";

export const metadata = {
  title: "Sign in | Pathivara vidhya mandir",
  description: "Sign in to the Pathivara vidhya mandir school portal.",
};

export default function AuthPage() {
  return <RoleLogin />;
}
