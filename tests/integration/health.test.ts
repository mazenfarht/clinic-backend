import request from "supertest";
import app from "../helpers/app";

describe("GET /api/v1/health", () => {
  it("returns 200 with service health payload", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ status: "healthy" });
    expect(typeof res.body.data.uptime).toBe("number");
    expect(typeof res.body.data.timestamp).toBe("string");
  });
});
