import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = scryptSync(password.normalize("NFKC"), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password.normalize("NFKC"), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
