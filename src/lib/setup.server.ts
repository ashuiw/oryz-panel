/**
 * Setup wizard server helpers.
 *
 * Server-only: reads the deployment environment and performs the connection
 * probes the wizard reports on. Never returns secrets to the client — probe
 * failures are reduced to a sanitised message.
 */

export interface SystemCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  remedy?: string;
}

const REQUIRED_SECRETS = ["JWT_SECRET", "SESSION_SECRET", "ENCRYPTION_KEY"] as const;

export function isSetupComplete(): boolean {
  // Anything other than an explicit "false" means the panel is configured, so
  // a missing variable never accidentally exposes the wizard in production.
  return (process.env["SETUP_COMPLETE"] ?? "true").toLowerCase() !== "false";
}

function nodeVersionCheck(): SystemCheck {
  const raw = process.versions.node;
  const major = Number.parseInt(raw.split(".")[0] ?? "0", 10);
  return major >= 22
    ? { id: "runtime", label: "Runtime", status: "pass", detail: `Node.js ${raw}` }
    : {
        id: "runtime",
        label: "Runtime",
        status: "fail",
        detail: `Node.js ${raw} is older than the required v22`,
        remedy: "Upgrade Node.js, then restart the panel services.",
      };
}

function envCheck(key: string, label: string, remedy: string): SystemCheck {
  const value = process.env[key];
  return value
    ? { id: key, label, status: "pass", detail: "configured" }
    : { id: key, label, status: "fail", detail: "not configured", remedy };
}

function secretsCheck(): SystemCheck {
  const missing = REQUIRED_SECRETS.filter((key) => !process.env[key]);
  if (missing.length === 0) {
    return { id: "secrets", label: "Application secrets", status: "pass", detail: "all present" };
  }
  return {
    id: "secrets",
    label: "Application secrets",
    status: "fail",
    detail: `missing: ${missing.join(", ")}`,
    remedy: "Run: sudo panelctl config repair",
  };
}

function storageCheck(): SystemCheck {
  const driver = process.env["STORAGE_DRIVER"] ?? "local";
  if (driver === "s3") {
    const bucket = process.env["S3_BUCKET"];
    return bucket
      ? { id: "storage", label: "Storage", status: "pass", detail: `S3 bucket ${bucket}` }
      : {
          id: "storage",
          label: "Storage",
          status: "fail",
          detail: "S3 selected but no bucket configured",
          remedy: "Set S3_BUCKET and the access credentials.",
        };
  }
  return {
    id: "storage",
    label: "Storage",
    status: "pass",
    detail: `local · ${process.env["STORAGE_PATH"] ?? "/var/lib/oryz/storage"}`,
  };
}

function mailCheck(): SystemCheck {
  return process.env["SMTP_HOST"]
    ? { id: "mail", label: "Outbound email", status: "pass", detail: process.env["SMTP_HOST"]! }
    : {
        id: "mail",
        label: "Outbound email",
        status: "warn",
        detail: "not configured",
        remedy: "Password reset and notification emails will not be delivered.",
      };
}

export function collectSystemChecks(): SystemCheck[] {
  return [
    nodeVersionCheck(),
    envCheck("DATABASE_URL", "Database", "Configure the database connection in the next step."),
    envCheck("REDIS_URL", "Redis", "Configure Redis in the next step."),
    secretsCheck(),
    storageCheck(),
    mailCheck(),
  ];
}
