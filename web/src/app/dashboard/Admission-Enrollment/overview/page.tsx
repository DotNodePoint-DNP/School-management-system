"use client"
import React, { useState, useMemo, ChangeEvent } from 'react';
import {
  Users,
  UserCheck,
  CreditCard,
  FileText,
  Search,
  Plus,
  X,
  Eye,
  CheckCircle2,
  AlertCircle,
  Download,
  Filter,
  UserPlus,
} from 'lucide-react';

import { StudentRecord, EnrollmentStage, ClassCapacity, AdminActivityLog } from './types';
import { STUDENT_RECORDS, CLASS_CAPACITIES, INITIAL_ADMIN_LOGS } from './mockData';

export const SchoolAdminAdmissionDashboard: React.FC = () => {
  const [records, setRecords] = useState<StudentRecord[]>(STUDENT_RECORDS);
  const [capacities, setCapacities] = useState<ClassCapacity[]>(CLASS_CAPACITIES);
  const [logs, setLogs] = useState<AdminActivityLog[]>(INITIAL_ADMIN_LOGS);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('All');
  const [selectedStage, setSelectedStage] = useState<string>('All');
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);

  // Form State for Direct Intake Registration
  const [formData, setFormData] = useState({
    fullName: '',
    grade: 'Grade 1',
    gender: 'Male' as 'Male' | 'Female' | 'Other',
    dob: '',
    guardianName: '',
    contactNumber: '',
    entranceScore: '',
    stage: 'Document Audit' as EnrollmentStage,
  });

  // Calculate Operational Metrics
  const metrics = useMemo(() => {
    const totalRegistrations = records.length;
    const confirmedEnrolled = records.filter((r) => r.stage === 'Enrolled / Admitted').length;
    const pendingFees = records.filter((r) => !r.feePaid && r.stage !== 'Enrolled / Admitted').length;
    
    const totalCapacity = capacities.reduce((sum, c) => sum + c.totalQuota, 0);
    const totalEnrolled = capacities.reduce((sum, c) => sum + c.enrolledCount, 0);
    const totalReserved = capacities.reduce((sum, c) => sum + c.reservedSeats, 0);

    return {
      totalRegistrations,
      confirmedEnrolled,
      pendingFees,
      availableSeats: totalCapacity - totalEnrolled - totalReserved,
      overallOccupancyPct: Math.round(((totalEnrolled + totalReserved) / totalCapacity) * 100),
    };
  }, [records, capacities]);

  // Search & Filter Pipeline
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const matchesSearch =
        rec.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.admissionNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.guardianName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesGrade = selectedGrade === 'All' || rec.grade === selectedGrade;
      const matchesStage = selectedStage === 'All' || rec.stage === selectedStage;

      return matchesSearch && matchesGrade && matchesStage;
    });
  }, [records, searchQuery, selectedGrade, selectedStage]);

  // Direct Admin Status Override
  const handleStageChange = (id: string, newStage: EnrollmentStage) => {
    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === id) {
          const isEnrolled = newStage === 'Enrolled / Admitted';
          return {
            ...rec,
            stage: newStage,
            feePaid: isEnrolled ? true : rec.feePaid,
          };
        }
        return rec;
      })
    );

    const updated = records.find((r) => r.id === id);
    if (updated) {
      setLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
          adminUser: 'Admin Staff',
          actionTaken: `Advanced ${updated.fullName} (${updated.admissionNo}) to stage: "${newStage}"`,
          level: newStage === 'Enrolled / Admitted' ? 'success' : 'info',
        },
        ...prev,
      ]);
    }
  };

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord: StudentRecord = {
      id: `rec-${Date.now()}`,
      admissionNo: `ADM-2026-00${records.length + 1}`,
      fullName: formData.fullName,
      grade: formData.grade,
      registrationDate: new Date().toISOString().split('T')[0],
      gender: formData.gender,
      dob: formData.dob,
      stage: formData.stage,
      documents: {
        birthCertificate: true,
        academicTranscript: false,
        transferCertificate: false,
        citizenshipCopy: true,
      },
      feePaid: false,
      entranceScore: formData.entranceScore ? parseFloat(formData.entranceScore) : undefined,
      contactNumber: formData.contactNumber,
      guardianName: formData.guardianName,
    };

    setRecords((prev) => [newRecord, ...prev]);
    setIsRegisterModalOpen(false);
    setFormData({
      fullName: '',
      grade: 'Grade 1',
      gender: 'Male',
      dob: '',
      guardianName: '',
      contactNumber: '',
      entranceScore: '',
      stage: 'Document Audit',
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-800">
      {/* Top Admin Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Desk Enrollment & Quota Management</h1>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-200">Admin Staff View</span>
          </div>
          <p className="text-xs font-medium text-slate-500">Session 2026–2027 • Direct Intake, Document Clearance & Quotas</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" /> Export Ledger
          </button>
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-700"
          >
            <UserPlus className="h-4 w-4" /> Direct Desk Intake
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Inquiries / Intake</span>
            <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><Users className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{metrics.totalRegistrations}</span>
            <span className="text-xs font-semibold text-indigo-600">Active Pipeline</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Fully Enrolled</span>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><UserCheck className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{metrics.confirmedEnrolled}</span>
            <span className="text-xs font-semibold text-emerald-600">ID & Desk Clearance Done</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Fee Ledger Due</span>
            <span className="rounded-lg bg-amber-50 p-2 text-amber-600"><CreditCard className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{metrics.pendingFees}</span>
            <span className="text-xs font-semibold text-amber-600">Awaiting Deposit</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Open Quota Seats</span>
            <span className="rounded-lg bg-blue-50 p-2 text-blue-600"><FileText className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{metrics.availableSeats}</span>
            <span className="text-xs font-semibold text-slate-500">{metrics.overallOccupancyPct}% Capacity Taken</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Class Capacity Monitor */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-sm font-bold text-slate-900">Grade Seat Quotas & Reserves</h2>
          <div className="space-y-4">
            {capacities.map((cap) => {
              const occupied = cap.enrolledCount + cap.reservedSeats;
              const fillPct = Math.round((occupied / cap.totalQuota) * 100);
              return (
                <div key={cap.grade} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800">{cap.grade}</span>
                    <span className="text-slate-500">{cap.enrolledCount} Confirmed + {cap.reservedSeats} Reserved</span>
                  </div>
                  <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200">
                    <div
                      className={`h-2.5 rounded-full ${fillPct >= 90 ? 'bg-rose-500' : 'bg-indigo-600'}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-500">
                    <span>{cap.totalQuota - occupied} Seats Available</span>
                    <span>Quota: {cap.totalQuota}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Student Records & Desk Workflow */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-sm font-bold text-slate-900">Student Intake & Direct Ledger Search</h2>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student, ADM #..."
                  value={searchQuery}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="w-44 rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <select
                value={selectedStage}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedStage(e.target.value)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="All">All Stages</option>
                <option value="Inquiry / Intake">Inquiry / Intake</option>
                <option value="Entrance Scheduled">Entrance Scheduled</option>
                <option value="Document Audit">Document Audit</option>
                <option value="Fee Pending">Fee Pending</option>
                <option value="Enrolled / Admitted">Enrolled / Admitted</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Admission #</th>
                  <th className="px-3 py-2.5">Student & Guardian</th>
                  <th className="px-3 py-2.5">Grade</th>
                  <th className="px-3 py-2.5">Workflow Stage</th>
                  <th className="px-3 py-2.5">Fee Status</th>
                  <th className="px-3 py-2.5 text-right">Admin Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold text-indigo-600">{rec.admissionNo}</td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900">{rec.fullName}</div>
                      <div className="text-[10px] text-slate-500">Guardian: {rec.guardianName} ({rec.contactNumber})</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{rec.grade}</td>
                    <td className="px-3 py-3">
                      <select
                        value={rec.stage}
                        onChange={(e) => handleStageChange(rec.id, e.target.value as EnrollmentStage)}
                        className="rounded border border-slate-200 bg-white py-1 px-1.5 text-[11px] font-semibold text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="Inquiry / Intake">Inquiry / Intake</option>
                        <option value="Entrance Scheduled">Entrance Scheduled</option>
                        <option value="Document Audit">Document Audit</option>
                        <option value="Fee Pending">Fee Pending</option>
                        <option value="Enrolled / Admitted">Enrolled / Admitted</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {rec.feePaid ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Cleared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                          <AlertCircle className="h-3.5 w-3.5" /> Pending Deposit
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => setSelectedStudent(rec)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                        title="Audit Documents & Info"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Admin Quick Audit Drawer */}
      {selectedStudent && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-white p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">Desk Document & Fee Clearance</h3>
              <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-indigo-600">{selectedStudent.admissionNo}</span>
                <h4 className="text-sm font-bold text-slate-900">{selectedStudent.fullName}</h4>
                <p className="mt-1 text-slate-600">Grade: <span className="font-semibold text-slate-800">{selectedStudent.grade}</span></p>
                <p className="text-slate-600">Entrance Test Score: <span className="font-semibold text-slate-800">{selectedStudent.entranceScore ?? 'N/A'}</span></p>
              </div>

              <div>
                <h5 className="font-bold text-slate-800 mb-2">Required Verification Documents</h5>
                <div className="space-y-1.5">
                  {Object.entries(selectedStudent.documents).map(([docKey, isAudited]) => (
                    <div key={docKey} className="flex items-center justify-between rounded border border-slate-200 p-2">
                      <span className="capitalize font-medium text-slate-700">{docKey.replace(/([A-Z])/g, ' $1')}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isAudited ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {isAudited ? 'Verified' : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    handleStageChange(selectedStudent.id, 'Enrolled / Admitted');
                    setSelectedStudent(null);
                  }}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 font-bold text-white shadow hover:bg-emerald-700"
                >
                  Finalize Enrollment & Issue Desk ID
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct Desk Intake Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">Direct Admin Intake / Desk Registration</h3>
              <button onClick={() => setIsRegisterModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRecord} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Student Full Name</label>
                <input
                  required
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full rounded-md border border-slate-300 p-2 focus:border-indigo-500 focus:outline-none"
                  placeholder="e.g. Suman Pokharel"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Grade</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full rounded-md border border-slate-300 p-2 focus:border-indigo-500 focus:outline-none"
                  >
                    {capacities.map((c) => (
                      <option key={c.grade} value={c.grade}>{c.grade}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date of Birth</label>
                  <input
                    required
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full rounded-md border border-slate-300 p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Guardian Name</label>
                  <input
                    required
                    type="text"
                    value={formData.guardianName}
                    onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                    className="w-full rounded-md border border-slate-300 p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    required
                    type="text"
                    value={formData.contactNumber}
                    onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                    className="w-full rounded-md border border-slate-300 p-2 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolAdminAdmissionDashboard;