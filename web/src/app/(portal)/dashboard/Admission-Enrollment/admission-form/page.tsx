import { AdmissionDashboardActions } from '@/modules/admissions/components/AdmissionDashboardActions'
import StudentAdmissionEngine from '@/modules/admissions/components/SchoolAdmissionFormPrint'
import React from 'react'

const Admission = () => {
  return (
    <div>
        {/* <AdmissionDashboardActions /> */}
        <StudentAdmissionEngine/>
    </div>
  )
}

export default Admission