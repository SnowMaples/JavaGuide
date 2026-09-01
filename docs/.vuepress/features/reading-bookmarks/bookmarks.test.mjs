import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  API_ENDPOINT,
  MAX_BOOKMARKS,
  NAVBAR_TARGET_SELECTOR,
  clearServerBookmarks,
  deleteServerBookmark,
  fetchServerBookmarks,
  getReadingTags,
  hydrateBookmarkTags,
  isReadablePage,
  markServerMigrationDone,
  normalizeBookmarks,
  saveServerBookmark,
  SERVER_MIGRATION_KEY,
  shouldMigrateLocalBookmarks,
  upsertBookmark,
} from "./bookmarks.mjs";

test("upsertBookmark updates by path, sorts newest first, and caps the list", () => {
  const base = Array.from({ length: MAX_BOOKMARKS }, (_, index) => ({
    path: `/article-${index}.html`,
    fullPath: `/article-${index}.html`,
    title: `Article ${index}`,
    tags: [],
    headingId: null,
    headingText: "顶部",
    scrollY: 0,
    progress: 0,
    updatedAt: index + 1,
  }));

  const updated = upsertBookmark(base, {
    path: "/article-10.html",
    fullPath: "/article-10.html#hash",
    title: "Updated article",
    tags: ["Java"],
    headingId: "hash",
    headingText: "章节",
    scrollY: 1200,
    progress: 42,
    updatedAt: 999,
  });

  assert.equal(updated.length, MAX_BOOKMARKS);
  assert.equal(updated[0].path, "/article-10.html");
  assert.equal(updated[0].title, "Updated article");
  assert.equal(updated[0].headingText, "章节");
  assert.equal(
    updated.filter((item) => item.path === "/article-10.html").length,
    1,
  );
});

test("upsertBookmark preserves existing tags when an update has no tags", () => {
  const updated = upsertBookmark(
    [
      {
        path: "/java/basis/java-basic-questions-01.html",
        fullPath: "/java/basis/java-basic-questions-01.html#old",
        title: "Java基础常见面试题总结(上)",
        tags: ["Java基础"],
        headingId: "old",
        headingText: "旧章节",
        scrollY: 100,
        progress: 1,
        updatedAt: 1,
      },
    ],
    {
      path: "/java/basis/java-basic-questions-01.html",
      fullPath: "/java/basis/java-basic-questions-01.html#new",
      title: "Java基础常见面试题总结(上)",
      tags: [],
      headingId: "new",
      headingText: "新章节",
      scrollY: 1000,
      progress: 20,
      updatedAt: 2,
    },
  );

  assert.deepEqual(updated[0].tags, ["Java基础"]);
  assert.equal(updated[0].headingText, "新章节");
});

test("hydrateBookmarkTags restores missing tags from route meta", () => {
  const hydrated = hydrateBookmarkTags(
    [
      {
        path: "/java/basis/java-basic-questions-01.html",
        fullPath: "/java/basis/java-basic-questions-01.html#new",
        title: "Java基础常见面试题总结(上)",
        tags: [],
        headingId: "new",
        headingText: "新章节",
        scrollY: 1000,
        progress: 20,
        updatedAt: 2,
      },
      {
        path: "/cs-basics/operating-system/zero-copy.html",
        fullPath: "/cs-basics/operating-system/zero-copy.html",
        title: "零拷贝详解",
        tags: ["保留标签"],
        headingId: null,
        headingText: "",
        scrollY: 0,
        progress: 0,
        updatedAt: 1,
      },
    ],
    {
      "/java/basis/java-basic-questions-01.html": {
        meta: { tag: ["Java基础"], category: ["Java"] },
      },
      "/cs-basics/operating-system/zero-copy.html": {
        meta: { tag: ["操作系统"] },
      },
    },
  );

  assert.deepEqual(hydrated[0].tags, ["Java基础"]);
  assert.deepEqual(hydrated[1].tags, ["保留标签"]);
});

test("getReadingTags prefers tags and falls back to category", () => {
  assert.deepEqual(
    getReadingTags({
      category: ["Java"],
      tag: ["集合", "源码"],
    }),
    ["集合", "源码"],
  );

  assert.deepEqual(getReadingTags({ category: "计算机基础" }), ["计算机基础"]);
});

