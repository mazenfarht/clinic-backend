import request from "supertest";
import { randomUUID } from "crypto";
import app from "../helpers/app";
import prisma from "../helpers/prisma";
import {
  createClinic,
  createUser,
  deleteClinicCascade,
  signAccessToken,
  authHeader,
  TestClinic,
} from "../helpers/factories";

const PATIENTS = "/api/v1/patients";

describe("Automatic medical record numbers (MRN)", () => {
  const clinics: TestClinic[] = [];
  let phoneSeq = 0;

  // Every test gets its own clinic, so every sequence starts at MRN-000001.
  async function setup() {
    const clinic = await createClinic();
    clinics.push(clinic);
    const doctor = await createUser(clinic.id, "DOCTOR");
    return { clinic, token: signAccessToken(doctor as any) };
  }

  const uniquePhone = () =>
    `+2010${String(Date.now()).slice(-6)}${String(++phoneSeq).padStart(2, "0")}`;

  function create(token: string, extra: Record<string, unknown> = {}) {
    return request(app)
      .post(PATIENTS)
      .set(authHeader(token))
      .send({
        fullName: "Auto Patient",
        phone: uniquePhone(),
        dateOfBirth: "1990-01-01",
        gender: "MALE",
        ...extra,
      });
  }

  afterAll(async () => {
    for (const c of clinics) await deleteClinicCascade(c.id);
  });

  it("generates MRN-000001, then MRN-000002, when no mrn is sent", async () => {
    const { token } = await setup();
    const a = await create(token);
    const b = await create(token);
    expect(a.status).toBe(201);
    expect(a.body.data.mrn).toBe("MRN-000001");
    expect(b.body.data.mrn).toBe("MRN-000002");
  });

  it("treats an empty or blank mrn like a missing one", async () => {
    const { token } = await setup();
    const a = await create(token, { mrn: "" });
    const b = await create(token, { mrn: "   " });
    expect(a.status).toBe(201);
    expect(a.body.data.mrn).toBe("MRN-000001");
    expect(b.body.data.mrn).toBe("MRN-000002");
  });

  it("still accepts a number typed by the user, and stores it as is", async () => {
    const { token } = await setup();
    const res = await create(token, { mrn: "PAPER-77" });
    expect(res.status).toBe(201);
    expect(res.body.data.mrn).toBe("PAPER-77");
  });

  it("a typed number does not use up an automatic one", async () => {
    const { token } = await setup();
    await create(token, { mrn: "PAPER-77" });
    const auto = await create(token);
    expect(auto.body.data.mrn).toBe("MRN-000001");
  });

  it("rejects a typed number that is already taken (409) and invalid characters (400)", async () => {
    const { token } = await setup();
    await create(token, { mrn: "PAPER-77" });
    expect((await create(token, { mrn: "PAPER-77" })).status).toBe(409);
    expect((await create(token, { mrn: "has spaces" })).status).toBe(400);
  });

  it("skips an automatic number someone already typed by hand", async () => {
    const { token } = await setup();
    expect((await create(token)).body.data.mrn).toBe("MRN-000001");
    await create(token, { mrn: "MRN-000002" }); // typed manually
    const next = await create(token);
    expect(next.status).toBe(201);
    expect(next.body.data.mrn).toBe("MRN-000003");
  });

  it("odd manual MRNs (MRN-OLD1, MRN-5) no longer break generation", async () => {
    const { token } = await setup();
    await create(token, { mrn: "MRN-OLD1" });
    await create(token, { mrn: "MRN-5" });
    await create(token, { mrn: "A-77" });
    const a = await create(token);
    const b = await create(token);
    expect(a.status).toBe(201);
    expect(a.body.data.mrn).toBe("MRN-000001");
    expect(b.body.data.mrn).toBe("MRN-000002");
  });

  it("each clinic has its own sequence", async () => {
    const a = await setup();
    const b = await setup();
    await create(a.token);
    await create(a.token);
    const first = await create(b.token);
    expect(first.body.data.mrn).toBe("MRN-000001");
  });

  it("never reuses the number of a deleted patient", async () => {
    const { token } = await setup();
    const first = await create(token);
    await request(app)
      .delete(`${PATIENTS}/${first.body.data.id}`)
      .set(authHeader(token));
    const next = await create(token);
    expect(next.body.data.mrn).toBe("MRN-000002");
  });

  it("gives different numbers to simultaneous requests (no duplicates)", async () => {
    const { token, clinic } = await setup();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => create(token))
    );

    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
    const mrns = results.map((r) => r.body.data.mrn as string).sort();
    const expected = Array.from(
      { length: 12 },
      (_, i) => `MRN-${String(i + 1).padStart(6, "0")}`
    );
    expect(mrns).toEqual(expected);

    const row = await prisma.clinic.findUnique({ where: { id: clinic.id } });
    expect(row?.nextMrn).toBe(13);
  });

  it("a rejected request does not burn a number", async () => {
    const { token } = await setup();
    const phone = uniquePhone();
    expect((await create(token, { phone })).body.data.mrn).toBe("MRN-000001");
    expect((await create(token, { phone })).status).toBe(409); // duplicate phone
    expect((await create(token)).body.data.mrn).toBe("MRN-000002");
  });

  it("rolls the counter back if the patient cannot be saved", async () => {
    const { token, clinic } = await setup();
    const real = prisma.$transaction.bind(prisma);

    jest
      .spyOn(prisma, "$transaction")
      .mockImplementationOnce(((fn: (tx: unknown) => unknown) =>
        real(async (tx: any) =>
          fn(
            new Proxy(tx, {
              get(target, prop) {
                if (prop === "patient") {
                  return new Proxy(target.patient, {
                    get(t: any, p) {
                      if (p === "create") {
                        return async () => {
                          throw new Error("simulated failure after allocating");
                        };
                      }
                      return (...a: unknown[]) => t[p](...a);
                    },
                  });
                }
                return target[prop];
              },
            })
          )
        )) as any);

    const failed = await create(token);
    expect(failed.status).toBe(500);

    const row = await prisma.clinic.findUnique({ where: { id: clinic.id } });
    expect(row?.nextMrn).toBe(1); // counter went back with the rollback
    expect((await create(token)).body.data.mrn).toBe("MRN-000001");
  });

  it("does not change the clinic's updatedAt when patients are created", async () => {
    const { token, clinic } = await setup();
    const before = await prisma.clinic.findUnique({ where: { id: clinic.id } });
    await create(token);
    await create(token);
    const after = await prisma.clinic.findUnique({ where: { id: clinic.id } });
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("public registration draws from the same sequence as staff", async () => {
    const { token, clinic } = await setup();
    expect((await create(token)).body.data.mrn).toBe("MRN-000001");

    const pub = await request(app)
      .post(`/api/v1/public/clinics/${clinic.id}/patients/register`)
      .send({
        fullName: "Online Person",
        phone: uniquePhone(),
        dateOfBirth: "1991-02-03",
        gender: "FEMALE",
      });
    expect(pub.status).toBe(201);
    const stored = await prisma.patient.findUnique({
      where: { id: pub.body.data.patientId },
    });
    expect(stored?.mrn).toBe("MRN-000002");

    expect((await create(token)).body.data.mrn).toBe("MRN-000003");
  });

  it("public registrations at the same moment get different numbers", async () => {
    const { clinic } = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app)
          .post(`/api/v1/public/clinics/${clinic.id}/patients/register`)
          .send({
            fullName: "Parallel Person",
            phone: uniquePhone(),
            dateOfBirth: "1991-02-03",
            gender: "MALE",
          })
      )
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));

    const rows = await prisma.patient.findMany({
      where: { clinicId: clinic.id },
      select: { mrn: true },
    });
    expect(new Set(rows.map((r) => r.mrn)).size).toBe(6);
  });

  it("the number cannot be changed afterwards", async () => {
    const { token } = await setup();
    const created = await create(token);
    const res = await request(app)
      .patch(`${PATIENTS}/${created.body.data.id}`)
      .set(authHeader(token))
      .send({ mrn: "HACKED-1", notes: "changed" });
    // unknown keys are ignored: the number stays
    expect(res.status).toBe(200);
    expect(res.body.data.mrn).toBe("MRN-000001");
  });

  it("generated numbers fit the MRN rules", async () => {
    const { token } = await setup();
    const res = await create(token);
    expect(res.body.data.mrn).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(res.body.data.mrn.length).toBeLessThanOrEqual(50);
  });
});
