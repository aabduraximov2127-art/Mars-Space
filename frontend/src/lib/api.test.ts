import { AxiosError, AxiosHeaders } from "axios";

import { cleanParams, fieldMessage, parseApiError, toFormData } from "./api";

function axiosError(status: number | null, data?: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response = status === null ? undefined : { status, data, statusText: "", headers: {}, config };
  return new AxiosError("fail", "ERR", config, undefined, response);
}

describe("parseApiError", () => {
  it("reads the backend error envelope", () => {
    const info = parseApiError(
      axiosError(400, { detail: "Ma'lumotlar noto'g'ri.", code: "validation_error", errors: { phone: ["Band."] } }),
    );
    expect(info).toMatchObject({ status: 400, code: "validation_error", detail: "Ma'lumotlar noto'g'ri." });
    expect(info.errors.phone).toEqual(["Band."]);
  });
  it("explains network failures in Uzbek", () => {
    const info = parseApiError(axiosError(null));
    expect(info.code).toBe("network_error");
    expect(info.detail).toMatch(/Internet/);
  });
  it("hides server internals on 5xx without a detail", () => {
    expect(parseApiError(axiosError(500, "<html>")).detail).toMatch(/Serverda kutilmagan xatolik/);
  });
});

describe("helpers", () => {
  it("finds the first nested field message", () => {
    expect(fieldMessage({ records: { 0: { student: ["Begona student."] } } })).toBe("Begona student.");
    expect(fieldMessage(undefined)).toBeUndefined();
  });
  it("drops empty query params", () => {
    expect(cleanParams({ a: "", b: null, c: undefined, d: 0, e: false, f: "x" })).toEqual({ d: 0, e: false, f: "x" });
  });
  it("builds multipart bodies", () => {
    const file = new File(["x"], "a.txt");
    const fd = toFormData({ title: "T", allow_late: true, file, skip: undefined });
    expect(fd.get("title")).toBe("T");
    expect(fd.get("allow_late")).toBe("true");
    expect(fd.get("file")).toBeInstanceOf(File);
    expect(fd.has("skip")).toBe(false);
  });
});
