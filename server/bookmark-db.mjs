import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export const MAX_BOOKMARKS = 50;

const normalizeTags = (tags) =>
  (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);

const normalizeProgress = (progress) =>
  Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));

const normalizeScrollY = (scrollY) =>
  Math.max(0, Math.round(Number(scrollY) || 0));

const rowToBookmark = (row) => ({
  path: row.path,
  fullPath: row.full_path,
  title: row.title,
  tags: JSON.parse(row.tags_json || "[]"),
  headingId: row.heading_id,
  headingText: row.heading_text,
  scrollY: row.scroll_y,
  progress: row.progress,
  updatedAt: row.updated_at,
});

export const createBookmarkStore = (dbPath) => {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_bookmarks (
      path TEXT PRIMARY KEY,
      full_path TEXT NOT NULL,
      title TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      heading_id TEXT,
      heading_text TEXT NOT NULL DEFAULT '',
      scroll_y INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const listStmt = db.prepare(`
    SELECT path, full_path, title, tags_json, heading_id, heading_text, scroll_y, progress, updated_at
    FROM reading_bookmarks
    ORDER BY updated_at DESC
    LIMIT ${MAX_BOOKMARKS}
  `);
  const getStmt = db.prepare(`
    SELECT path, full_path, title, tags_json, heading_id, heading_text, scroll_y, progress, updated_at
    FROM reading_bookmarks
    WHERE path = ?
  `);
  const upsertStmt = db.prepare(`
    INSERT INTO reading_bookmarks (
      path, full_path, title, tags_json, heading_id, heading_text, scroll_y, progress, created_at, updated_at
    )
    VALUES (
      @path, @fullPath, @title, @tagsJson, @headingId, @headingText, @scrollY, @progress, @now, @now
    )
    ON CONFLICT(path) DO UPDATE SET
      full_path = excluded.full_path,
      title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE reading_bookmarks.title END,
      tags_json = CASE WHEN excluded.tags_json <> '[]' THEN excluded.tags_json ELSE reading_bookmarks.tags_json END,
      heading_id = excluded.heading_id,
      heading_text = excluded.heading_text,
      scroll_y = excluded.scroll_y,
      progress = excluded.progress,
      updated_at = excluded.updated_at
  `);
  const pruneStmt = db.prepare(`
    DELETE FROM reading_bookmarks
    WHERE path NOT IN (
      SELECT path FROM reading_bookmarks ORDER BY updated_at DESC LIMIT ${MAX_BOOKMARKS}
    )
  `);
  const deleteStmt = db.prepare("DELETE FROM reading_bookmarks WHERE path = ?");
  const clearStmt = db.prepare("DELETE FROM reading_bookmarks");

  const listBookmarks = () => listStmt.all().map(rowToBookmark);

  const upsertBookmark = (bookmark) => {
    const path = String(bookmark?.path ?? "").trim();
    if (!path) {
      throw new Error("Bookmark path is required");
    }

    const tags = normalizeTags(bookmark.tags);
    const now = Date.now();

    upsertStmt.run({
      path,
      fullPath: String(bookmark.fullPath || path),
      title: String(bookmark.title ?? "").trim(),
      tagsJson: JSON.stringify(tags),
      headingId: bookmark.headingId ? String(bookmark.headingId) : null,
      headingText: String(bookmark.headingText ?? "").trim(),
      scrollY: normalizeScrollY(bookmark.scrollY),
      progress: normalizeProgress(bookmark.progress),
      now,
    });
    pruneStmt.run();

    return listBookmarks();
  };

  const getBookmark = (path) => {
    const row = getStmt.get(path);
    return row ? rowToBookmark(row) : null;
  };

  const deleteBookmark = (path) => {
    deleteStmt.run(path);
    return listBookmarks();
  };

  const clearBookmarks = () => {
    clearStmt.run();
    return listBookmarks();
  };

  const close = () => db.close();

  return {
    clearBookmarks,
    close,
    deleteBookmark,
    getBookmark,
    listBookmarks,
    upsertBookmark,
  };
};
