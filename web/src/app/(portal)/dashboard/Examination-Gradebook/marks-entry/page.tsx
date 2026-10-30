import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import MarksEntryWorkspace from "@/modules/examination-gradebook/MarksEntryWorkspace";

export default async function MarksEntryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (
    !user.permissions.some((permission) =>
      ["marks:read", "marks:read-all", "marks:enter", "marks:enter-any"].includes(permission),
    )
  ) notFound();

  return (
    <MarksEntryWorkspace
      canCorrect={user.permissions.includes("marks:correct")}
      canReopen={user.permissions.includes("marks:reopen")}
    />
  );
}
