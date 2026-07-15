import { describe, expect, it } from "vitest";
import { parseConfigJson } from "./config-json.js";

describe("parseConfigJson", () => {
  it("rejects malformed and contract-invalid configuration", () => {
    expect(() => parseConfigJson("{")).toThrow();
    expect(() => parseConfigJson(JSON.stringify({ brand: {} }))).toThrow();
  });
});
