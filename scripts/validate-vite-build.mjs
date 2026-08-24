import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const required = [
  "dist/client/index.html",
  "dist/memolens/index.js",
  "dist/memolens/wrangler.json",
];

for (const file of required) {
  if (!existsSync(file)) {
    throw new Error(`Missing Cloudflare production artifact: ${file}`);
  }
}

const clientAssets = "dist/client/assets";
if (!existsSync(clientAssets) || !readdirSync(clientAssets).length) {
  throw new Error("The Cloudflare client asset directory is empty.");
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const forbiddenClientTokens = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "KPI_PASSWORD",
  "KPI_SESSION_SECRET",
];

const secretValues = [];

if (existsSync(".dev.vars")) {
  const sensitiveNames = new Set([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "KPI_PASSWORD",
    "KPI_SESSION_SECRET",
  ]);

  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;

    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (sensitiveNames.has(name) && value) {
      secretValues.push(value);
    }
  }
}

for (const file of filesUnder("dist/client")) {
  if (!/\.(?:html|js|css|svg|json)$/.test(file)) continue;

  const source = readFileSync(file, "utf8");

  for (const token of forbiddenClientTokens) {
    if (source.includes(token)) {
      throw new Error(
        `Forbidden server credential identifier found in client artifact: ${file}`,
      );
    }
  }

  for (const secret of secretValues) {
    if (source.includes(secret)) {
      throw new Error(
        `Server secret value found in client artifact: ${file}`,
      );
    }
  }
}

process.stdout.write(
  "Validated Cloudflare client and Worker production artifacts.\n",
);
