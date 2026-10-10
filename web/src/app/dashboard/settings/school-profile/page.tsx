import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/core/session/server";
import { PageHeader } from "@/modules/dashboard/components/PageHeader";
import { findModule, moduleHref } from "@/modules/dashboard/components/Navigation";
import SchoolProfileForm, { SchoolFormData } from "@/modules/settings/components/SchoolProfileForm";

export default async function SchoolProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const navModule = findModule(user.role, "settings");
  if (!navModule) notFound();

  // TODO: Fetch existing school profile from database
  const profile = {
    name: "Pathivara Vidhya Mandir",
    email: "info@pathivara.edu.np",
    phone: "023-540000",
    address: "Damak, Jhapa",
    abbreviation: "PVM",
    establishedDate: "2060-01-01",
    types: ["Private"],
  };

  // Server Action
  async function handleSave(data: SchoolFormData) {
    "use server";
    
    console.log("Saving school profile on server:", data);
    // TODO: Insert DB logic here (e.g., using Drizzle ORM / Prisma)
    // await db.update(schoolTable).set(data)...
  }

  return (
    <>
      <PageHeader
        title="School profile"
        description="Basic details shown on invoices, reports and parent communications."
        crumbs={[{ label: navModule.label, href: moduleHref(navModule) }]}
      />
      <main className="p-2   min-h-screen">
        <SchoolProfileForm initialData={profile} onSubmit={handleSave} />
      </main>
    </>
  );
}