export type EnrollmentStage = 
  | 'Inquiry / Intake'
  | 'Entrance Scheduled'
  | 'Document Audit'
  | 'Fee Pending'
  | 'Enrolled / Admitted';

export interface DocumentAudit {
  birthCertificate: boolean;
  academicTranscript: boolean;
  transferCertificate: boolean;
  citizenshipCopy: boolean;
}

export interface StudentRecord {
  id: string;
  admissionNo: string;
  fullName: string;
  grade: string;
  registrationDate: string;
  gender: 'Male' | 'Female' | 'Other';
  dob: string;
  stage: EnrollmentStage;
  documents: DocumentAudit;
  feePaid: boolean;
  entranceScore?: number;
  contactNumber: string;
  guardianName: string;
}

export interface ClassCapacity {
  grade: string;
  totalQuota: number;
  enrolledCount: number;
  reservedSeats: number;
}

export interface AdminActivityLog {
  id: string;
  timestamp: string;
  adminUser: string;
  actionTaken: string;
  level: 'info' | 'success' | 'warning';
}