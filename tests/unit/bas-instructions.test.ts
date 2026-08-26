import { expect, test } from "vitest";
import { getSimplerBasInstructionSteps } from "@/lib/domain/bas/instructions";

test("Simpler BAS instructions contain only G1, 1A and 1B", () => {
  const instructions = getSimplerBasInstructionSteps().join(" ");

  expect(instructions).toContain("G1");
  expect(instructions).toContain("1A");
  expect(instructions).toContain("1B");
  expect(instructions).toMatch(/G1.*(含 GST|包含 GST)/);
  expect(instructions).not.toContain("G10");
  expect(instructions).not.toContain("G11");
});
