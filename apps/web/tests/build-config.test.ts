import { expect, it } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import config from "../next.config.mjs";
it("keeps development assets separate from production build/start output", () => {
  expect(config(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");
  expect(config(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
  expect(config(PHASE_PRODUCTION_SERVER).distDir).toBe(".next");
});
it('targets Mumbai without enabling automatic deployment or database migrations',async()=>{
 const {readFile}=await import('node:fs/promises');const settings=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 expect(settings.regions).toEqual(['bom1']);expect(settings.git.deploymentEnabled).toBe(false);expect(settings.installCommand).toBe('npm ci --include=dev && npm run prisma:generate');expect(settings.buildCommand).toBe('npm run build');expect(settings.functions).toBeUndefined();
});
