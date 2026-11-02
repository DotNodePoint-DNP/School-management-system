import { createApiClient } from "@/lib/api/client";

const id = (value: string) => encodeURIComponent(value);

export interface EnrollmentResponse {
  id: string;
  studentId: string;
  admissionNo: string;
  studentName: string;
  academicYearId: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  rollNo: number | null;
  status: string;
  statusChangedOn: string | null;
}

export interface SectionEnrollment {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  name: string;
  fullNameNp: string | null;
  rollNo: number | null;
  status: string;
}

export interface SectionOccupancy {
  sectionId: string;
  sectionName: string;
  classId: string;
  className: string;
  isActive: boolean;
  capacity: number | null;
  enrolled: number;
}

export async function enrollStudent(
  studentId: string,
  input: { academicYearId?: string; sectionId: string; rollNo?: number },
): Promise<EnrollmentResponse> {
  return createApiClient().post<EnrollmentResponse>(
    `/students/${id(studentId)}/enrollments`,
    input,
  );
}

export async function moveEnrollment(
  enrollmentId: string,
  input: { sectionId: string; rollNo?: number },
): Promise<EnrollmentResponse> {
  return createApiClient().patch<EnrollmentResponse>(
    `/enrollments/${id(enrollmentId)}/section`,
    input,
  );
}

export async function setEnrollmentRollNumber(
  enrollmentId: string,
  rollNo: number,
): Promise<EnrollmentResponse> {
  return createApiClient().patch<EnrollmentResponse>(
    `/enrollments/${id(enrollmentId)}/roll-number`,
    { rollNo },
  );
}

export async function deleteEnrollment(
  enrollmentId: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(
    `/enrollments/${id(enrollmentId)}`,
  );
}

export async function listSectionEnrollments(
  yearId: string,
  sectionId: string,
): Promise<SectionEnrollment[]> {
  return createApiClient().get<SectionEnrollment[]>(
    `/academic-years/${id(yearId)}/sections/${id(sectionId)}/enrollments`,
  );
}

export async function assignSectionRollNumbers(
  yearId: string,
  sectionId: string,
  order: string[],
): Promise<SectionEnrollment[]> {
  return createApiClient().put<SectionEnrollment[]>(
    `/academic-years/${id(yearId)}/sections/${id(sectionId)}/roll-numbers`,
    { order },
  );
}

export async function getSectionOccupancy(
  yearId: string,
): Promise<SectionOccupancy[]> {
  return createApiClient().get<SectionOccupancy[]>(
    `/academic-years/${id(yearId)}/occupancy`,
  );
}
