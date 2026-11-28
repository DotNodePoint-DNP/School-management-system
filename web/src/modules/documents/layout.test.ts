import { describe, it, expect } from "vitest";
import {
  sheetPositions,
  size,
  starter,
  substitute,
  starterKinds,
  type StarterName,
  sample,
} from "./layout";
describe("school document layouts", () => {
  it("mirrors backs across the full sheet even on the last partial row", () => {
    expect(sheetPositions(3, 2, false)).toEqual([
      { row: 1, column: 1 },
      { row: 1, column: 2 },
      { row: 2, column: 1 },
    ]);
    expect(sheetPositions(3, 2, true)).toEqual([
      { row: 1, column: 2 },
      { row: 1, column: 1 },
      { row: 2, column: 2 },
    ]);
  });
  for (const name of Object.keys(starterKinds) as StarterName[]) {
    for (const language of ["EN", "NP", "BOTH"] as const)
      it(name + " has valid " + language + " content and dimensions", () => {
        const kind = starterKinds[name],
          layout = starter(kind, name, language),
          paper = size(kind, layout);
        if (name.startsWith("Blank")) {
          expect(layout.blocks).toHaveLength(0);
          return;
        }
        if (layout.letter) {
          expect(layout.letter.subject).toBeTruthy();
          expect(layout.letter.body).toBeTruthy();
          return;
        }
        expect(layout.blocks.length).toBeGreaterThan(0);
        for (const block of layout.blocks) {
          expect(block.x + block.width).toBeLessThanOrEqual(paper.width);
          expect(block.y + block.height).toBeLessThanOrEqual(paper.height);
          if (block.type === "text") {
            expect(block.label).toBeTruthy();
            expect(block.text).not.toContain("undefined");
            expect(substitute(block.text, sample.values).trim()).not.toBe("");
          }
        }
      });
  }
  it("assigns separate school-office fields and physical formats to certificate starters", () => {
    const transfer = starter("CERTIFICATE", "Transfer certificate", "NP"),
      character = starter("CERTIFICATE", "Character certificate", "NP"),
      enrolled = starter("CERTIFICATE", "Enrollment certificate", "NP");
    expect(transfer.orientation).toBe("portrait");
    expect(character.orientation).toBe("landscape");
    const wording = (layout: typeof transfer) =>
      layout.blocks.map((b) => b.text).join(" ");
    expect(wording(transfer)).toContain("{{leavingDateBs}}");
    expect(wording(transfer)).toContain("{{destination}}");
    expect(wording(character)).toContain("{{office}}");
    expect(wording(enrolled)).not.toContain("{{office}}");
    for (const layout of [transfer, character, enrolled])
      expect(wording(layout)).toContain("{{signerNp}}");
  });
  it("preserves identifiers and interpolates adjacent Nepali text", () => {
    expect(
      substitute("नाम {{nameNp}} ({{admissionNo}})", {
        nameNp: "सीता",
        admissionNo: "AB-001",
      }),
    ).toBe("नाम सीता (AB-001)");
  });
});
