import { describe, expect, it } from "vitest";
import { ApiKeyManager } from "./ApiKeyManager.js";

describe("ApiKeyManager", () => {
  it("trims copied API credentials before signing", () => {
    const manager = new ApiKeyManager(" demo-key \n", "\tdemo-secret ", "test-master-secret-32-characters");

    const credentials = manager.withCredentials((apiKey, apiSecret) => ({ apiKey, apiSecret }));

    expect(credentials).toEqual({ apiKey: "demo-key", apiSecret: "demo-secret" });
  });
});
