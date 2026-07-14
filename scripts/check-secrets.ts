import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
]);
const ignoredFiles = new Set(["package-lock.json", "scripts/check-secrets.ts"]);
const allowedExtensions = new Set([
  ".css",
  ".example",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);

const findings: Array<{ file: string; reason: string }> = [];
const detectors = [
  {
    reason: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    reason: "GitHub personal access token",
    pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
  },
  { reason: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  {
    reason: "generic bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/i,
  },
  {
    reason: "PostgreSQL URL with an embedded password",
    pattern: /postgres(?:ql)?:\/\/[^\s:/]+:(?!postgres@|<|\$\{|\{\{)[^\s@]+@/i,
  },
];

function extensionOf(file: string) {
  const basename = file.split("/").at(-1) ?? file;
  const dot = basename.lastIndexOf(".");
  return dot === -1 ? "" : basename.slice(dot);
}

async function visit(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return;

      const absolutePath = resolve(directory, entry.name);
      const workspacePath = relative(root, absolutePath);

      if (entry.isDirectory()) {
        await visit(absolutePath);
        return;
      }

      if (!entry.isFile() || ignoredFiles.has(workspacePath)) return;
      if (
        !allowedExtensions.has(extensionOf(workspacePath)) &&
        entry.name !== ".env.example"
      )
        return;

      const contents = await readFile(absolutePath, "utf8");
      for (const detector of detectors) {
        if (detector.pattern.test(contents))
          findings.push({ file: workspacePath, reason: detector.reason });
      }
    }),
  );
}

async function main() {
  await visit(root);

  if (findings.length > 0) {
    for (const finding of findings)
      console.error(`${finding.file}: possible ${finding.reason}`);
    process.exitCode = 1;
  } else {
    console.log("Secret scan passed.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
