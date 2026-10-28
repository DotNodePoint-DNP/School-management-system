// app/(dashboard)/student-info/students/page.tsx

import { getStudents } from "@/modules/students/student";
import { StudentTable } from "@/modules/students/student-profile/StudentTable";


export default async function StudentsPage() {
  const students = await getStudents();
  return (
    <>
      <h1 className="text-xl font-semibold text-ink">All teachers</h1>
      <p className="mb-5 text-sm text-muted">Search, filter, and open a teacher profile.</p>
      <StudentTable students={students} />
    </>
  );
}