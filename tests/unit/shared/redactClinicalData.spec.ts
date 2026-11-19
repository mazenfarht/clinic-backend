import {
  redactClinicalDataForReception,
  stripClinicalFields,
} from "../../../src/middleware/redactClinicalData.middleware";

describe("stripClinicalFields", () => {
  it("removes diagnosis, treatment and prescription at any depth", () => {
    const input = {
      id: "p1",
      visits: [
        {
          id: "v1",
          chiefComplaint: "Cough",
          diagnosis: "Bronchitis",
          nested: { treatment: "Rest", keep: 1 },
        },
      ],
      visit: { prescription: "Syrup", notes: "ok" },
    };

    const out = stripClinicalFields(input);

    expect(JSON.stringify(out)).not.toMatch(/diagnosis|treatment|prescription/);
    expect(out.visits[0].chiefComplaint).toBe("Cough");
    expect(out.visits[0].nested.keep).toBe(1);
    expect(out.visit.notes).toBe("ok");
  });

  it("does not mutate its input", () => {
    const input = { diagnosis: "x", id: 1 };
    stripClinicalFields(input);
    expect(input.diagnosis).toBe("x");
  });

  it("leaves Dates, null and primitives untouched", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const out = stripClinicalFields({ date, nothing: null, n: 3, s: "x" });
    expect(out.date).toBe(date);
    expect(out.nothing).toBeNull();
    expect(out.n).toBe(3);
  });
});

describe("redactClinicalDataForReception middleware", () => {
  function run(role: string | undefined) {
    const sent: unknown[] = [];
    const res: any = {
      locals: {},
      json: jest.fn((body: unknown) => {
        sent.push(body);
        return res;
      }),
    };
    const req: any = { user: role ? { role } : undefined };
    const next = jest.fn();

    redactClinicalDataForReception(req, res, next);
    res.json({ data: { diagnosis: "secret", chiefComplaint: "Cough" } });
    return { sent, next };
  }

  it("strips clinical fields for a RECEPTIONIST", () => {
    const { sent, next } = run("RECEPTIONIST");
    expect(next).toHaveBeenCalledWith();
    expect(sent[0]).toEqual({ data: { chiefComplaint: "Cough" } });
  });

  it("does not touch responses for a DOCTOR", () => {
    const { sent } = run("DOCTOR");
    expect(sent[0]).toEqual({
      data: { diagnosis: "secret", chiefComplaint: "Cough" },
    });
  });

  it("is a no-op when there is no user", () => {
    const { sent, next } = run(undefined);
    expect(next).toHaveBeenCalledWith();
    expect((sent[0] as any).data.diagnosis).toBe("secret");
  });

  it("can be mounted twice without double-wrapping", () => {
    const res: any = { locals: {}, json: jest.fn() };
    const req: any = { user: { role: "RECEPTIONIST" } };
    redactClinicalDataForReception(req, res, jest.fn());
    const wrappedOnce = res.json;
    redactClinicalDataForReception(req, res, jest.fn());
    expect(res.json).toBe(wrappedOnce);
  });
});
