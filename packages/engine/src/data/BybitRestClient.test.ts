import { beforeAll, describe, expect, it } from "vitest";

let ErrorCode: typeof import("@obsidra/shared").ErrorCode;
let parseBybitEnvelope: typeof import("./BybitRestClient.js").parseBybitEnvelope;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/obsidra";
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.DASHBOARD_PASSWORD = "test-password";
  ({ ErrorCode } = await import("@obsidra/shared"));
  ({ parseBybitEnvelope } = await import("./BybitRestClient.js"));
});

function response(status: number, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
  };
}

describe("parseBybitEnvelope", () => {
  it("parses a normal Bybit response", () => {
    const parsed = parseBybitEnvelope<{ value: number }>(
      response(200),
      '{"retCode":0,"retMsg":"OK","result":{"value":1}}',
      "GET",
      "/v5/test",
    );
    expect(parsed.result.value).toBe(1);
  });

  it("reports empty forbidden responses as permanent errors", () => {
    expect(() => parseBybitEnvelope(response(403), "", "GET", "/v5/position/list"))
      .toThrow(expect.objectContaining({
        code: ErrorCode.EXCHANGE_PERMANENT,
        message: expect.stringContaining("empty response"),
        context: expect.objectContaining({ httpStatus: 403 }),
      }));
  });

  it("reports non-JSON gateway responses without exposing their body", () => {
    expect(() => parseBybitEnvelope(response(502, "text/html"), "<html>gateway</html>", "GET", "/v5/position/list"))
      .toThrow(expect.objectContaining({
        message: expect.stringContaining("non-JSON response"),
        context: expect.objectContaining({ httpStatus: 502, contentType: "text/html", responseBytes: 20 }),
      }));
  });
});
