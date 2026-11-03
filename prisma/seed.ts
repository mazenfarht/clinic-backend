// prisma/seed.ts
// Creates a demo clinic, its settings and the first DOCTOR account.
// Idempotent: safe to run more than once.   Usage: npm run seed

import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const day = (isOpen: boolean) => ({ open: "10:00", close: "18:00", isOpen });

async function main() {
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
