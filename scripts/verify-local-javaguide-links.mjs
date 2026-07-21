import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const docsRoot = path.join(root, "docs");
const absoluteSiteUrl =
  /https?:\/\/(?:www\.)?javaguide\.cn(?:\/[^\s<>"'`)\]]*)?/g;
const violations = [];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(file);
      return entry.isFile() && entry.name.endsWith(".md") ? [file] : [];
    }),
  );

  return nested.flat();
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolvesToLocalDocument(rawUrl) {
  const url = new URL(rawUrl);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") return exists(path.join(docsRoot, "README.md"));

  if (pathname.endsWith(".html")) {
    const sourcePath = `${pathname.slice(1, -".html".length)}.md`;
    return exists(path.join(docsRoot, sourcePath));
  }

  if (pathname.endsWith("/")) {
    return exists(path.join(docsRoot, pathname.slice(1), "README.md"));
  }

  return false;
}

for (const file of await markdownFiles(docsRoot)) {
  const content = await readFile(file, "utf8");
  const urls = content.match(absoluteSiteUrl) ?? [];

  for (const rawUrl of urls) {
    if (await resolvesToLocalDocument(rawUrl)) {
      violations.push(`${path.relative(root, file)}: ${rawUrl}`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    "Absolute JavaGuide links that resolve to local documents remain:\n" +
      violations.join("\n"),
  );
  process.exit(1);
}
