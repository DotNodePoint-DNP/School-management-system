"use client";
import { useState, type FormEvent } from "react";
import { getApiBaseUrl } from "@/lib/api/client";
export default function PublicForm({ careerSlug }: { careerSlug?: string }) {
  const [type, setType] = useState("general"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(
      Array.from(new FormData(form).entries()).filter(([, v]) => v !== ""),
    );
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        getApiBaseUrl() +
          "/public/website/" +
          (careerSlug
            ? "careers/" + encodeURIComponent(careerSlug) + "/apply"
            : "contact"),
        {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(careerSlug ? values : { ...values, type }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw Error(
          response.status === 429
            ? "Too many submissions. Please try again in a minute."
            : [
                body?.error?.message ??
                  "The school could not receive your submission.",
              ]
                .flat()
                .join(" "),
        );
      }
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to send your submission.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <p role="status" className="site-facts">
        {careerSlug
          ? "Your application has been received."
          : "Your inquiry has been sent to the school office."}
      </p>
    );
  return (
    <form className="public-form" onSubmit={submit}>
      {careerSlug ? (
        <h2>Apply for this position</h2>
      ) : (
        <fieldset>
          <legend>Inquiry type</legend>
          {["general", "admission"].map((v) => (
            <label className="choice" key={v}>
              <input
                type="radio"
                name="type"
                checked={type === v}
                onChange={() => setType(v)}
                value={v}
              />{" "}
              {v === "general" ? "General" : "Admission"}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        Full name
        <input required name="fullName" autoComplete="name" maxLength={180} />
      </label>
      <label>
        Phone
        <input
          required
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={25}
        />
      </label>
      <label>
        Email{!careerSlug && " (optional)"}
        <input
          type="email"
          required={!!careerSlug}
          name="email"
          autoComplete="email"
          maxLength={254}
        />
      </label>
      {!careerSlug && type === "admission" && (
        <>
          <label>
            Student name
            <input name="studentName" maxLength={180} />
          </label>
          <label>
            Grade of interest
            <input name="targetGrade" maxLength={100} />
          </label>
        </>
      )}
      {careerSlug ? (
        <>
          <label>
            Résumé link
            <input
              name="resumeUrl"
              type="url"
              pattern="https://.+"
              placeholder="https://"
              required
              maxLength={2048}
            />
            <small>Use an HTTPS link the hiring team can open.</small>
          </label>
          <label>
            Cover letter (optional)
            <textarea name="coverLetter" rows={5} maxLength={10000} />
          </label>
        </>
      ) : (
        <>
          <label>
            Subject (optional)
            <input name="subject" maxLength={250} />
          </label>
          <label>
            Message
            <textarea required name="message" rows={5} maxLength={10000} />
          </label>
          <label hidden aria-hidden="true">
            Website
            <input autoComplete="off" tabIndex={-1} name="website" />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="site-button" disabled={busy}>
        {busy ? "Sending…" : careerSlug ? "Submit application" : "Send inquiry"}
      </button>
    </form>
  );
}
