import { mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const files = [
  "index.html",
  "app.js",
  "styles.css",
  "manifest.json",
  "sw.js"
];

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });

await Promise.all(
  files.map((file) => copyFile(join(root, file), join(publicDir, file)))
);

console.log("Built public directory for Vercel.");
