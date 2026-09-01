import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("javaguide-web foreground starts the combined bookmark API and VuePress dev server", async () => {
  const script = await readFile(
    new URL("../scripts/javaguide-web", import.meta.url),
    "utf8",
  );

  assert.match(script, /exec node server\/dev\.mjs/);
  assert.doesNotMatch(script, /exec "\$PNPM" docs:dev/);
});

test("ReadingBookmarks does not nest the remove button inside another button", async () => {
  const component = await readFile(
    new URL(
      "../docs/.vuepress/components/ReadingBookmarks.vue",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(
    component,
    /class="bookmark-item"[\s\S]*<\/button>\s*<\/button>/,
  );
  assert.match(component, /role="button"/);
});
