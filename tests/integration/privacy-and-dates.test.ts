import request from "supertest";
import app from "../helpers/app";
import prisma from "../helpers/prisma";
import {
  createClinic,
  createUser,
  createPatient,
  deleteClinicCascade,
  signAccessToken,
  authHeader,
  TestClinic,
  TestUser,
} from "../helpers/factories";

const CLINICAL = ["diagnosis", "treatment", "prescription"];

function hasClinicalKeys(body: unknown): boolean {
  const text = JSON.stringify(body);
  return CLINICAL.some((key) => text.includes(`"${key}"`));
}

describe("Medical data privacy and calendar-date validation", () => {
  let clinic: TestClinic;
  let doctorA: TestUser;
  let doctorB: TestUser;
  let receptionist: TestUser;
  let patientId: string;
  let visitAId: string;
  let visitBId: string;

  const tokenA = () => signAccessToken(doctorA as any);
  const tokenB = () => signAccessToken(doctorB as any);
  const tokenR = () => signAccessToken(receptionist as any);

  beforeAll(async () => {
    clinic = await createClinic();
    doctorA = await createUser(clinic.id, "DOCTOR");
    doctorB = await createUser(clinic.id, "DOCTOR");
    receptionist = await createUser(clinic.id, "RECEPTIONIST");

    const patient = await createPatient(clinic.id, doctorA.id);
    patientId = patient.id;

    const visitA = await prisma.visit.create({
      data: {
        clinicId: clinic.id,
        patientId,
        doctorId: doctorA.doctorId,
        createdById: doctorA.id,
        updatedById: doctorA.id,
        visitDate: new Date("2026-01-10T00:00:00.000Z"),
        chiefComplaint: "Cough",
        diagnosis: "Bronchitis (A)",
        treatment: "Rest (A)",
        prescription: "Syrup (A)",
      },
    });
    const visitB = await prisma.visit.create({
      data: {
        clinicId: clinic.id,
        patientId,
        doctorId: doctorB.doctorId,
        createdById: doctorB.id,
        updatedById: doctorB.id,
        visitDate: new Date("2026-01-10T00:00:00.000Z"),
        chiefComplaint: "Back pain",
        diagnosis: "Strain (B)",
        treatment: "Physio (B)",
        prescription: "Gel (B)",
      },
    });
    visitAId = visitA.id;
    visitBId = visitB.id;
  });

  afterAll(async () => {
    await deleteClinicCascade(clinic.id);
  });

  describe("receptionist never receives diagnosis / treatment / prescription", () => {
    it("GET /visits", async () => {
      const res = await request(app)
        .get("/api/v1/visits")
        .query({ patientId })
        .set(authHeader(tokenR()));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(hasClinicalKeys(res.body)).toBe(false);
      // the non-clinical parts are still there
      expect(JSON.stringify(res.body)).toContain("Cough");
    });

    it("GET /visits/:id", async () => {
      const res = await request(app)
        .get(`/api/v1/visits/${visitAId}`)
        .set(authHeader(tokenR()));
      expect(res.status).toBe(200);
      expect(hasClinicalKeys(res.body)).toBe(false);
    });

    it("GET /patients/:id/visits", async () => {
      const res = await request(app)
        .get(`/api/v1/patients/${patientId}/visits`)
        .set(authHeader(tokenR()));
      expect(res.status).toBe(200);
      expect(hasClinicalKeys(res.body)).toBe(false);
    });

    it("GET /patients/:id", async () => {
      const res = await request(app)
        .get(`/api/v1/patients/${patientId}`)
        .set(authHeader(tokenR()));
      expect(res.status).toBe(200);
      expect(res.body.data.visits.length).toBe(2);
      expect(hasClinicalKeys(res.body)).toBe(false);
    });

    it("the doctor still sees the clinical fields", async () => {
      const res = await request(app)
        .get(`/api/v1/visits/${visitAId}`)
        .set(authHeader(tokenA()));
      expect(res.status).toBe(200);
      expect(res.body.data.diagnosis).toBe("Bronchitis (A)");
      expect(res.body.data.prescription).toBe("Syrup (A)");
    });
  });

  describe("a doctor never sees another doctor's medical data", () => {
    it("GET /patients/:id embeds only the requesting doctor's visits", async () => {
      const a = await request(app)
        .get(`/api/v1/patients/${patientId}`)
        .set(authHeader(tokenA()));
      expect(a.status).toBe(200);
      expect(a.body.data.visits.map((v: { id: string }) => v.id)).toEqual([
        visitAId,
      ]);
      expect(JSON.stringify(a.body)).not.toContain("Strain (B)");

      const b = await request(app)
        .get(`/api/v1/patients/${patientId}`)
        .set(authHeader(tokenB()));
      expect(b.body.data.visits.map((v: { id: string }) => v.id)).toEqual([
        visitBId,
      ]);
      expect(JSON.stringify(b.body)).not.toContain("Bronchitis (A)");
    });

    it("GET /visits/:id of another doctor is a 404", async () => {
      const res = await request(app)
        .get(`/api/v1/visits/${visitBId}`)
        .set(authHeader(tokenA()));
      expect(res.status).toBe(404);
    });

    it("GET /patients/:id/visits is limited to the requesting doctor", async () => {
      const res = await request(app)
        .get(`/api/v1/patients/${patientId}/visits`)
        .set(authHeader(tokenA()));
      expect(res.status).toBe(200);
      expect(res.body.data.map((v: { id: string }) => v.id)).toEqual([
        visitAId,
      ]);
    });
  });

  describe("impossible calendar dates are rejected, not rolled over", () => {
    const impossible = ["2026-02-31", "2026-02-30", "2026-04-31", "2027-02-29"];

    it.each(impossible)("GET /queue?date=%s -> 400", async (date) => {
      const res = await request(app)
        .get("/api/v1/queue")
        .query({ date })
        .set(authHeader(tokenA()));
      expect(res.status).toBe(400);
    });

    it.each(impossible)("GET /visits?date=%s -> 400", async (date) => {
      const res = await request(app)
        .get("/api/v1/visits")
        .query({ date })
        .set(authHeader(tokenA()));
      expect(res.status).toBe(400);
    });

    it("GET /appointments?fromDate=2026-02-30 -> 400", async () => {
      const res = await request(app)
        .get("/api/v1/appointments")
        .query({ fromDate: "2026-02-30" })
        .set(authHeader(tokenA()));
      expect(res.status).toBe(400);
    });

    it("a real leap day is accepted", async () => {
      const res = await request(app)
        .get("/api/v1/visits")
        .query({ date: "2028-02-29" })
        .set(authHeader(tokenA()));
      expect(res.status).toBe(200);
    });

    it("patient date of birth 1995-02-31 is rejected", async () => {
      const res = await request(app)
        .post("/api/v1/patients")
        .set(authHeader(tokenR()))
        .send({
          fullName: "Bad Date",
          phone: "+15550001234",
          dateOfBirth: "1995-02-31",
          gender: "MALE",
        });
      expect(res.status).toBe(400);
    });
  });
});
