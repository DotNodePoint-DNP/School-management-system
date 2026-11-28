import { createApiClient } from "@/lib/api/client";

export interface Policy {
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  startsAt: string;
  endsAt: string;
  grace: number;
  offDays: number[];
}
export type RequestKind = "LEAVE" | "MISSED_IN" | "MISSED_OUT";
interface RequestInput {
  kind: RequestKind;
  fromDate: string;
  toDate: string;
  reason: string;
  proposedAt?: string;
}
export interface StaffRequest extends RequestInput {
  id: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  staff?: { firstName: string; lastName: string; staffNo: string };
}
interface Punch {
  id: string;
  at: string;
  kind: "IN" | "OUT";
  workDate: string;
  requestId: string | null;
}
interface Personal {
  campus: string | null;
  today: string;
  punches: Punch[];
  requests: StaffRequest[];
}
export interface RegisterRow {
  staffNo: string;
  name: string;
  kind: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  minutes: number | null;
  late: boolean;
  early: boolean;
}
const base = "/staff-attendance";
const client = createApiClient;
export const attendance = {
  mine: () => client().get<Personal>(base + "/me"),
  policy: () => client().get<Policy | null>(base + "/policy"),
  savePolicy: (body: Policy) => client().put(base + "/policy", body),
  register: (date: string) =>
    client().get<RegisterRow[]>(
      base + "/register?date=" + encodeURIComponent(date),
    ),
  requests: () => client().get<StaffRequest[]>(base + "/requests"),
  submit: (body: RequestInput) => client().post(base + "/me/requests", body),
  review: (id: string, status: string, note: string) =>
    client().post(base + "/requests/" + encodeURIComponent(id) + "/decision", {
      status,
      note,
    }),
  async punch(kind: "IN" | "OUT", workDate: string) {
    if (!navigator.geolocation || !window.isSecureContext)
      throw new Error(
        "Open the dashboard over HTTPS on a location-enabled device, or request a correction.",
      );
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) =>
          reject(
            new Error(
              error.code === 1
                ? "Location permission was denied. Allow location or request a correction."
                : "Location unavailable. Retry or request a correction.",
            ),
          ),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      ),
    );
    return client().post<Punch>(base + "/me/punches", {
      kind,
      workDate,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: position.timestamp,
    });
  },
};
