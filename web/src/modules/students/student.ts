import { DASHBOARD_HREF } from "../dashboard/components/Navigation";

// modules/student-info/lib/students.ts
export const demoStudent = {
  studentId: "NPL-2081-0412",
  symbolNumber: "81002345A",
  registrationNumber: "78104-58291",
  status: "ACTIVE",
  academicSession: "2081-2082",
  personalInformation: {
    firstName: "Aarav",
    middleName: "Raj",
    lastName: "Shrestha",
    gender: "MALE",
    dateOfBirthAD: "2010-05-18",
    dateOfBirthBS: "2067-02-04",
    bloodGroup: "B_POSITIVE",
    citizenshipNumber: null as string | null,
    nationalIdentityNumber: "9812-3819-2041",
    ethnicityCasteCategory: "Janajati",
    motherTongue: "Newari",
    profilePhotoUrl: "",
  },
  addressDetails: {
    permanentAddress: {
      province: "Bagmati Province",
      district: "Kathmandu",
      localBody: "Kathmandu Metropolitan City",
      wardNumber: 10,
      tole: "Baneshwor",
    },
    temporaryAddress: {
      province: "Bagmati Province",
      district: "Kathmandu",
      localBody: "Kathmandu Metropolitan City",
      wardNumber: 10,
      tole: "Baneshwor",
    },
  },
  guardianDetails: {
    father: {
      name: "Ramesh Shrestha",
      occupation: "Business",
      contactPhone: "9851012345",
      email: "ramesh.shrestha@example.com",
    },
    mother: {
      name: "Sita Shrestha",
      occupation: "Teacher",
      contactPhone: "9841098765",
      email: "sita.shrestha@example.com",
    },
    primaryContactForSms: "FATHER",
    smsNotificationPhone: "9851012345",
  },
  academicRecord: {
    class: "Class 10",
    section: "A",
    rollNumber: 12,
    classTeacher: { teacherId: "TCH-089", name: "Mr. Bikash Thapa" },
    subjects: [
      {
        subjectCode: "NEP-10",
        subjectName: "Compulsory Nepali",
        creditHours: 4,
      },
      {
        subjectCode: "ENG-10",
        subjectName: "Compulsory English",
        creditHours: 4,
      },
      {
        subjectCode: "MTH-10",
        subjectName: "Compulsory Mathematics",
        creditHours: 5,
      },
      {
        subjectCode: "SCI-10",
        subjectName: "Science & Technology",
        creditHours: 5,
      },
      {
        subjectCode: "OPT-MTH-10",
        subjectName: "Optional I: Optional Mathematics",
        creditHours: 4,
      },
      {
        subjectCode: "OPT-CS-10",
        subjectName: "Optional II: Computer Science",
        creditHours: 4,
      },
    ],
    termEvaluation: {
      examName: "First Terminal Examination 2081",
      gpaObtained: 3.72,
      grade: "A+",
      attendanceDays: "54 / 58",
    },
  },
  financialLedger: {
    currency: "NPR",
    totalMonthlyFee: 8500,
    busFee: 2000,
    scholarshipDiscountPercentage: 10,
    scholarshipType: "Merit Scholarship",
    dueBalanceNpr: 4500,
    paymentStatus: "PARTIALLY_PAID",
    allowedPaymentGateways: ["eSewa", "Khalti", "ConnectIPS", "Bank Transfer"],
    recentTransactions: [
      {
        receiptNo: "REC-2081-8912",
        dateBS: "2081-05-10",
        amountPaid: 12000,
        paymentMethod: "eSewa",
        transactionId: "ESEWA-98124012",
      },
    ],
  },
  schoolOperations: {
    transport: {
      usesSchoolBus: true,
      busRouteNo: "Route 4 (Koteshwor - Baneshwor - Maitighar)",
      pickupPoint: "Baneshwor Chowk",
      driverPhone: "9803011223",
    },
    library: { cardNo: "LIB-2081-12", issuedBooksCount: 1, fineAmountNpr: 0 },
  },
  auditInfo: {
    createdDateBS: "2081-01-12",
    lastUpdated: "2081-06-15T10:30:00Z",
  },
};

export type Student = typeof demoStudent;

// Swap these two for real API calls later (keep signatures).
export async function getStudents(): Promise<Student[]> {
  return [demoStudent];
}
export async function getStudent(id: string): Promise<Student | undefined> {
  return (await getStudents()).find((s) => s.studentId === id);
}

export const fullName = (s: Student) =>
  [
    s.personalInformation.firstName,
    s.personalInformation.middleName,
    s.personalInformation.lastName,
  ]
    .filter(Boolean)
    .join(" ");
export const pretty = (v: string) =>
  v
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
    .replace(/ Positive| Negative/, (m) => (m === " Positive" ? "+" : "−"));
export const npr = (n: number) => "NPR " + n.toLocaleString("en-IN");

// Change this one function if your route differs from sectionHref(...) output.
// export const studentHref = (id: string) => `/student-info/student-directory/${id}`;
export const directoryHref = `${DASHBOARD_HREF}/student-info/student-directory`;
export const studentHref = (id: string) => `${directoryHref}/${id}`;