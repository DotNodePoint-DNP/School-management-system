import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";

const types = ["PROFILE_PHOTO", "BIRTH_CERTIFICATE", "TRANSFER_CERTIFICATE", "PREVIOUS_MARKSHEET", "OTHER"];
interface DocumentSummary { id: string; type: string; originalName: string; sizeBytes: number; createdAt: string }
const readable = (value: string) => value.replaceAll("_", " ").toLowerCase();

export function StudentDocuments({ studentId, canUpload }: { studentId: string; canUpload: boolean }) {
  const client = useQueryClient();
  const path = `/students/${studentId}/documents`;
  const queryKey = ["student-documents", studentId];
  const documents = useQuery({ queryKey, queryFn: () => createApiClient().get<DocumentSummary[]>(path) });
  const [type, setType] = useState(types[0]);
  const upload = useMutation({
    mutationFn: (form: HTMLFormElement) => createApiClient().post(path + "/" + type, new FormData(form)),
    onSuccess: async (_, form) => {
      form.reset();
      await Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ["student-photo"] })]);
    },
  });
  const download = useMutation({
    mutationFn: async (doc: DocumentSummary) => {
      const blob = await createApiClient().getBlob(path + "/" + doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.originalName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return <section className="space-y-3 rounded-xl border border-line bg-panel p-5">
    <h2 className="font-semibold">Student documents</h2>
    {documents.isPending && <p>Loading documents…</p>}
    {documents.data?.length === 0 && <p>No documents uploaded.</p>}
    <ul>{documents.data?.map(doc => <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2">
      <span>{doc.originalName} · {readable(doc.type)} · {Math.ceil(doc.sizeBytes / 1024)} KB · {doc.createdAt.slice(0, 10)}</span>
      <button className="text-teal" disabled={download.isPending} onClick={() => download.mutate(doc)}>Download</button>
    </li>)}</ul>
    {canUpload && <form onSubmit={event => { event.preventDefault(); upload.mutate(event.currentTarget); }}>
      <fieldset disabled={upload.isPending} className="flex flex-wrap items-center gap-3">
        <label>Document type <select value={type} onChange={event => setType(event.target.value)}>{types.map(t => <option key={t} value={t}>{readable(t)}</option>)}</select></label>
        <input aria-label="Document file" key={type} type="file" name="file" required accept={type === "PROFILE_PHOTO" ? "image/png,image/jpeg" : "application/pdf,image/png,image/jpeg"} />
        <button className="rounded bg-teal px-3 py-2 text-white">{upload.isPending ? "Uploading…" : "Upload"}</button>
      </fieldset>
      <p className="text-xs text-muted">Up to 5 MB per file. The latest profile photo appears on the student profile.</p>
    </form>}
    {(documents.error || upload.error || download.error) && <p role="alert">{(documents.error ?? upload.error ?? download.error)?.message}</p>}
  </section>;
}
