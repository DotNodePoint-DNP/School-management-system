// app/(dashboard)/student-info/students/[id]/page.tsx
import { DASHBOARD_HREF } from "@/modules/dashboard/components/Navigation";
import { getStudent } from "@/modules/students/student";
import { StudentProfile } from "@/modules/students/student-profile/StudentProfile";
    
import Link from "next/link";
import { notFound } from "next/navigation";


export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  return (
    <>
      <Link href={`${DASHBOARD_HREF}/student-info/parent-directory`} className="mb-4 inline-block text-sm text-muted hover:text-ink">← All parents</Link>
      <StudentProfile s={student} />
    </>
  );
}