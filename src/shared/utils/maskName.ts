// src/shared/utils/maskName.ts

// "Ahmed Mohamed Ali" -> "Ahmed M."
// Used wherever a patient's name is shown to anonymous callers or on a public
// waiting-room screen, so full names are never exposed.
export function maskName(fullName: string): string {
  const [first, second] = fullName.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}
