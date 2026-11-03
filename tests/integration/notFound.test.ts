import request from "supertest";
import app from "../helpers/app";

describe("Unknown routes", () => {
  it("returns a 404 envelope for an undefined route", async () => {
    const res = await request(app).get("/api/v1/this-route-does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      message: expect.stringContaining("Route not found"),
    });
  });

  it("returns 400 for malformed JSON bodies", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
