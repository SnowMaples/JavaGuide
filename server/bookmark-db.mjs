import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export const MAX_BOOKMARKS = 50;

export const normalizeBookmarkPath = (value) => {
  const rawPath = String(value ?? "").trim();
  if (!rawPath) return "";

  let pathname;
  try {
    pathname = new URL(rawPath, "http://bookmark.local").pathname;
  } catch {
    pathname = rawPath.split(/[?#]/, 1)[0];
  }

  pathname = `/${pathname}`.replace(/\/{2,}/g, "/");
  pathname = pathname.replace(/\/index\.html(?:\/+)?$/i, "/");

  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return "/";

  const basename = withoutTrailingSlash.slice(
    withoutTrailingSlash.lastIndexOf("/") + 1,
  );
  return basename.includes(".")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/`;
};

const isHomepagePath = (path) => path === "/" || path === "/home.html";

const normalizeTags = (tags) =>
  [
    ...new Set(
      (Array.isArray(tags) ? tags : [])
        .map((tag) => String(tag ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 4);

const normalizeProgress = (progress) =>
  Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));

const normalizeScrollY = (scrollY) =>
  Math.max(0, Math.round(Number(scrollY) || 0));

const parseTags = (value) => {
  try {
    return normalizeTags(JSON.parse(value || "[]"));
  } catch {
    return [];
  }
};

const normalizeFullPath = (fullPath, path, headingId) => {
  if (headingId) return `${path}#${encodeURIComponent(headingId)}`;

  const hash = String(fullPath ?? "").split("#", 2)[1];
  return hash ? `${path}#${hash}` : path;
};

const rowToBookmark = (row) => ({
  path: row.path,
  fullPath: row.full_path,
  title: row.title,
  tags: parseTags(row.tags_json),
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

  const legacyRows = db
    .prepare("SELECT * FROM reading_bookmarks ORDER BY updated_at DESC")
    .all();
  const groupedRows = new Map();

  for (const row of legacyRows) {
    const path = normalizeBookmarkPath(row.path);
    if (!path || isHomepagePath(path)) continue;

    const rows = groupedRows.get(path) ?? [];
    rows.push(row);
    groupedRows.set(path, rows);
  }

  const normalizedRows = Array.from(groupedRows, ([path, rows]) => {
    const sortedRows = rows.sort(
      (a, b) => Number(b.updated_at) - Number(a.updated_at),
    );
    const latest = sortedRows[0];
    const tags = normalizeTags(
      sortedRows.flatMap((row) => parseTags(row.tags_json)),
    );
    const title =
      sortedRows.find((row) => String(row.title ?? "").trim())?.title ?? "";

    return {
      ...latest,
      path,
      full_path: normalizeFullPath(latest.full_path, path, latest.heading_id),
      title,
      tags_json: JSON.stringify(tags),
      created_at: Math.min(...sortedRows.map((row) => row.created_at)),
    };
  });

  const comparableRow = (row) => ({
    path: row.path,
    full_path: row.full_path,
    title: row.title,
    tags_json: JSON.stringify(parseTags(row.tags_json)),
    heading_id: row.heading_id,
    heading_text: row.heading_text,
    scroll_y: row.scroll_y,
    progress: row.progress,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  const sortByPath = (a, b) => a.path.localeCompare(b.path);
  const currentSnapshot = legacyRows.map(comparableRow).sort(sortByPath);
  const normalizedSnapshot = normalizedRows.map(comparableRow).sort(sortByPath);

  if (JSON.stringify(currentSnapshot) !== JSON.stringify(normalizedSnapshot)) {
    const rewriteStmt = db.prepare(`
      INSERT INTO reading_bookmarks (
        path, full_path, title, tags_json, heading_id, heading_text,
        scroll_y, progress, created_at, updated_at
      ) VALUES (
        @path, @full_path, @title, @tags_json, @heading_id, @heading_text,
        @scroll_y, @progress, @created_at, @updated_at
      )
    `);
    db.transaction(() => {
      db.prepare("DELETE FROM reading_bookmarks").run();
      for (const row of normalizedRows) rewriteStmt.run(row);
    })();
  }

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
    const path = normalizeBookmarkPath(bookmark?.path);
    if (!path) {
      throw new Error("Bookmark path is required");
    }
    if (isHomepagePath(path)) return listBookmarks();

    const existing = getStmt.get(path);
    const tags = normalizeTags([
      ...(Array.isArray(bookmark.tags) ? bookmark.tags : []),
      ...(existing ? parseTags(existing.tags_json) : []),
    ]);
    const now = Date.now();

    upsertStmt.run({
      path,
      fullPath: normalizeFullPath(bookmark.fullPath, path, bookmark.headingId),
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
    const row = getStmt.get(normalizeBookmarkPath(path));
    return row ? rowToBookmark(row) : null;
  };

  const deleteBookmark = (path) => {
    deleteStmt.run(normalizeBookmarkPath(path));
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
