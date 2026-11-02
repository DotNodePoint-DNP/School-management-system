import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { findModule } from "@/modules/dashboard/components/Navigation";
import SubjectsWorkspace from "@/modules/academics/SubjectsWorkspace";

export default async function AcademicsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (!findModule(user.permissions, "academics")) notFound();
  return <SubjectsWorkspace permissions={user.permissions} />;
}
