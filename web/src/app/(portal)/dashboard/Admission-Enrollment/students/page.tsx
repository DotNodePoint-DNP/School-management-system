import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import StudentsWorkspace from "@/modules/admissions/StudentsWorkspace";

export default async function StudentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some((permission) =>
      ["students:read", "students:read-all"].includes(permission),
    )
  ) {
    notFound();
  }

  return <StudentsWorkspace permissions={user.permissions} />;
}
