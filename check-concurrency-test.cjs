const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const doctorId = "001ad859-5f7d-42ad-89c8-8c02c857b4f7";
  const patientIds = [
    "36b0bce3-d5c4-4c10-bf20-ef4eab055ffd",
    "48353ce4-a182-4802-9f65-7101a5b0e8af"
  ];

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      patientId: { in: patientIds },
      appointmentDate: new Date("2026-10-20T00:00:00.000Z"),
      status: { in: ["SCHEDULED", "CONFIRMED"] }
    },
    select: {
      id: true,
      patientId: true,
      appointmentDate: true,
      appointmentTime: true,
      status: true
    }
  });

  console.log(JSON.stringify(appointments, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