test("isReadablePage excludes non-reading pages", () => {
  assert.equal(isReadablePage({ path: "/404.html", frontmatter: {} }), false);
  assert.equal(
    isReadablePage({
      path: "/tag/java/",
      frontmatter: { blog: { type: "category" } },
    }),
    false,
  );
  assert.equal(
    isReadablePage({ path: "/java/", frontmatter: { article: false } }),
    false,
  );
  assert.equal(
    isReadablePage({
      path: "/java/basis/java-basic-questions-01.html",
      frontmatter: {},
    }),
    true,
  );
});

test("navbar target selector is stable for desktop teleport", () => {
  assert.equal(NAVBAR_TARGET_SELECTOR, ".vp-navbar-center");
});

test("ReadingBookmarks keeps a mobile-visible trigger", async () => {
  const component = await readFile(
    new URL("../../components/ReadingBookmarks.vue", import.meta.url),
    "utf8",
  );

  assert.match(component, /bookmark-mobile-trigger/);
  assert.doesNotMatch(
    component,
    /<div v-if="isClientReady" class="[^"]*hide-in-mobile[^"]*"/,
  );
});

test("server bookmark helpers normalize and sort server responses", async () => {
  const bookmarks = await fetchServerBookmarks(async (url) => {
    assert.equal(url, API_ENDPOINT);

    return {
      ok: true,
      json: async () => ({
        bookmarks: [
          {
            path: "/old.html",
            title: "Old",
            tags: ["old"],
            scrollY: -10,
            progress: 180,
            updatedAt: 1,
          },
          {
            path: "/new.html",
            fullPath: "/new.html#section",
            title: "New",
            tags: ["new"],
            headingId: "section",
            headingText: "章节",
            scrollY: 300,
            progress: 20,
            updatedAt: 2,
          },
        ],
      }),
    };
  });

  assert.equal(bookmarks[0].path, "/new.html");
  assert.equal(bookmarks[1].fullPath, "/old.html");
  assert.equal(bookmarks[1].scrollY, 0);
  assert.equal(bookmarks[1].progress, 100);
});

test("write helpers call the server and use returned bookmarks as authoritative", async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });

    return {
      ok: true,
      json: async () => ({
        bookmarks: [
          {
            path: "/server.html",
            fullPath: "/server.html#latest",
            title: "Server",
            tags: ["服务端"],
            headingId: "latest",
            headingText: "服务端位置",
            scrollY: 999,
            progress: 88,
            updatedAt: 9,
          },
        ],
      }),
    };
  };

  const saved = await saveServerBookmark(
    {
      path: "/local.html",
      fullPath: "/local.html",
      title: "Local",
      tags: ["本地"],
      headingId: null,
      headingText: "",
      scrollY: 1,
      progress: 1,
    },
    fetcher,
  );
  const afterDelete = await deleteServerBookmark("/local.html", fetcher);
  const afterClear = await clearServerBookmarks(fetcher);

  assert.equal(saved[0].path, "/server.html");
  assert.equal(afterDelete[0].path, "/server.html");
  assert.equal(afterClear[0].path, "/server.html");
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[1].url, `${API_ENDPOINT}?path=%2Flocal.html`);
  assert.equal(calls[1].options.method, "DELETE");
  assert.equal(calls[2].url, API_ENDPOINT);
  assert.equal(calls[2].options.method, "DELETE");
});

test("local bookmarks migrate only when server has no authoritative data", () => {
  const storage = new Map();
  const localStorageLike = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const local = normalizeBookmarks([
    { path: "/local.html", title: "Local", updatedAt: 1 },
  ]);
  const server = normalizeBookmarks([
    { path: "/server.html", title: "Server", updatedAt: 2 },
  ]);

  assert.equal(shouldMigrateLocalBookmarks(localStorageLike, [], local), true);
  assert.equal(
    shouldMigrateLocalBookmarks(localStorageLike, server, local),
    false,
  );

  markServerMigrationDone(localStorageLike);

  assert.equal(storage.get(SERVER_MIGRATION_KEY), "1");
  assert.equal(shouldMigrateLocalBookmarks(localStorageLike, [], local), false);
});
