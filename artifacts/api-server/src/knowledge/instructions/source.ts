import { registrationKey } from "./model";
import { isAllowedInstructionSource } from "./parser";

export type OfficialInstructionSourceStatus =
  | "structured"
  | "official_document"
  | "not_published"
  | "invalid_source";

export interface OfficialInstructionSourceResolution {
  status: OfficialInstructionSourceStatus;
  documentUrl: string | null;
}

function sourceRegistrationMatches(
  sourceUrl: string,
  registrationNumber: string,
): boolean {
  try {
    const fileName = decodeURIComponent(new URL(sourceUrl).pathname)
      .split("/")
      .at(-1);
    const match = fileName?.match(/^(UA\d+)_/iu);
    return match?.[1]?.toUpperCase() === registrationKey(registrationNumber);
  } catch {
    return false;
  }
}

export function hasStructuredOfficialInstructionSource(
  instructionUrl: string | null | undefined,
  registrationNumber?: string,
): boolean {
  const url = instructionUrl?.trim() ?? "";
  if (!url || !isAllowedInstructionSource(url)) return false;
  return registrationNumber
    ? sourceRegistrationMatches(url, registrationNumber)
    : true;
}

function isAllowedOfficialPdfSource(
  sourceUrl: string,
  registrationNumber: string,
): boolean {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (host === "drlz.com.ua" || host === "www.drlz.com.ua") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/ibp\/lz_www\.nsf\/id\/[A-F0-9]{32}\/\$file\/UA\d+_[A-F0-9]+\.pdf$/iu.test(
        decodeURIComponent(url.pathname),
      ) &&
      sourceRegistrationMatches(sourceUrl, registrationNumber)
    );
  } catch {
    return false;
  }
}

export function resolveOfficialInstructionSource(
  instructionUrl: string | null | undefined,
  registrationNumber: string,
  committedSnapshot = false,
): OfficialInstructionSourceResolution {
  const sourceUrl = instructionUrl?.trim() ?? "";
  if (
    committedSnapshot ||
    hasStructuredOfficialInstructionSource(sourceUrl, registrationNumber)
  ) {
    return {
      status: "structured",
      documentUrl: sourceUrl || null,
    };
  }
  if (isAllowedOfficialPdfSource(sourceUrl, registrationNumber)) {
    return { status: "official_document", documentUrl: sourceUrl };
  }
  return sourceUrl
    ? { status: "invalid_source", documentUrl: null }
    : { status: "not_published", documentUrl: null };
}
