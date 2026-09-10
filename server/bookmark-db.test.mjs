import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createBookmarkStore } from "./bookmark-db.mjs";

const createTempStore = async () => {
  const dir = await mkdtemp(join(tmpdir(), "javaguide-bookmarks-"));
  const dbPath = join(dir, "bookmarks.sqlite");
  const store = createBookmarkStore(dbPath);

  return {
    dir,
    store,
    close: async () => {
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
};

test("bookmark store upserts by path, sorts newest first, and preserves existing tags", async () => {
  const { close, store } = await createTempStore();

  try {
    const first = store.upsertBookmark({
      path: "/java/basis/java-basic-questions-01.html",
      fullPath: "/java/basis/java-basic-questions-01.html#old",
      title: "Java基础常见面试题总结(上)",
      tags: ["Java基础"],
      headingId: "old",
      headingText: "旧章节",
      scrollY: 100,
      progress: 10,
    });

    assert.equal(first.length, 1);
    assert.deepEqual(first[0].tags, ["Java基础"]);

    store.upsertBookmark({
      path: "/cs-basics/operating-system/zero-copy.html",
      fullPath: "/cs-basics/operating-system/zero-copy.html",
      title: "零拷贝详解",
      tags: ["操作系统"],
      headingId: null,
      headingText: "",
      scrollY: 0,
      progress: 0,
    });

    const updated = store.upsertBookmark({
      path: "/java/basis/java-basic-questions-01.html",
      fullPath: "/java/basis/java-basic-questions-01.html#new",
      title: "Java基础常见面试题总结(上)",
      tags: [],
      headingId: "new",
      headingText: "新章节",
      scrollY: 1200,
      progress: 42,
    });

    assert.equal(updated.length, 2);
    assert.equal(updated[0].path, "/java/basis/java-basic-questions-01.html");
    assert.equal(updated[0].fullPath.endsWith("#new"), true);
    assert.equal(updated[0].headingText, "新章节");
    assert.deepEqual(updated[0].tags, ["Java基础"]);
    assert.equal(
      updated.filter(
        (item) => item.path === "/java/basis/java-basic-questions-01.html",
      ).length,
      1,
    );
  } finally {
    await close();
  }
});

test("bookmark store deletes one bookmark or clears all bookmarks", async () => {
  const { close, store } = await createTempStore();

  try {
    store.upsertBookmark({
      path: "/a.html",
      fullPath: "/a.html",
      title: "A",
      tags: ["A"],
      headingId: null,
      headingText: "",
      scrollY: 1,
      progress: 1,
    });
    store.upsertBookmark({
      path: "/b.html",
      fullPath: "/b.html",
      title: "B",
      tags: ["B"],
      headingId: null,
      headingText: "",
      scrollY: 2,
      progress: 2,
    });

    assert.equal(store.deleteBookmark("/a.html").length, 1);
    assert.equal(store.listBookmarks()[0].path, "/b.html");
    assert.deepEqual(store.clearBookmarks(), []);
  } finally {
    await close();
  }
});

test("bookmark store ignores the site homepage routes", async () => {
  const { close, store } = await createTempStore();

  try {
    const bookmarks = store.upsertBookmark({
      path: "/",
      fullPath: "/#intro",
      title: "JavaGuide",
      tags: [],
      headingId: "intro",
      headingText: "首页",
      scrollY: 100,
      progress: 10,
    });

    assert.deepEqual(bookmarks, []);

    const homeBookmarks = store.upsertBookmark({
      path: "/home.html",
      fullPath: "/home.html#java",
      title: "Java 面试指南",
      tags: [],
      headingId: "java",
      headingText: "Java",
      scrollY: 200,
      progress: 5,
    });

    assert.deepEqual(homeBookmarks, []);
  } finally {
    await close();
  }
});

test("bookmark store merges route variants and keeps the latest position and useful tags", async () => {
  const { close, store } = await createTempStore();

  try {
    store.upsertBookmark({
      path: "/guide/index.html?from=old#chapter-one",
      fullPath: "/guide/index.html#chapter-one",
      title: "Guide",
      tags: ["Java", "基础"],
      headingId: "chapter-one",
      headingText: "第一章",
      scrollY: 100,
      progress: 10,
    });

    const bookmarks = store.upsertBookmark({
      path: "/guide/#chapter-two",
      fullPath: "/guide/#chapter-two",
      title: "Guide",
      tags: ["Java", "后端"],
      headingId: "chapter-two",
      headingText: "第二章",
      scrollY: 900,
      progress: 80,
    });

    assert.equal(bookmarks.length, 1);
    assert.equal(bookmarks[0].path, "/guide/");
    assert.equal(bookmarks[0].fullPath, "/guide/#chapter-two");
    assert.equal(bookmarks[0].headingText, "第二章");
    assert.equal(bookmarks[0].scrollY, 900);
    assert.deepEqual(bookmarks[0].tags, ["Java", "后端", "基础"]);
  } finally {
    await close();
  }
});

test("bookmark store cleans legacy homepage and duplicate rows on startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "javaguide-bookmarks-"));
  const dbPath = join(dir, "bookmarks.sqlite");
  const initialStore = createBookmarkStore(dbPath);
  initialStore.close();

  const db = new Database(dbPath);
  const insert = db.prepare(`
    INSERT INTO reading_bookmarks (
      path, full_path, title, tags_json, heading_id, heading_text,
      scroll_y, progress, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run("/", "/#intro", "JavaGuide", "[]", "intro", "首页", 10, 1, 1, 1);
  insert.run(
    "/home.html",
    "/home.html#java",
    "Java 面试指南",
    "[]",
    "java",
    "Java",
    20,
    2,
    1,
    2,
  );
  insert.run(
    "/guide/index.html",
    "/guide/index.html#old",
    "Guide",
    '["旧标签"]',
    "old",
    "旧位置",
    100,
    10,
    2,
    2,
  );
  insert.run(
    "/guide/",
    "/guide/#new",
    "Guide",
    "[]",
    "new",
    "新位置",
    800,
    70,
    3,
    3,
  );
  db.close();

  const store = createBookmarkStore(dbPath);

  try {
    const bookmarks = store.listBookmarks();
    assert.equal(bookmarks.length, 1);
    assert.equal(bookmarks[0].path, "/guide/");
    assert.equal(bookmarks[0].headingText, "新位置");
    assert.deepEqual(bookmarks[0].tags, ["旧标签"]);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
