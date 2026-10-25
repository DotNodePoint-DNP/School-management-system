"use client";

import MarksEntryGrid from "@/modules/examination-gradebook/mark-entry/MarksEntryGrid"
import { classes, exams, loadStudents, onSubmit, subjects, teacher } from "@/modules/examination-gradebook/mark-entry/mockdata"

 
const MarkEntry = () => {
  return (
    <div>
        <MarksEntryGrid teacher={teacher} subjects={subjects} classes={classes}
              exams={exams} loadStudents={loadStudents} onSubmit={onSubmit}/>
    </div>
  )
}

export default MarkEntry