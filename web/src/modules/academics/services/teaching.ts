import { createApiClient } from "@/lib/api/client";

export interface StaffSummary {
  id: string;
  staffNo: string;
  name: string;
}

export interface SectionTeaching {
  academicYearId: string;
  sectionId: string;
  classId: string;
  classTeacher: StaffSummary | null;
  subjects: {
    subjectId: string;
    code: string;
    name: string;
    isCompulsory: boolean;
    teacher: StaffSummary | null;
  }[];
}

export interface StaffAssignments {
  staffId: string;
  academicYear: { id: string; name: string } | null;
  classTeacherOf: {
    sectionId: string;
    sectionName: string;
    classId: string;
    className: string;
  }[];
  teaches: {
    sectionId: string;
    sectionName: string;
    classId: string;
    className: string;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
  }[];
}

const id = (value: string) => encodeURIComponent(value);

export async function getSectionTeaching(
  yearId: string,
  sectionId: string,
): Promise<SectionTeaching> {
  return createApiClient().get<SectionTeaching>(
    `/academic-years/${id(yearId)}/sections/${id(sectionId)}/teaching`,
  );
}

export async function assignClassTeacher(
  yearId: string,
  sectionId: string,
  staffId: string | null,
): Promise<SectionTeaching> {
  return createApiClient().put<SectionTeaching>(
    `/academic-years/${id(yearId)}/sections/${id(sectionId)}/class-teacher`,
    { staffId },
  );
}

export async function assignSubjectTeacher(
  yearId: string,
  sectionId: string,
  subjectId: string,
  staffId: string | null,
): Promise<SectionTeaching> {
  return createApiClient().put<SectionTeaching>(
    `/academic-years/${id(yearId)}/sections/${id(sectionId)}/subjects/${id(subjectId)}/teacher`,
    { staffId },
  );
}

export async function getStaffAssignments(
  staffId: string,
  academicYearId?: string,
): Promise<StaffAssignments> {
  const query = academicYearId
    ? `?academicYearId=${encodeURIComponent(academicYearId)}`
    : "";
  return createApiClient().get<StaffAssignments>(
    `/staff/${id(staffId)}/assignments${query}`,
  );
}

export async function getMyTeachingAssignments(): Promise<StaffAssignments> {
  return createApiClient().get<StaffAssignments>("/staff/me/assignments");
}
