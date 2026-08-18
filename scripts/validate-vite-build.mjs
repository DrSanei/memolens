import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const required = ["dist/index.html", "dist/404.html", "dist/favicon.svg"];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`Missing production artifact: ${file}`);
}

const assetDirectory = "dist/assets";
if (!existsSync(assetDirectory) || !readdirSync(assetDirectory).length) {
  throw new Error("The Vite asset directory is empty.");
}

const forbidden = [
  "SERVICE_ROLE_KEY",
];

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

for (const file of filesUnder("dist")) {
  if (!/\.(?:html|js|css|svg|json)$/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) {
      throw new Error(`Forbidden server credential token found in ${file}`);
    }
  }
}

process.stdout.write("Validated Vite production artifact.\n");
