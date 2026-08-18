import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { researchLogger } from "../src/services/researchLogger";

vi.stubEnv("VITE_SUPABASE_URL", "https://memolens-test.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-anon-key");
vi.stubEnv("VITE_RESEARCH_TRANSPORT", "direct");

function blockUnexpectedNetwork() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected network request in unit test.");
    }),
  );
}

blockUnexpectedNetwork();

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

Object.defineProperty(window, "IntersectionObserver", {
  configurable: true,
  value: IntersectionObserverMock,
});

Object.defineProperty(window, "isSecureContext", {
  configurable: true,
  value: true,
});

Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

afterEach(() => {
  cleanup();
  researchLogger.resetForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  blockUnexpectedNetwork();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
});
