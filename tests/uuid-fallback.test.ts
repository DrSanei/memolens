import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/state/context";
import { createUuid } from "../src/utils/uuid";

afterEach(() => vi.unstubAllGlobals());

describe("UUID generation when randomUUID is unavailable", () => {
  it("initializes the app using secure random bytes", () => {
    let seed = 0;
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = seed++ & 0xff;
        return bytes;
      },
    });

    const state = createInitialState();
    expect(state.routines[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(state.participantCode).toMatch(/^MEM-\d{8}-[0-9A-F]{8}$/);
    expect(createUuid()).not.toBe(state.routines[0].id);
  });

  it("fails clearly if no secure random source is available", () => {
    vi.stubGlobal("crypto", {});
    expect(createUuid).toThrow("Secure random number generation is unavailable");
  });
});
