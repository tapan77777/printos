import { expect, it } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import config from "../next.config.mjs";
it("keeps development assets separate from production build/start output", () => {
  expect(config(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");
  expect(config(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
  expect(config(PHASE_PRODUCTION_SERVER).distDir).toBe(".next");
});
