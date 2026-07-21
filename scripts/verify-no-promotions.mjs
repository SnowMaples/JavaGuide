import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const docsRoot = path.join(root, "docs");
const commercialSnippets = [
  "small-advertisement",
  "planet",
  "planet2",
  "yuanma",
  "article-header",
  "rag-project",
];
const retainedLandingPages = new Set([
  "about-the-author/zhishixingqiu-two-years.md",
  "zhuanlan/README.md",
  "zhuanlan/back-end-interview-high-frequency-system-design-and-scenario-questions.md",
  "zhuanlan/handwritten-rpc-framework.md",
  "zhuanlan/interview-guide.md",
  "zhuanlan/java-mian-shi-zhi-bei.md",
  "zhuanlan/source-code-reading.md",
]);
const violations = [];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(file);
      return entry.isFile() && entry.name.endsWith(".md") ? [file] : [];
    }),
  );

  return files.flat();
}

function addViolation(file, message) {
  violations.push(`${path.relative(root, file)}: ${message}`);
}

for (const file of await markdownFiles(docsRoot)) {
  const relativePath = path.relative(docsRoot, file);
  const content = await readFile(file, "utf8");

  for (const snippet of commercialSnippets) {
    if (content.includes(`@${snippet}.snippet.md`)) {
      addViolation(file, `contains ${snippet} promotion include`);
    }
  }

  if (!retainedLandingPages.has(relativePath)) {
    if (
      /知识星球|t\.zsxq\.com|zhishixingqiu-two-years|xingqiu\.png|javamianshizhibei|\/zhuanlan\/(?:java-mian-shi-zhi-bei|source-code-reading|handwritten-rpc-framework|back-end-interview-high-frequency-system-design-and-scenario-questions|interview-guide)/i.test(
        content,
      )
    ) {
      addViolation(file, "contains a public commercial promotion reference");
    }
  }
}

for (const file of [
  path.join(docsRoot, "README.md"),
  path.join(docsRoot, ".vuepress", "navbar.ts"),
  path.join(docsRoot, ".vuepress", "sidebar", "about-the-author.ts"),
  path.join(docsRoot, ".vuepress", "sidebar", "index.ts"),
  path.join(docsRoot, ".vuepress", "styles", "index.scss"),
]) {
  const content = await readFile(file, "utf8");
  if (
    /知识星球|zhishixingqiu-two-years|article-promo-image|\/zhuanlan\/|interview\.javaguide\.cn/i.test(
      content,
    )
  ) {
    addViolation(file, "contains a public commercial promotion entry or style");
  }
}

if (violations.length > 0) {
  console.error(
    "Commercial promotion references remain:\n" + violations.join("\n"),
  );
  process.exit(1);
}
