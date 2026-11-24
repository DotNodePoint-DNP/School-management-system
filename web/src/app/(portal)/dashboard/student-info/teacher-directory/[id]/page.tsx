import { StaffDirectory } from "@/modules/staff/StaffPage";
export default async function TeacherDetail({params}:{params:Promise<{id:string}>}) {
  return <StaffDirectory teachingOnly initialId={(await params).id}/>;
}
