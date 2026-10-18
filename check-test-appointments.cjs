const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const appointments = await prisma.appointment.findMany({
    where: {
      patientId: "48353ce4-a182-4802-9f65-7101a5b0e8af",
      appointmentDate: new Date("2026-10-19T00:00:00.000Z"),
    },
    select: {
      id: true,
      appointmentDate: true,
      appointmentTime: true,
      status: true,
      doctorId: true,
    },
  });

  console.log(JSON.stringify(appointments, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
