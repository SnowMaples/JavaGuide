import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const docsRoot = path.join(root, "docs");
const markdownLink = /(?<!!)\]\((?<target>[^\s)]+)(?:\s+["'][^"']*["'])?\)/g;
const violations = [];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(file);
      return entry.isFile() &&
        entry.name.endsWith(".md") &&
        !entry.name.endsWith(".snippet.md") &&
        entry.name !== "TODO.md"
        ? [file]
        : [];
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

function pathnameOf(target) {
  return target.split(/[?#]/, 1)[0];
}

for (const file of await markdownFiles(docsRoot)) {
  const lines = (await readFile(file, "utf8")).split("\n");
  let fence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = lines[index].match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === null ? marker : fence === marker ? null : fence;
      continue;
    }
    if (fence !== null) continue;

    for (const match of lines[index].matchAll(markdownLink)) {
      const target = match.groups.target;
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
      const pathname = decodeURIComponent(pathnameOf(target));

      if (pathname.startsWith("/") && pathname.endsWith(".html")) {
        const sourceTarget = path.join(
          docsRoot,
          `${pathname.slice(1, -".html".length)}.md`,
        );
        if (await exists(sourceTarget)) {
          violations.push(
            `${path.relative(root, file)}:${index + 1}: local HTML link ${target}`,
          );
        }
        continue;
      }

      if (!pathname.endsWith(".md") || pathname.startsWith("/")) continue;
      const sourceTarget = path.resolve(path.dirname(file), pathname);
      if (!sourceTarget.startsWith(`${docsRoot}${path.sep}`)) continue;
      if (!(await exists(sourceTarget))) {
        violations.push(
          `${path.relative(root, file)}:${index + 1}: missing Markdown target ${target}`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("All local Markdown document links resolve to source files.");
