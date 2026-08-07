import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { collectSystemChecks, isSetupComplete, type SystemCheck } from "./setup.server";

/**
 * Setup wizard RPC.
 *
 * Every handler refuses to run once setup is complete, so an installed panel
 * cannot be reconfigured through this surface even if the route is called
 * directly. Secrets are never accepted from or returned to the browser.
 */

function assertWizardOpen() {
  if (isSetupComplete()) {
    throw new Response("Setup has already been completed", { status: 404 });
  }
}

export interface SetupStatus {
  complete: boolean;
  checks: SystemCheck[];
  blocking: number;
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(async (): Promise<SetupStatus> => {
  const complete = isSetupComplete();
  const checks = complete ? [] : collectSystemChecks();
  return {
    complete,
    checks,
    blocking: checks.filter((check) => check.status === "fail").length,
  };
});

const connectionSchema = z.object({
  target: z.enum(["database", "redis", "storage", "smtp"]),
});

export const testConnection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => connectionSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    assertWizardOpen();

    // Probes read the configuration already written to the environment rather
    // than credentials posted from the browser, so nothing sensitive crosses
    // the wire and a probe can never be used to scan the internal network.
    const configured: Record<typeof data.target, string | undefined> = {
      database: process.env["DATABASE_URL"],
      redis: process.env["REDIS_URL"],
      storage: process.env["STORAGE_PATH"] ?? process.env["S3_BUCKET"],
      smtp: process.env["SMTP_HOST"],
    };

    const value = configured[data.target];
    if (!value) {
      return { ok: false, message: `${data.target} is not configured yet` };
    }
    return { ok: true, message: `${data.target} configuration present` };
  });

const finalizeSchema = z.object({
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(120),
});

export const finalizeSetup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => finalizeSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    assertWizardOpen();
    // Writing oryz.env and flipping SETUP_COMPLETE requires root, which the
    // service account deliberately does not have. The wizard therefore hands
    // the last step back to the CLI.
    return {
      ok: true,
      message: `Run: sudo panelctl config set ADMIN_EMAIL ${data.adminEmail} && sudo panelctl config set SETUP_COMPLETE true`,
    };
  });
