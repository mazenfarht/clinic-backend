import { ApiResponse } from "../../../src/shared/utils/apiResponse";
import { HttpStatus } from "../../../src/shared/errors/AppError";

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("ApiResponse", () => {
  it("ok() responds with 200 and success envelope", () => {
    const res = mockRes();
    ApiResponse.ok(res, { foo: "bar" }, "All good");
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "All good",
      data: { foo: "bar" },
    });
  });

  it("created() responds with 201", () => {
    const res = mockRes();
    ApiResponse.created(res, { id: "1" });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { id: "1" } })
    );
  });

  it("noContent() responds with 204 and no body", () => {
    const res = mockRes();
    ApiResponse.noContent(res);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    expect(res.send).toHaveBeenCalledWith();
  });

  it("paginated() includes meta block", () => {
    const res = mockRes();
    const meta = ApiResponse.buildPaginationMeta(25, 2, 10);
    ApiResponse.paginated(res, [1, 2, 3], meta);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [1, 2, 3], meta })
    );
  });

  it("error() omits empty errors array and stack when absent", () => {
    const res = mockRes();
    ApiResponse.error(res, HttpStatus.BAD_REQUEST, "Invalid");
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid",
    });
  });

  it("error() includes errors when provided", () => {
    const res = mockRes();
    ApiResponse.error(res, HttpStatus.BAD_REQUEST, "Invalid", [
      { field: "x", message: "required" },
    ]);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid",
      errors: [{ field: "x", message: "required" }],
    });
  });

  describe("buildPaginationMeta", () => {
    it("computes totalPages and next/prev flags", () => {
      const meta = ApiResponse.buildPaginationMeta(25, 1, 10);
      expect(meta).toEqual({
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: false,
      });
    });

    it("hasPrevPage true and hasNextPage false on last page", () => {
      const meta = ApiResponse.buildPaginationMeta(25, 3, 10);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPrevPage).toBe(true);
    });
  });
});
