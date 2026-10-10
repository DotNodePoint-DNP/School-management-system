import { RoleGateway } from "@/modules/auth/components/RoleGateway";

export const metadata = {
  title: "Choose your workspace | Pathivara vidhya mandir",
  description: "Select your Pathivara vidhya mandir workspace to sign in.",
};

export default function AuthPage() {
  return <RoleGateway />;
}
