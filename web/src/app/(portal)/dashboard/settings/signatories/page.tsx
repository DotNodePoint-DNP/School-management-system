import { requireDashboardPage } from "@/core/session/server";
import SignatoriesWorkspace from "@/modules/settings/components/SignatoriesWorkspace";

export default async function SignatoriesPage() {
  const user = await requireDashboardPage("/dashboard/settings/signatories");
  return <SignatoriesWorkspace permissions={user.permissions} />;
}
