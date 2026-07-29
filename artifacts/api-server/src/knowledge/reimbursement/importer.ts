import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  ReimbursementRecordSchema,
  ReimbursementSnapshotSchema,
  type ReimbursementRecord,
  type ReimbursementSnapshot,
  REIMBURSEMENT_SECTIONS,
  normalizeReimbursementText,
  reimbursementRecordsHash,
} from "./model";

export const REIMBURSEMENT_ANNOUNCEMENT_URL =
  "https://moz.gov.ua/uk/najmasshtabnishe-rozshirennya-dostupnih-likiv-do-programi-dodali-she-260-torgovelnih-nazv-likarskih-zasobiv-dlya-likuvannya-sercevo-sudinnih-i-cerebrovaskulyarnih-zahvoryuvan";
export const REIMBURSEMENT_DOCUMENT_URL =
  "https://backend.nszu.gov.ua/storage/application/26/07/17/frQ9Y5u4749wdh2MgAlOVpCal9fJtf9utTFWmCku.pdf";

type ReimbursementSection = (typeof REIMBURSEMENT_SECTIONS)[number];

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sectionForPage(page: number): ReimbursementSection {
  if (page <= 54) return "standard_medicines";
  if (page <= 62) return "insulin";
  return "combination_medicines";
}

function columnText(
  items: PositionedText[],
  anchorY: number,
  minX: number,
  maxX: number,
): string {
  const candidates = items.filter(
    (item) => item.text && item.x >= minX && item.x < maxX,
  );
  const nearestDistance = Math.min(
    ...candidates.map((item) => Math.abs(item.y - anchorY)),
  );
  if (!Number.isFinite(nearestDistance) || nearestDistance > 6) return "";
  return normalizeReimbursementText(
    candidates
      .filter((item) => Math.abs(item.y - anchorY) <= nearestDistance + 0.8)
      .sort((left, right) => right.y - left.y || left.x - right.x)
      .map((item) => item.text)
      .join(" "),
  );
}

function packageKey(
  section: ReimbursementSection,
  registrationNumber: string,
  tradeName: string,
  strength: string,
  packageQuantity: string,
  sourcePage: number,
  sourceRow: number,
): string {
  const digest = sha256(
    JSON.stringify([
      section,
      registrationNumber,
      tradeName,
      strength,
      packageQuantity,
      sourcePage,
      sourceRow,
    ]),
  ).slice(0, 24);
  return `nszu-${digest}`;
}

export interface ParseReimbursementOptions {
  now?: Date;
  releaseDate: string;
  sourceSha256: string;
  contentLength: number;
}

