import Link from "next/link";
export default function AccessDenied() {
  return <section className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-panel p-6 text-ink"><h1 className="text-2xl font-semibold">Access denied</h1><p>Your account does not have access to this page. Contact your school administrator if your responsibilities have changed.</p><Link className="font-semibold text-teal underline" href="/dashboard">Return to dashboard</Link></section>;
}
