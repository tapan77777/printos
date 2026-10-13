#!/usr/bin/env node
import { randomBytes, scryptSync } from "crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node apps/web/scripts/hash-password.mjs '<password>'");
  process.exit(1);
}
const salt = randomBytes(16);
const key = scryptSync(password.normalize("NFKC"), salt, 64);
console.log(`scrypt$${salt.toString("hex")}$${key.toString("hex")}`);
