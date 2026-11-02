import { redirect } from "next/navigation";

export default function StaffIndexPage() {
  redirect("/dashboard/staff/directory");
}