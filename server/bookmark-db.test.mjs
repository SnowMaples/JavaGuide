import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
