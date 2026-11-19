// prisma/seed.ts
// Creates the first platform admin (super admin), a demo clinic, its settings
// and two demo DOCTOR accounts.
// Idempotent: safe to run more than once.   Usage: npm run seed
//
// Super admin: set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (optional
// SUPER_ADMIN_NAME). If either is missing the super admin step is skipped.
// There is intentionally NO default password for it.

import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const day = (isOpen: boolean) => ({ open: "10:00", close: "18:00", isOpen });

// Same rules as passwordComplexitySchema in src/modules/auth/auth.validation.ts
function passwordProblem(password: string): string | null {
  if (password.length < 8) return "must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "must contain a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "must contain a special character";
  return null;
}

async function seedSuperAdmin(): Promise<void> {
  const rawEmail = process.env.SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullName = process.env.SUPER_ADMIN_NAME?.trim() || "Super Admin";

  if (!rawEmail || !password) {
    console.warn(
      "Super admin skipped: set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to create one."
    );
    return;
  }

  const email = rawEmail.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`SUPER_ADMIN_EMAIL is not a valid email: "${rawEmail}"`);
  }
  const problem = passwordProblem(password);
  if (problem) {
    throw new Error(`SUPER_ADMIN_PASSWORD ${problem}`);
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    // Never overwrite an existing admin's password from the seed.
    console.log(`  superAdmin: ${email} (already exists, left unchanged)`);
    return;
  }

  await prisma.platformAdmin.create({
    data: { email, fullName, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`  superAdmin: ${email} (created)`);
}

async function main() {
  await seedSuperAdmin();

  const email = process.env.SEED_DOCTOR_EMAIL ?? "doctor@clinic.com";
  const password = process.env.SEED_DOCTOR_PASSWORD ?? "ChangeMe123!";

  let clinic = await prisma.clinic.findFirst({
    where: { name: "Demo Clinic" },
  });

  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        name: "Demo Clinic",
        settings: {
          create: {
            workingHours: {
              sunday: day(true),
              monday: day(true),
              tuesday: day(true),
              wednesday: day(true),
              thursday: day(true),
              friday: day(false),
              saturday: day(true),
            },
          },
        },
      },
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Two demo doctors so multi-doctor booking can be tried right away.
  const doctors = [
    { email, fullName: "Dr. Demo", specialty: "General Practice" },
    {
      email: email.replace("@", "+cardio@"),
      fullName: "Dr. Cardio",
      specialty: "Cardiology",
    },
  ];

  for (const d of doctors) {
    const user = await prisma.user.upsert({
      where: { clinicId_email: { clinicId: clinic.id, email: d.email } },
      update: {},
      create: {
        clinicId: clinic.id,
        email: d.email,
        fullName: d.fullName,
        role: "DOCTOR",
        // The first demo doctor administers the demo clinic.
        isClinicAdmin: d === doctors[0],
        passwordHash,
      },
    });

    await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {},
      create: { clinicId: clinic.id, userId: user.id, specialty: d.specialty },
    });
  }

  console.log("Seed complete");
  console.log(`  clinicId : ${clinic.id}`);
  console.log(`  doctors  : ${doctors.map((d) => d.email).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
