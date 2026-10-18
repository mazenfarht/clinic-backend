import bcrypt from "bcrypt";
import prisma from "./src/config/database";

async function main() {
  const email = "Receptionist@clinic.com";
  const newPassword = "Receptionist@1710";

  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  if (!user) {
    throw new Error("Receptionist account not found");
  }

  if (user.role !== "RECEPTIONIST") {
    throw new Error("This account is not a receptionist");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log("Receptionist password updated successfully");
  console.log("Email:", user.email);
  console.log("Active:", user.isActive);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
