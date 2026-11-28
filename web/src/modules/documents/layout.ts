export type Kind = "ID_CARD" | "CERTIFICATE" | "OFFICIAL_LETTER";
export type Side = "front" | "back";
export interface Block {
  label?: string;
  type: "text" | "photo" | "logo" | "seal" | "signature";
  side: Side;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points: number;
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
  required: boolean;
}
export interface LetterText {
  subject: string;
  body: string;
}
export interface PublishedVersion extends Version {
  issueFields?: {
    key: "office" | "leavingDateBs" | "destination";
    label: string;
  }[];
  templateId: string;
  template: { kind: Kind };
  letter?: LetterText;
  signatorySlot?: string;
}
export interface Layout {
  letter?: LetterText;
  language?: "EN" | "NP" | "BOTH";
  orientation: "portrait" | "landscape";
  prefix: string;
  serialYear: "AD" | "BS";
  nepaliDigits: boolean;
  printArt: boolean;
  signatorySlot?: string;
  frontArt?: string;
  backArt?: string;
  blocks: Block[];
}
export interface Version {
  id: string;
  title: string;
  revision: number;
}
export interface Template extends Version {
  kind: Kind;
  draft: Layout;
  versions: Version[];
}
export interface PrintRecord {
  enrollmentId: string | null;
  values: Record<string, string>;
  photo: string | null;
}
export interface Batch {
  kind: Kind;
  layout: Layout;
  assets: Record<string, string>;
  documents: PrintRecord[];
  skipped: {
    enrollmentId: string;
    admissionNo: string | null;
    reason: string;
  }[];
  warnings: string[];
  proof: string;
}
export const fieldLabels: Record<string, string> = {
  schoolEn: "School name (English)",
  schoolNp: "School name (Nepali)",
  addressEn: "School address (English)",
  addressNp: "School address (Nepali)",
  name: "Student name (English)",
  nameNp: "Student name (Nepali)",
  admissionNo: "Admission number",
  class: "Class",
  section: "Section",
  roll: "Roll number",
  year: "Academic year",
  dobAd: "Date of birth (AD)",
  dobBs: "Date of birth (BS)",
  issueAd: "Issue date (AD)",
  issueBs: "Issue date (BS)",
  serial: "Reference number",
  signer: "Signer name (English)",
  signerNp: "Signer name (Nepali)",
  designation: "Designation (English)",
  designationNp: "Designation (Nepali)",
  phone: "School phone",
  identifiers: "School identifiers",
  office: "Office statement",
  leavingDateBs: "Leaving date (BS)",
  destination: "Receiving school",
};
export const tokens = [
  "schoolEn",
  "schoolNp",
  "addressEn",
  "addressNp",
  "name",
  "nameNp",
  "admissionNo",
  "class",
  "section",
  "roll",
  "year",
  "dobAd",
  "dobBs",
  "issueAd",
  "issueBs",
  "serial",
  "signer",
  "signerNp",
  "designation",
  "designationNp",
  "phone",
  "identifiers",
  "office",
];
export function size(kind: Kind, layout: Layout) {
  const [s, l] = kind === "ID_CARD" ? [53.98, 85.6] : [210, 297];
  return layout.orientation === "portrait"
    ? { width: s, height: l }
    : { width: l, height: s };
}
export function textBlock(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  points: number,
): Block {
  return {
    type: "text",
    side: "front",
    text,
    x,
    y,
    width,
    height,
    points,
    color: "#142d34",
    bold: false,
    align: "left",
    required: true,
  };
}
export const starterKinds = {
  "Official letter": "OFFICIAL_LETTER",
  "Letter to ward office": "OFFICIAL_LETTER",
  "Student ID card": "ID_CARD",
  "Vertical student ID card": "ID_CARD",
  "Blank card": "ID_CARD",
  "Enrollment certificate": "CERTIFICATE",
  "Character certificate": "CERTIFICATE",
  "Transfer certificate": "CERTIFICATE",
  "Blank certificate": "CERTIFICATE",
} as const;
export type StarterName = keyof typeof starterKinds;
export function starter(
  kind: Kind,
  subtype = "Enrollment certificate",
  language: "EN" | "NP" | "BOTH" = "EN",
): Layout {
  if (kind === "OFFICIAL_LETTER") {
    const ward = subtype === "Letter to ward office";
    const local = (en: string, np: string) =>
      language === "EN" ? en : language === "NP" ? np : en + "\n" + np;
    return {
      orientation: "portrait",
      prefix: "LTR",
      serialYear: "BS",
      language,
      nepaliDigits: language === "NP",
      printArt: false,
      blocks: [],
      letter: {
        subject: ward
          ? local("Request for coordination", "समन्वय सम्बन्धमा")
          : local("School correspondence", "विद्यालयको पत्राचार"),
        body: ward
          ? local(
              "We request your office’s assistance with the following school matter.",
              "निम्न विषयमा यस विद्यालयलाई सहयोग गरिदिनुहुन अनुरोध गर्दछौँ।",
            )
          : local("On behalf of {{schoolEn}},", "{{schoolNp}} को तर्फबाट,"),
      },
    };
  }
  const bilingual = language === "BOTH";
  const local = (en: string, np: string) =>
    language === "EN" ? en : language === "NP" ? np : en + "\n" + np;
  const name = local("{{name}}", "{{nameNp}}");
  const school = local("{{schoolEn}}", "{{schoolNp}}");
  const signer = local(
    "{{signer}} · {{designation}}",
    "{{signerNp}} · {{designationNp}}",
  );
  const reference =
    language === "EN"
      ? "Ref. {{serial}}     Date: {{issueBs}} BS"
      : language === "NP"
        ? "पत्र सङ्ख्या: {{serial}}     मिति: {{issueBs}}"
        : "Ref. / पत्र सङ्ख्या: {{serial}}     Date / मिति: {{issueBs}}";
  const base: Layout = {
    orientation: "portrait",
    prefix: "CERT",
    serialYear: "BS",
    language,
    nepaliDigits: language === "NP",
    printArt: true,
    blocks: [],
  };
  function field(
    label: string,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    pt: number,
    style: Partial<Block> = {},
  ): Block {
    return { ...textBlock(text, x, y, w, h, pt), label, ...style };
  }
  const centered = { align: "center", bold: true } as const;
  const optional = { required: false };
  const signature = (x: number, y: number) =>
    field("Signature", "", x, y, 48, 15, 10, {
      type: "signature",
      ...optional,
    });
  if (kind === "ID_CARD") {
    const vertical = subtype === "Vertical student ID card";
    const layout: Layout = {
      ...base,
      orientation: vertical ? "portrait" : "landscape",
      prefix: "ID",
      blocks: [],
    };
    if (subtype === "Blank card") return layout;
    const classInfo = local(
      "Class {{class}} · {{section}}",
      "कक्षा {{class}} · {{section}}",
    );
    const back: Block = {
      ...field(
        "Return instructions",
        local(
          "If found, please return this card to the school.",
          "भेटिएमा यो परिचयपत्र विद्यालयमा बुझाइदिनुहोस्।",
        ),
        3,
        3,
        vertical ? 48 : 79,
        vertical ? 28 : 22,
        9,
      ),
      side: "back",
    };
    const contact: Block = {
      ...field(
        "School contact",
        local("{{schoolEn}}\n{{addressEn}}", "{{schoolNp}}\n{{addressNp}}") +
          "\n{{phone}}",
        3,
        vertical ? 35 : 27,
        vertical ? 48 : 79,
        vertical ? 44 : 24,
        bilingual ? 7 : 9,
        optional,
      ),
      side: "back",
    };
    layout.blocks = vertical
      ? [
          field(
            "School name",
            school,
            2,
            2,
            50,
            13,
            bilingual ? 9 : 11,
            centered,
          ),
          field("Student photo", "", 17, 17, 20, 23, 8, { type: "photo" }),
          field(
            "Student name",
            name,
            2,
            42,
            50,
            13,
            bilingual ? 9 : 12,
            centered,
          ),
          field("Class and section", classInfo, 2, 56, 50, 10, 8, {
            align: "center",
          }),
          field(
            "Admission number and session",
            "{{admissionNo}}  ·  {{year}}",
            2,
            68,
            50,
            7,
            8,
            { align: "center" },
          ),
          field("Card number", "{{serial}}", 2, 77, 50, 6, 8, {
            align: "center",
          }),
          back,
          contact,
        ]
      : [
          field(
            "School name",
            school,
            3,
            2,
            79,
            11,
            bilingual ? 9 : 12,
            centered,
          ),
          field("Student photo", "", 3, 15, 19, 24, 8, { type: "photo" }),
          field("Student name", name, 25, 15, 58, 12, bilingual ? 9 : 11, {
            bold: true,
          }),
          field("Class and section", classInfo, 25, 28, 58, 10, 8),
          field("Admission number", "{{admissionNo}}", 25, 39, 58, 6, 9),
          field(
            "Session and card number",
            "{{year}}   {{serial}}",
            3,
            46,
            79,
            6,
            8,
          ),
          back,
          contact,
        ];
    return layout;
  }
  if (subtype === "Blank certificate") return base;
  if (subtype === "Transfer certificate") {
    return {
      ...base,
      prefix: "TC",
      blocks: [
        field(
          "School name",
          school,
          16,
          13,
          178,
          20,
          bilingual ? 16 : 21,
          centered,
        ),
        field(
          "Certificate heading",
          local("Transfer Certificate", "स्थानान्तरण प्रमाणपत्र"),
          16,
          39,
          178,
          22,
          18,
          centered,
        ),
        field("Reference and issue date", reference, 18, 69, 174, 12, 10),
        field(
          "Student record",
          local(
            "Name: {{name}}\nAdmission no.: {{admissionNo}}\nDate of birth (BS): {{dobBs}}",
            "नाम: {{nameNp}}\nभर्ना नं.: {{admissionNo}}\nजन्म मिति: {{dobBs}}",
          ),
          20,
          89,
          170,
          44,
          12,
        ),
        field(
          "Last enrollment",
          local(
            "Last class attended: {{class}}, section {{section}}\nAcademic year: {{year}}",
            "अन्तिम कक्षा: {{class}}, सेक्सन {{section}}\nशैक्षिक सत्र: {{year}}",
          ),
          20,
          139,
          170,
          32,
          12,
        ),
        field(
          "Leaving date (BS)",
          local("Leaving date (BS)", "विद्यालय छोडेको मिति") +
            " · {{leavingDateBs}}",
          20,
          177,
          170,
          20,
          12,
        ),
        field(
          "Receiving school",
          local("Receiving school", "जाने विद्यालय") + " · {{destination}}",
          20,
          203,
          170,
          25,
          12,
        ),
        signature(135, 235),
        field("Authorizing signatory", signer, 100, 254, 90, 27, 11, {
          align: "right",
        }),
      ],
    };
  }
  if (subtype === "Character certificate") {
    return {
      ...base,
      prefix: "CC",
      orientation: "landscape",
      blocks: [
        field(
          "School name",
          school,
          24,
          11,
          249,
          20,
          bilingual ? 16 : 21,
          centered,
        ),
        field(
          "Certificate heading",
          local("Character Certificate", "चारित्रिक प्रमाणपत्र"),
          23,
          36,
          251,
          24,
          19,
          { ...centered, color: "#184d48" },
        ),
        field("Reference and issue date", reference, 24, 65, 249, 10, 10, {
          align: "center",
        }),
        field(
          "Student introduction",
          local(
            "This certificate is issued to {{name}}, who studied in class {{class}} during the academic year {{year}}.",
            "शैक्षिक सत्र {{year}} मा कक्षा {{class}} मा अध्ययन गरेका विद्यार्थी {{nameNp}} लाई यो प्रमाणपत्र प्रदान गरिएको छ।",
          ),
          28,
          82,
          241,
          31,
          13,
        ),
        field(
          "Conduct and character assessment",
          "{{office}}",
          28,
          116,
          241,
          43,
          13,
        ),
        signature(205, 161),
        field("Certifying signatory", signer, 169, 179, 99, 24, 11, {
          align: "right",
        }),
      ],
    };
  }
  return {
    ...base,
    prefix: "ENR",
    blocks: [
      field(
        "School name",
        school,
        20,
        16,
        170,
        24,
        bilingual ? 16 : 20,
        centered,
      ),
      field(
        "School address",
        local("{{addressEn}}", "{{addressNp}}"),
        20,
        43,
        170,
        16,
        11,
        { align: "center", ...optional },
      ),
      field(
        "Certificate heading",
        local("Certificate of Enrollment", "अध्ययनरत प्रमाणपत्र"),
        18,
        75,
        174,
        28,
        19,
        centered,
      ),
      field("Reference and issue date", reference, 22, 111, 166, 12, 10),
      field(
        "Enrollment confirmation",
        local(
          "This is to certify that {{name}}, admission no. {{admissionNo}}, is enrolled in class {{class}}, section {{section}}, for the academic year {{year}}.",
          "भर्ना नं. {{admissionNo}} भएका विद्यार्थी {{nameNp}} यस विद्यालयमा शैक्षिक सत्र {{year}} मा कक्षा {{class}}, सेक्सन {{section}} मा अध्ययनरत रहेको प्रमाणित गरिन्छ।",
        ),
        22,
        138,
        166,
        57,
        14,
      ),
      signature(134, 217),
      field("Authorizing signatory", signer, 91, 239, 95, 28, 11, {
        align: "right",
      }),
    ],
  };
}
export const sample: PrintRecord = {
  enrollmentId: "sample",
  photo: null,
  values: {
    schoolEn: "Sample School",
    schoolNp: "नमुना विद्यालय",
    addressEn: "Kathmandu, Nepal",
    addressNp: "काठमाडौं, नेपाल",
    name: "Saraswati Shrestha",
    nameNp: "सरस्वती लक्ष्मी श्रेष्ठ",
    admissionNo: "ADM-00241",
    class: "10",
    section: "A",
    roll: "12",
    year: "2083",
    dobAd: "2010-05-01",
    dobBs: "2067-01-18",
    issueAd: "2026-11-27",
    issueBs: "2083-08-11",
    serial: "CERT-2083-00001",
    signer: "Principal’s name",
    signerNp: "प्रधानाध्यापक",
    designation: "Principal",
    designationNp: "प्रधानाध्यापक",
    phone: "+977-01-0000000",
    identifiers: "School code 000000",
    leavingDateBs: "2083-08-11",
    destination: "Janata Secondary School",
    office:
      "The school records describe the student as considerate and dependable.",
  },
};
export const substitute = (str: string, values: Record<string, string>) =>
  str.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
export function sheetPositions(count: number, cols: number, back: boolean) {
  return Array.from({ length: count }, (_, i) => ({
    row: Math.floor(i / cols) + 1,
    column: back ? cols - (i % cols) : (i % cols) + 1,
  }));
}
