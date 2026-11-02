import { createApiClient } from "@/lib/api/client";

export type StudentGender = "MALE" | "FEMALE" | "OTHER";
export type StudentStatus = "ACTIVE" | "GRADUATED" | "TRANSFERRED" | "WITHDRAWN";
export type GuardianRelationship =
  | "FATHER"
  | "MOTHER"
  | "GRANDPARENT"
  | "SIBLING"
  | "UNCLE"
  | "AUNT"
  | "LEGAL_GUARDIAN"
  | "OTHER";

export interface GuardianInput {
  firstName: string;
  middleName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  occupation?: string;
  address?: string;
  relationship: GuardianRelationship;
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  createLogin: boolean;
  phoneConfirmed?: boolean;
}

export interface StudentPlacementInput {
  academicYearId?: string;
  sectionId: string;
  rollNo?: number;
}

export interface CreateStudentInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  fullNameNp?: string;
  gender: StudentGender;
  dateOfBirth: string;
  admissionDate?: string;
  address?: string;
  confirmNotDuplicate?: boolean;
  guardians: GuardianInput[];
  placement?: StudentPlacementInput;
}

export interface StudentEnrollment {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  rollNo: number | null;
  status: string;
}

export interface StudentListItem {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullNameNp: string | null;
  gender: StudentGender;
  status: StudentStatus;
  enrollment: StudentEnrollment | null;
}

export interface StudentDetail extends StudentListItem {
  dateOfBirth: string;
  dateOfBirthBs: string | null;
  admissionDate: string;
  admissionDateBs: string | null;
  address: string | null;
  statusChangedOn: string | null;
  statusNote: string | null;
  guardians: {
    guardianId: string;
    name: string;
    relationship: GuardianRelationship;
    isPrimary: boolean;
    isEmergencyContact: boolean;
    phone: string | null;
    email: string | null;
    hasLogin: boolean;
  }[];
}

export interface LoginOutcome {
  guardianId: string;
  status: string;
  message?: string;
}

export interface CreateStudentResponse {
  student: StudentDetail;
  logins: LoginOutcome[];
}

export interface PaginatedStudents {
  items: StudentListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListStudentsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: StudentStatus;
  gender?: StudentGender;
  classId?: string;
  sectionId?: string;
  sortBy?: "name" | "admissionNo" | "admissionDate";
  sortOrder?: "asc" | "desc";
}

export interface UpdateStudentInput {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullNameNp?: string;
  gender?: StudentGender;
  dateOfBirth?: string;
  address?: string;
}

export interface StudentGuardianLinkInput {
  guardianId: string;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  isEmergencyContact?: boolean;
}

export interface ChangeStudentStatusInput {
  status: "WITHDRAWN" | "TRANSFERRED" | "GRADUATED";
  effectiveOn?: string;
  reason: string;
}

export interface StudentStatusResult {
  id: string;
  status: StudentStatus;
  statusChangedOn: string | null;
  enrollmentsClosed: number;
}

function queryString(query: ListStudentsQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

export async function createStudent(
  input: CreateStudentInput,
): Promise<CreateStudentResponse> {
  return createApiClient().post<CreateStudentResponse>("/students", input);
}

export async function listStudents(
  query: ListStudentsQuery = {},
): Promise<PaginatedStudents> {
  return createApiClient().getPaginated<StudentListItem>(
    `/students${queryString(query)}`,
  );
}

const studentPath = (studentId: string) =>
  `/students/${encodeURIComponent(studentId)}`;

export async function getStudent(studentId: string): Promise<StudentDetail> {
  return createApiClient().get<StudentDetail>(studentPath(studentId));
}

export async function updateStudent(
  studentId: string,
  input: UpdateStudentInput,
): Promise<StudentDetail> {
  return createApiClient().patch<StudentDetail>(studentPath(studentId), input);
}

export async function replaceStudentGuardians(
  studentId: string,
  guardians: StudentGuardianLinkInput[],
): Promise<StudentDetail> {
  return createApiClient().put<StudentDetail>(
    `${studentPath(studentId)}/guardians`,
    { guardians },
  );
}

export async function changeStudentStatus(
  studentId: string,
  input: ChangeStudentStatusInput,
): Promise<StudentStatusResult> {
  return createApiClient().post<StudentStatusResult>(
    `${studentPath(studentId)}/status`,
    input,
  );
}

export async function reactivateStudent(
  studentId: string,
): Promise<StudentStatusResult> {
  return createApiClient().post<StudentStatusResult>(
    `${studentPath(studentId)}/reactivate`,
    {},
  );
}

export async function deleteStudent(
  studentId: string,
): Promise<{ deleted: true }> {
  return createApiClient().delete<{ deleted: true }>(studentPath(studentId));
}
