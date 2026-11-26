import { requireDashboardPage } from "@/core/session/server";
import PayrollWorkspace from "@/modules/payroll/PayrollWorkspace";
export default async function Page({searchParams}:{searchParams:Promise<{staffId?:string}>}) {
  const {staffId}=await searchParams;
  const user = await requireDashboardPage("/dashboard/staff/payroll");
  return (
    <PayrollWorkspace
      initialId={staffId}
      userId={user.id}
      unlock={user.permissions.includes("payroll:unlock")}
      manage={user.permissions.includes("payroll:manage")}
      pay={user.permissions.includes("payroll:record-payment")}
    />
  );
}
