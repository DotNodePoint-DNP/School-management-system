import { client, encodeId, examPath } from "./client";
export interface Release {
  id: string;
  name: string;
  status: string;
  releaseOn: string | null;
  visibleToParents: boolean;
}
export const listExamReleases = (year: string) =>
  client().get<Release[]>(`/academic-years/${encodeId(year)}/exam-releases`);
export const setExamRelease = (
  id: string,
  input: { releaseOn?: string; clear?: boolean; reason?: string },
) => client().put<Release>(examPath(id) + "/release", input);
