import crypto from "crypto";
import { timingSafeEqual } from "./timing-safe.ts";

export const LINK_CODE_TTL_HOURS = 48;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeLinkCode(code: string): string {
  return (code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function generateLinkCode(groups = 3, groupSize = 4): string {
  const bytes = crypto.randomBytes(groups * groupSize);
  let raw = "";

  for (let i = 0; i < groups * groupSize; i += 1) {
    const value = bytes[i];
    raw += CODE_ALPHABET[value % CODE_ALPHABET.length];
  }

  const parts: string[] = [];
  for (let g = 0; g < groups; g += 1) {
    parts.push(raw.slice(g * groupSize, (g + 1) * groupSize));
  }

  return parts.join("-");
}

export function hashLinkCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeLinkCode(code))
    .digest("hex");
}

export function linkCodeExpiry(now: Date = new Date()): string {
  const expires = new Date(now.getTime() + LINK_CODE_TTL_HOURS * 60 * 60 * 1000);
  return expires.toISOString();
}

export function isLinkCodeExpired(
  expiresAt: string | Date | null | undefined,
  now: number = Date.now()
): boolean {
  if (!expiresAt) return true;
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) return true;
  return time <= now;
}

export type LinkCodeRecord = {
  link_code?: string | null;
  link_code_expires_at?: string | null;
  link_code_used_at?: string | null;
  telegram_id?: number | null;
};

export function isLinkCodeUsable(
  record: LinkCodeRecord | null | undefined,
  inputHash: string,
  now: number = Date.now()
): boolean {
  if (!record) return false;
  if (!record.link_code) return false;
  if (!timingSafeEqual(record.link_code, inputHash)) return false;
  if (record.link_code_used_at) return false;
  if (record.telegram_id) return false;
  if (isLinkCodeExpired(record.link_code_expires_at, now)) return false;
  return true;
}
