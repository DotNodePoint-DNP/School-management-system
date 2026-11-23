"use client";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { assetUrl, type Content } from "../services/content";
import { adminWrite, uploadFile } from "./cms";
export default function AlbumPhotos({ albumId }: { albumId: string }) {
  const path = "/gallery/" + albumId,
    cache = useQueryClient(),
    key = ["website-album", albumId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => createApiClient().get<Content>("/admin/website" + path),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [files, setFiles] = useState<File[]>([]);
  const photos = query.data?.photos ?? [];
  const uploadedFiles = useRef(new WeakMap<File, string>());
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await cache.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo update failed.");
    } finally {
      setBusy(false);
    }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      values = new FormData(form);
    await act(async () => {
      const batch = [];
      for (const [i, file] of files.entries()) {
        let imageUrl = uploadedFiles.current.get(file);
        if (!imageUrl) {
          imageUrl = await uploadFile(file, "image");
          uploadedFiles.current.set(file, imageUrl);
        }
        batch.push({
          imageUrl,
          altText: String(values.get("alt" + i) ?? ""),
          caption: String(values.get("caption" + i) ?? ""),
        });
      }
      await adminWrite.post(path + "/photos", { photos: batch });
      form.reset();
      setFiles([]);
    });
  }
  function move(i: number, d: number) {
    const ids = photos.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    return act(async () => {
      await adminWrite.patch(path + "/photos/reorder", { photoIds: ids });
    });
  }
  return (
    <section className="cms-panel">
      <h2>Album photos</h2>
      {query.isPending && <p>Loading photos…</p>}
      {query.error && (
        <p role="alert">
          {query.error.message}{" "}
          <button onClick={() => query.refetch()}>Retry</button>
        </p>
      )}
      <fieldset disabled={busy}>
        <ol>
          {photos.map((p, i) => (
            <li key={p.id} className="cms-photo">
              <img src={assetUrl(p.imageUrl)} alt={p.altText ?? ""} />
              <span>{p.caption || p.altText || "Photo " + (i + 1)}</span>
              <div className="cms-actions">
                <button disabled={!i} onClick={() => move(i, -1)}>
                  Earlier
                </button>
                <button
                  disabled={i === photos.length - 1}
                  onClick={() => move(i, 1)}
                >
                  Later
                </button>
                <button
                  onClick={() => {
                    if (confirm("Remove this photo from the album?"))
                      void act(async () => {
                        await adminWrite.delete(path + "/photos", {
                          body: JSON.stringify({ photoIds: [p.id] }),
                        });
                      });
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        <form onSubmit={add}>
          <label>
            Add photos
            <input
              required
              type="file"
              multiple
              accept="image/png,image/jpeg"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {files.map((f, i) => (
            <div key={i} className="cms-form-grid">
              <strong className="cms-wide">{f.name}</strong>
              <label>
                Description for screen readers
                <input name={"alt" + i} required maxLength={300} />
              </label>
              <label>
                Caption
                <input name={"caption" + i} maxLength={1000} />
              </label>
            </div>
          ))}
          <button
            className="cms-primary"
            disabled={!files.length || files.length > 100}
          >
            {busy ? "Saving…" : "Add photos"}
          </button>
          {files.length > 100 && <p>Select up to 100 photos at once.</p>}
        </form>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
