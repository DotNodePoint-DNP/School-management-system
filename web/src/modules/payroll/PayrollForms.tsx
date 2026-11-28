"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { payroll, type Entry, type Method, type Staff } from "./service";
import { card, Label, field, button, primary, money, dateOnly, ErrorText, usePayrollKey, usePayrollAction } from "./shared";

async function recordOnce(key:string, details:object, save:(requestId:string)=>Promise<unknown>) {
  const signature=JSON.stringify(details);
  const previous=JSON.parse(sessionStorage.getItem(key) ?? "null");
  const requestId=previous?.signature===signature ? previous.requestId : crypto.randomUUID();
  sessionStorage.setItem(key,JSON.stringify({requestId,signature}));
  await save(requestId);
  sessionStorage.removeItem(key);
}
function StaffOptions({staff}:{staff:Staff[]}) {
  return <>{staff.map(s=><option key={s.id} value={s.id}>{s.staffNo} · {s.firstName} {s.lastName}</option>)}</>;
}
export function AdvanceLog({today,pay}:{today:string;pay:boolean}) {
  const key=usePayrollKey();
  const staff=useQuery({queryKey:[...key,"staff"],queryFn:payroll.staff});
  const log=useQuery({queryKey:[...key,"advances"],queryFn:payroll.advances});
  const [filter,setFilter]=useState("All");
  const action=usePayrollAction();
  return <section className={card}><h2 className="text-xl font-semibold">Salary advances</h2>
    {pay && <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const f=new FormData(form);
      const details={staffId:String(f.get("staff")),amountPaisa:Math.round(Number(f.get("amount"))*100),issuedOn:String(f.get("date")),note:String(f.get("note")).trim()};
      action.mutate(async()=>{await recordOnce("advance-"+details.staffId,details,requestId=>payroll.advance({...details,requestId}));form.reset();});
    }}>
      <Label text="Staff"><select className={field} name="staff" required defaultValue=""><option value="">Select staff</option><StaffOptions staff={staff.data??[]}/></select></Label>
      <Label text="Issue date (AD)"><input className={field} type="date" name="date" defaultValue={today} max={today} required/></Label>
      <Label text="Advance (NPR)"><input className={field} type="number" min=".01" step=".01" max="21474836.47" name="amount" required/></Label>
      <Label text="Note"><input className={field} name="note" maxLength={500} required/></Label>
      <button className={primary} disabled={action.isPending}>Record advance</button>
    </form>}
    <ErrorText error={staff.error??log.error??action.error}/>
    <Label text="Advance status"><select className={field} value={filter} onChange={e=>setFilter(e.target.value)}>{["All","Open","Deducted"].map(v=><option key={v}>{v}</option>)}</select></Label>
    {log.data?.filter(a=>filter==="All"||(filter==="Open")===!a.settledEntry).map(a=><p className="border-t border-line pt-2" key={a.id}>{dateOnly(a.issuedOn)} · {a.staff.staffNo} {a.staff.firstName} {a.staff.lastName} · {money(a.amountPaisa)} · {a.note} · {a.settledEntry?"Deducted in "+a.settledEntry.period.month+" BS":"Open"}</p>)}
    {log.data?.length===0 && <p>No advances recorded.</p>}
  </section>;
}
export function Preference({staff,manage}:{staff:Staff;manage:boolean}) {
  const action=usePayrollAction();
  return <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{
    e.preventDefault(); const f=new FormData(e.currentTarget);
    action.mutate(()=>payroll.preference(staff.id,String(f.get("method")),String(f.get("account"))));
  }}>
    <Label text="Preferred payment method"><select className={field} name="method" disabled={!manage} defaultValue={staff.payrollPreference?.method??"CASH"}>{["CASH","BANK","WALLET"].map(m=><option key={m}>{m}</option>)}</select></Label>
    <Label text="Bank or wallet account reference"><input className={field} name="account" readOnly={!manage} maxLength={150} defaultValue={staff.payrollPreference?.accountRef??""}/></Label>
    {manage&&<button className={button} disabled={action.isPending}>Save payment details</button>}
    {action.isSuccess&&<p role="status">Payment details saved.</p>}<ErrorText error={action.error}/>
  </form>;
}
type HistoryRow=Entry & {month:string;finalizedAt:string|null};
export function Arrears({staff,rows,today,pay}:{staff:Staff;rows:HistoryRow[];today:string;pay:boolean}) {
  const action=usePayrollAction();
  const missing=useQuery({queryKey:[...usePayrollKey(),"missing",staff.id],queryFn:()=>payroll.missing(staff.id)});
  const due=rows.filter(r=>r.finalizedAt && r.outstanding>0).sort((a,b)=>a.month.localeCompare(b.month));
  return <div className="space-y-3"><h3 className="font-semibold">Total left to pay · {money(due.reduce((sum,r)=>sum+r.outstanding,0))}</h3>
    {missing.data && missing.data.length>0 && <details><summary>Missing salary sheets ({missing.data.length})</summary>
      {missing.data.map(m=><p key={m.month}>{m.month} BS · {m.state}</p>)}<p>Open Monthly salaries and choose the month. Use Prepare salaries or Update salary list. For a confirmed month, an administrator with unlock access can add missing staff.</p></details>}
    <ErrorText error={action.error??missing.error}/>
    {pay && due.length>0 && <form className="space-y-3" key={due.map(r=>r.id+r.outstanding).join("-")} onSubmit={e=>{
      e.preventDefault(); const f=new FormData(e.currentTarget);
      const allocations=due.map(r=>({entryId:r.id,amountPaisa:Math.round(Number(f.get(r.id))*100)})).filter(a=>a.amountPaisa>0);
      const details={paidOn:String(f.get("date")),method:String(f.get("method")) as Method,reference:String(f.get("reference")),allocations};
      action.mutate(async()=>{if(!allocations.length) throw new Error("Enter an amount for at least one month.");await recordOnce("salary-transfer-"+staff.id,details,requestId=>payroll.transfer(staff.id,{...details,requestId}));});
    }}>
      <h4>Record a payment</h4><div className="flex flex-wrap gap-3">
      {due.map(r=><Label key={r.id} text={r.month+" BS · due "+money(r.outstanding)}><input className={field} type="number" name={r.id} step=".01" min="0" max={r.outstanding/100} placeholder="Amount in NPR"/></Label>)}
      <Label text="Payment date (AD)"><input className={field} type="date" name="date" defaultValue={today} max={today} required/></Label>
      <Label text="Method"><select className={field} name="method" defaultValue={staff.payrollPreference?.method??"CASH"}>{["CASH","BANK","WALLET","CHEQUE","OTHER"].map(m=><option key={m}>{m}</option>)}</select></Label>
      <Label text="Payment reference"><input className={field} name="reference" maxLength={150}/></Label></div>
      <button className={primary} disabled={action.isPending}>Record salary payment</button>
    </form>}
  </div>;
}
export function Supplement({month,entries,select}:{month:string;entries:Entry[];select:(id:string)=>void}) {
  const staff=useQuery({queryKey:[...usePayrollKey(),"staff"],queryFn:payroll.staff});
  const action=usePayrollAction();
  return <details><summary>Add or refresh a missed staff member</summary><form className="flex flex-wrap items-end gap-3 py-3" onSubmit={e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);action.mutate(async()=>{const result=await payroll.supplement(month,String(f.get("staff")),String(f.get("reason")));select(result.id);});
  }}><Label text="Staff"><select className={field} name="staff" required defaultValue=""><option value="">Select staff</option><StaffOptions staff={(staff.data??[]).filter(s=>!entries.some(e=>e.staffId===s.id&&!e.supplementalDraft))}/></select></Label>
    <Label text="Reason for adding this entry"><input className={field} name="reason" maxLength={500} required/></Label><button className={button} disabled={action.isPending}>Prepare staff entry</button></form><ErrorText error={action.error??staff.error}/></details>;
}
