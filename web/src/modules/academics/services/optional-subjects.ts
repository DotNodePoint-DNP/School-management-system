import { createApiClient } from "@/lib/api/client";

export interface EnrollmentChoices {
  enrollmentId: string;
  academicYearId: string;
  classId: string;
  status: string;
  compulsory: { subjectId: string; code: string; name: string }[];
  optional: {
    subjectId: string;
    code: string;
    name: string;
    chosen: boolean;
  }[];
}

export interface SubjectRoster {
  academicYearId: string;
  sectionId: string;
  subject: {
    subjectId: string;
    code: string;
    name: string;
    isCompulsory: boolean;
  };
  count: number;
  students: {
    enrollmentId: string;
    studentId: string;
    admissionNo: string;
    name: string;
    rollNo: number | null;
  }[];
}

const id = (value: string) => encodeURIComponent(value);

export async function getEnrollmentChoices(
  enrollmentId: string,
): Promise<EnrollmentChoices> {
  return createApiClient().get<EnrollmentChoices>(
    `/enrollments/${id(enrollmentId)}/optional-subjects`,
  );
}

export async function setEnrollmentChoices(
  enrollmentId: string,
  subjectIds: string[],
): Promise<EnrollmentChoices> {
  return createApiClient().put<EnrollmentChoices>(
    `/enrollments/${id(enrollmentId)}/optional-subjects`,
    { subjectIds },
  );
}

export async function getSubjectRoster(
  yearId: string,
  sectionId: string,
  subjectId: string,
): Promise<SubjectRoster> {
  return createApiClient().get<SubjectRoster>(
    `/academic-years/${id(yearId)}/sections/${id(sectionId)}/subjects/${id(subjectId)}/students`,
  );
}
