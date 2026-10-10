import { admissionSteps } from "@/modules/admissions/types";

export function AdmissionProgress({
  step,
  completedSteps,
  onStepChange,
}: {
  step: number;
  completedSteps: boolean[];
  onStepChange: (step: number) => void;
}) {
  return (
    <aside className="self-start rounded border border-[#dfe0d5] bg-[#fffdf8] p-5 max-[850px]:overflow-x-auto">
      <p className="mb-5 text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">
        Application progress
      </p>
      <ol className="grid gap-2 max-[850px]:flex max-[850px]:min-w-max">
        {admissionSteps.map((label, index) => (
          <li key={label}>
            <button
              className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] ${step === index ? "bg-[#dff3ed] text-[#166f65]" : "text-[#82908c]"}`}
              onClick={() => index <= step && onStepChange(index)}
              type="button"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${completedSteps[index] ? "bg-[#168b81] text-white" : step === index ? "bg-[#edbd63] text-[#183d3b]" : "bg-[#edf1ec]"}`}
              >
                {completedSteps[index] ? "✓" : index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-8 border-t border-[#edf1ec] pt-4 text-[10px] leading-[1.6] text-[#82908c]">
        <strong className="block text-[#4e6963]">Need help?</strong>
        Contact admissions at
        <br />
        <a
          className="text-[#167d72]"
          href="mailto:admissions@pathivara.example"
        >
          admissions@pathivara.example
        </a>
      </div>
    </aside>
  );
}
