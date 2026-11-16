import request from "supertest";
import app from "../helpers/app";
import prisma from "../helpers/prisma";
import { selectNextWaiting } from "../../src/modules/queue/queue.service";
import { getClinicToday, getClinicTodayStr } from "../../src/shared/utils/clinicTime";
import {
  createClinic,
  createClinicSettings,
  createUser,
  createPatient,
  deleteClinicCascade,
  signAccessToken,
  authHeader,
  TestClinic,
  TestUser,
} from "../helpers/factories";

// Regression coverage for two bugs that used to disagree with each other:
//
//   - callNext() / GET /queue/status pick the next patient via the
//     documented late-patient priority rule (selectNextWaiting).
//   - GET /dashboard/queue used to pick it with a plain
//     `orderBy: { queueNumber: "asc" }`, which is only the same thing when
//     nobody is late. This test manufactures a scenario where they are NOT
//     the same, so a regression (someone reverting to the naive order) would
//     be caught here, not just in production.
//
// Scenario (4 patients, all checked in "now", with early appointment times
// so all four count as late relative to "now"):
//
//   P1 09:00(-ish)  -> must wait for P2, P3, P4 (3 later checked-in)   -> goes 2nd
//   P2               -> must wait for P3, P4 (2 later checked-in)      -> goes 3rd
//   P3               -> must wait for P4 (1 later checked-in)          -> goes 4th
//   P4               -> nobody later has checked in                    -> goes 1st
//
// So the correct "next" is P4 — the one a naive queueNumber-ascending sort
// would have placed LAST.
describe("Dashboard queue priority matches the real call-next algorithm", () => {
  let clinic: TestClinic;
  let doctor: TestUser;
  const todayStr = getClinicTodayStr();
  const queueDate = getClinicToday();

  const apptTime = (hhmm: string) => new Date(`${todayStr}T${hhmm}:00.000Z`);

  let queueEntryIds: string[] = [];

  beforeAll(async () => {
    clinic = await createClinic();
    await createClinicSettings(clinic.id);
    doctor = await createUser(clinic.id, "DOCTOR", {
      email: "priority-doctor@example.com",
    });

    const checkedInAt = new Date(); // "now" — later than every slot below.
    const slots = ["00:01", "00:02", "00:03", "00:04"];

    for (let i = 0; i < slots.length; i++) {
      const patient = await createPatient(clinic.id, doctor.id, {
        fullName: `Priority Patient ${i + 1}`,
      });

      const visit = await prisma.visit.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          doctorId: doctor.doctorId!,
          visitDate: queueDate,
        },
      });

      await prisma.appointment.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          doctorId: doctor.doctorId!,
          visitId: visit.id,
          appointmentDate: queueDate,
          appointmentTime: apptTime(slots[i]),
          status: "CONFIRMED",
        },
      });

      const entry = await prisma.queueEntry.create({
        data: {
          clinicId: clinic.id,
          visitId: visit.id,
          doctorId: doctor.doctorId!,
          queueDate,
          queueNumber: i + 1,
          status: "WAITING",
          checkedInAt,
        },
      });

      queueEntryIds.push(entry.id);
    }
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  it("selectNextWaiting() picks P4 (id #4), not queueNumber-first P1", async () => {
    const nextId = await selectNextWaiting(
      prisma,
      clinic.id,
      doctor.doctorId!,
      queueDate
    );
    expect(nextId).toBe(queueEntryIds[3]);
  });

  it("GET /queue/status agrees with selectNextWaiting", async () => {
    const token = signAccessToken(doctor as any);
    const res = await request(app)
      .get("/api/v1/queue/status")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.nextWaiting.id).toBe(queueEntryIds[3]);
  });

  it("GET /dashboard/queue agrees with selectNextWaiting (this is the fix)", async () => {
    const token = signAccessToken(doctor as any);
    const res = await request(app)
      .get("/api/v1/dashboard/queue")
      .set(authHeader(token))
      .query({ date: todayStr, doctorId: doctor.doctorId });
    expect(res.status).toBe(200);
    expect(res.body.data.nextWaiting.id).toBe(queueEntryIds[3]);
  });
});
