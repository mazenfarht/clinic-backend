// src/shared/utils/generatePassword.ts
//
// Cryptographically secure random password for accounts created by the platform
// admin. Always satisfies passwordComplexitySchema (upper, lower, digit,
// special, >= 8 chars). Look-alike characters (0/O, 1/l/I) are left out because
// the admin reads these out to people.

import { randomInt } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%&*?";
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

const MIN_LENGTH = 12;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

export function generatePassword(length = 16): string {
  if (!Number.isInteger(length) || length < MIN_LENGTH) {
    throw new Error(`Generated passwords must be at least ${MIN_LENGTH} characters`);
  }

  // One of each class guaranteed, the rest random from every class.
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < length) chars.push(pick(ALL));

  // Fisher-Yates with a CSPRNG so the guaranteed characters are not predictable
  // positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