export async function parseReimbursementPdf(
  bytes: Buffer,
  options: ParseReimbursementOptions,
): Promise<ReimbursementSnapshot> {
  const document = await getDocument({
    data: new Uint8Array(bytes),
  }).promise;
  if (document.numPages !== 85) {
    throw new Error(`reimbursement_page_count_mismatch:${document.numPages}`);
  }

  const records: ReimbursementRecord[] = [];
  let sourceRow = 0;
  for (let pageNumber = 3; pageNumber <= 82; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PositionedText[] = content.items.flatMap((item) => {
      if (!("str" in item)) return [];
      const text = normalizeReimbursementText(item.str);
      return text ? [{ text, x: item.transform[4], y: item.transform[5] }] : [];
    });
    const anchors = items
      .filter((item) => /^UA\/\d+\/\d+\/\d+$/u.test(item.text))
      .sort((left, right) => right.y - left.y || left.x - right.x);
    for (const anchor of anchors) {
      sourceRow += 1;
      const section = sectionForPage(pageNumber);
      const inn = columnText(items, anchor.y, 0, 160);
      const tradeName = columnText(items, anchor.y, 155, 270);
      const dosageForm = columnText(items, anchor.y, 270, 390);
      const strength = columnText(items, anchor.y, 390, 450);
      const packageQuantity = columnText(items, anchor.y, 450, 490);
      const atcCode = columnText(items, anchor.y, 490, 550);
      const copayUah = columnText(items, anchor.y, 860, 960).replace(",", ".");
      const candidate = {
        packageKey: packageKey(
          section,
          anchor.text,
          tradeName,
          strength,
          packageQuantity,
          pageNumber,
          sourceRow,
        ),
        section,
        registrationNumber: anchor.text,
        inn,
        tradeName,
        dosageForm,
        strength,
        packageQuantity,
        atcCode,
        copayUah,
        sourcePage: pageNumber,
        sourceRow,
      };
      const parsed = ReimbursementRecordSchema.safeParse(candidate);
      if (!parsed.success) {
        throw new Error(
          `reimbursement_row_invalid:${pageNumber}:${sourceRow}:${parsed.error.issues[0]?.path.join(".") ?? "unknown"}`,
        );
      }
      records.push(parsed.data);
    }
  }

  const sectionCounts = {
    standard_medicines: records.filter(
      (record) => record.section === "standard_medicines",
    ).length,
    insulin: records.filter((record) => record.section === "insulin").length,
    combination_medicines: records.filter(
      (record) => record.section === "combination_medicines",
    ).length,
  };
  const medicalDevicePositionCount = 36;
  const parsedDocumentPositionCount =
    records.length + medicalDevicePositionCount;
  const publishedSummaryPositionCount = 1038;
  const warnings: string[] = [];
  if (parsedDocumentPositionCount !== publishedSummaryPositionCount) {
    warnings.push(
      `published_summary_count_mismatch:${publishedSummaryPositionCount}:${parsedDocumentPositionCount}`,
    );
  }
  const duplicateKeys =
    records.length - new Set(records.map((item) => item.packageKey)).size;
  if (duplicateKeys) warnings.push(`duplicate_package_keys:${duplicateKeys}`);
  const generatedAt = (options.now ?? new Date()).toISOString();

  return ReimbursementSnapshotSchema.parse({
    schemaVersion: "ua-nszu-reimbursement-v1",
    generatedAt,
    source: {
      title: "Перелік лікарських засобів, які підлягають реімбурсації",
      publisher: "Національна служба здоров'я України",
      announcementUrl: REIMBURSEMENT_ANNOUNCEMENT_URL,
      documentUrl: REIMBURSEMENT_DOCUMENT_URL,
      releaseDate: options.releaseDate,
      checkedAt: generatedAt,
      contentLength: options.contentLength,
      sha256: options.sourceSha256,
      recordsSha256: reimbursementRecordsHash(records),
      pageCount: 85,
      recordCount: records.length,
      sectionCounts,
      medicalDevicePositionCount,
      publishedSummaryPositionCount,
      parsedDocumentPositionCount,
      complete: records.length >= 1_000 && duplicateKeys === 0,
    },
    records,
    warnings,
  });
}

export async function importReimbursement(options: {
  url?: string;
  now?: Date;
  releaseDate: string;
  fetchImpl?: typeof fetch;
}): Promise<ReimbursementSnapshot> {
  const response = await (options.fetchImpl ?? fetch)(
    options.url ?? REIMBURSEMENT_DOCUMENT_URL,
  );
  if (!response.ok) {
    throw new Error(`reimbursement_download_failed:${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return parseReimbursementPdf(bytes, {
    now: options.now,
    releaseDate: options.releaseDate,
    sourceSha256: sha256(bytes),
    contentLength: bytes.length,
  });
}

export async function writeReimbursementSnapshot(
  outputPath: string,
  options: {
    url?: string;
    now?: Date;
    releaseDate: string;
    fetchImpl?: typeof fetch;
  },
): Promise<ReimbursementSnapshot> {
  const snapshot = await importReimbursement(options);
  if (!snapshot.source.complete) {
    throw new Error("reimbursement_snapshot_incomplete");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}
