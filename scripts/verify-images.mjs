import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(root, "dist");
const checkNetwork = process.argv.includes("--network");
const expectedReferrerPolicy = "same-origin";

async function files(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return files(file, extension);
      return entry.isFile() && entry.name.endsWith(extension) ? [file] : [];
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

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, codePoint) =>
      String.fromCodePoint(Number(codePoint)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    );
}

function attributes(tag) {
  return new Map(
    [...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(
      ([, name, , value]) => [name.toLowerCase(), decodeHtml(value)],
    ),
  );
}

async function auditBuild() {
  const htmlFiles = await files(distRoot, ".html");
  const externalImages = new Set();
  const violations = [];
  let imageReferences = 0;

  for (const file of htmlFiles) {
    const source = await readFile(file, "utf8");
    const referrerMeta = [...source.matchAll(/<meta\b[^>]*>/gi)]
      .map(([tag]) => attributes(tag))
      .find((attrs) => attrs.get("name")?.toLowerCase() === "referrer");

    if (referrerMeta?.get("content") !== expectedReferrerPolicy) {
      violations.push(
        `${path.relative(root, file)}: missing referrer policy ${expectedReferrerPolicy}`,
      );
    }

    for (const [tag] of source.matchAll(/<img\b[^>]*>/gi)) {
      const src = attributes(tag).get("src");
      if (!src) continue;
      imageReferences += 1;

      if (/^https?:\/\//i.test(src)) {
        externalImages.add(src);
        continue;
      }
      if (/^(?:data:|blob:)/i.test(src)) continue;

      const pathname = decodeURIComponent(src.split(/[?#]/, 1)[0]);
      const target = pathname.startsWith("/")
        ? path.join(distRoot, pathname.slice(1))
        : path.resolve(path.dirname(file), pathname);
      if (!(await exists(target))) {
        violations.push(
          `${path.relative(root, file)}: missing local image ${src}`,
        );
      }
    }
  }

  return { htmlFiles, externalImages, imageReferences, violations };
}

async function auditNetwork(urls) {
  const failures = [];
  let cursor = 0;
  const values = [...urls];

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      const url = values[index];

      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status < 200 || response.status >= 400) {
          failures.push(`${response.status} ${url}`);
        }
      } catch (error) {
        failures.push(`${error.name} ${url}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 40 }, worker));
  return failures;
}

if (!(await exists(distRoot))) {
  console.error("dist does not exist; run pnpm docs:build first.");
  process.exit(1);
}

const result = await auditBuild();
if (checkNetwork) {
  result.violations.push(...(await auditNetwork(result.externalImages)));
}

if (result.violations.length > 0) {
  console.error(result.violations.slice(0, 40).join("\n"));
  if (result.violations.length > 40) {
    console.error(`... ${result.violations.length - 40} more violations`);
  }
  process.exit(1);
}

console.log(
  `Verified ${result.imageReferences} image references across ${result.htmlFiles.length} HTML files (${result.externalImages.size} unique external images${checkNetwork ? ", network checked" : ""}).`,
);
