import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const docsRoot = path.join(root, "docs");
const shouldWrite = process.argv.includes("--write");
const markdownLink =
  /(?<!!)\]\((?<target>\/[^\s)]+\.html(?:[?#][^\s)]*)?)(?<suffix>(?:\s+["'][^"']*["'])?)\)/g;

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

function splitTarget(target) {
  const separator = target.search(/[?#]/);
  return separator === -1
    ? [target, ""]
    : [target.slice(0, separator), target.slice(separator)];
}

async function replacementFor(sourceFile, target) {
  const [pathname, suffix] = splitTarget(target);
  const sourceTarget = path.join(
    docsRoot,
    `${decodeURIComponent(pathname).slice(1, -".html".length)}.md`,
  );
  if (!(await exists(sourceTarget))) return null;

  let relative = path.relative(path.dirname(sourceFile), sourceTarget);
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return `${relative.split(path.sep).join("/")}${suffix}`;
}

let changedFiles = 0;
let changedLinks = 0;

for (const file of await markdownFiles(docsRoot)) {
  const input = await readFile(file, "utf8");
  const lines = input.split("\n");
  let fence = null;
  let fileChanged = false;

  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = lines[index].match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === null ? marker : fence === marker ? null : fence;
      continue;
    }
    if (fence !== null) continue;

    const matches = [...lines[index].matchAll(markdownLink)].reverse();
    for (const match of matches) {
      const replacement = await replacementFor(file, match.groups.target);
      if (replacement === null) continue;

      const targetStart = match.index + match[0].indexOf(match.groups.target);
      lines[index] =
        lines[index].slice(0, targetStart) +
        replacement +
        lines[index].slice(targetStart + match.groups.target.length);
      changedLinks += 1;
      fileChanged = true;
    }
  }

  if (!fileChanged) continue;
  changedFiles += 1;
  if (shouldWrite) await writeFile(file, lines.join("\n"));
}

console.log(
  `${shouldWrite ? "Normalized" : "Would normalize"} ${changedLinks} links in ${changedFiles} files.`,
);
if (!shouldWrite && changedLinks > 0) process.exitCode = 1;
