import { StudentRecord, ClassCapacity, AdminActivityLog } from './types';

export const CLASS_CAPACITIES: ClassCapacity[] = [
  { grade: 'Grade 1', totalQuota: 40, enrolledCount: 32, reservedSeats: 4 },
  { grade: 'Grade 2', totalQuota: 40, enrolledCount: 38, reservedSeats: 2 },
  { grade: 'Grade 5', totalQuota: 30, enrolledCount: 22, reservedSeats: 3 },
  { grade: 'Grade 11 (Science)', totalQuota: 60, enrolledCount: 52, reservedSeats: 5 },
  { grade: 'Grade 11 (Management)', totalQuota: 80, enrolledCount: 75, reservedSeats: 3 },
];

export const STUDENT_RECORDS: StudentRecord[] = [
  {
    id: 'rec-001',
    admissionNo: 'ADM-2026-001',
    fullName: 'Aarav Sharma',
    grade: 'Grade 11 (Science)',
    registrationDate: '2026-09-15',
    gender: 'Male',
    dob: '2010-04-12',
    stage: 'Fee Pending',
    documents: {
      birthCertificate: true,
      academicTranscript: true,
      transferCertificate: false,
      citizenshipCopy: true,
    },
    feePaid: false,
    entranceScore: 84.5,
    contactNumber: '+977 9841234567',
    guardianName: 'Ramesh Sharma',
  },
  {
    id: 'rec-002',
    admissionNo: 'ADM-2026-002',
    fullName: 'Priya Adhikari',
    grade: 'Grade 1',
    registrationDate: '2026-09-18',
    gender: 'Female',
    dob: '2020-08-21',
    stage: 'Enrolled / Admitted',
    documents: {
      birthCertificate: true,
      academicTranscript: true,
      transferCertificate: true,
      citizenshipCopy: true,
    },
    feePaid: true,
    entranceScore: 92.0,
    contactNumber: '+977 9801122334',
    guardianName: 'Hari Adhikari',
  },
  {
    id: 'rec-003',
    admissionNo: 'ADM-2026-003',
    fullName: 'Rohan Rai',
    grade: 'Grade 11 (Management)',
    registrationDate: '2026-09-22',
    gender: 'Male',
    dob: '2009-11-05',
    stage: 'Document Audit',
    documents: {
      birthCertificate: true,
      academicTranscript: false,
      transferCertificate: false,
      citizenshipCopy: true,
    },
    feePaid: false,
    entranceScore: 68.0,
    contactNumber: '+977 9851098765',
    guardianName: 'Bikram Rai',
  },
];

export const INITIAL_ADMIN_LOGS: AdminActivityLog[] = [
  {
    id: 'log-1',
    timestamp: '2026-09-30 14:20',
    adminUser: 'Account Officer (Sunil)',
    actionTaken: 'Confirmed admission fee receipt for Priya Adhikari (ADM-2026-002)',
    level: 'success',
  },
  {
    id: 'log-2',
    timestamp: '2026-09-30 11:05',
    adminUser: 'Registrar Desk',
    actionTaken: 'Flagged missing Transfer Certificate for Aarav Sharma',
    level: 'warning',
  },
];