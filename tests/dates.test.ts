import { describe, expect, it } from "vitest";
import { addMonths } from "../src/domain/dates";

describe("addMonths", () => {
  it("avanza y retrocede cruzando el año", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", -12)).toBe("2025-11");
  });
});
