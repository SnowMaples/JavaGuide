export const STORAGE_KEY = "javaguide-reading-bookmarks-v1";
export const SERVER_MIGRATION_KEY =
  "javaguide-reading-bookmarks-server-migrated-v1";
export const API_ENDPOINT = "/api/reading-bookmarks";
export const MAX_BOOKMARKS = 50;
export const NAVBAR_TARGET_SELECTOR = ".vp-navbar-center";

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
};

const toTextList = (value) =>
  toArray(value)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

export const getReadingTags = (frontmatter = {}) => {
  const tags = [
    ...toTextList(frontmatter.tag),
    ...toTextList(frontmatter.tags),
  ];

  return (tags.length ? tags : toTextList(frontmatter.category)).slice(0, 4);
};

export const isReadablePage = (pageData = {}) => {
  const path = String(pageData.path ?? "");
  const frontmatter = pageData.frontmatter ?? {};

  if (!path || path === "/404.html") return false;
  if (path.startsWith("/tag/") || path.startsWith("/category/")) return false;
  if (frontmatter.layout === "Blog" || frontmatter.layout === "NotFound")
    return false;
  if (frontmatter.blog) return false;
  if (frontmatter.article === false) return false;

  return true;
};

export const upsertBookmark = (bookmarks, bookmark) => {
  const existing = bookmarks.find((item) => item.path === bookmark.path);
  const nextBookmark =
    bookmark.tags?.length || !existing
      ? bookmark
      : { ...bookmark, tags: existing.tags ?? [] };
  const next = [
    nextBookmark,
    ...bookmarks.filter((item) => item.path !== bookmark.path),
  ];

  return next
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .slice(0, MAX_BOOKMARKS);
};

export const hydrateBookmarkTags = (bookmarks, routes = {}) =>
  bookmarks.map((bookmark) => {
    if (bookmark.tags?.length) return bookmark;

    const routeMeta = routes[bookmark.path]?.meta;
    const tags = getReadingTags(routeMeta);

    return tags.length ? { ...bookmark, tags } : bookmark;
  });

export const normalizeBookmarks = (bookmarks) =>
  (Array.isArray(bookmarks) ? bookmarks : [])
    .filter((bookmark) => bookmark?.path)
    .map((bookmark) => ({
      path: String(bookmark.path),
      fullPath: String(bookmark.fullPath || bookmark.path),
      title: String(bookmark.title || "未命名页面"),
      tags: toTextList(bookmark.tags).slice(0, 4),
      headingId: bookmark.headingId ? String(bookmark.headingId) : null,
      headingText: String(bookmark.headingText || ""),
      scrollY: Math.max(0, Math.round(Number(bookmark.scrollY) || 0)),
      progress: Math.min(
        100,
        Math.max(0, Math.round(Number(bookmark.progress) || 0)),
      ),
      updatedAt: Number(bookmark.updatedAt) || 0,
    }))
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .slice(0, MAX_BOOKMARKS);

export const readBookmarks = (storage) => {
  if (!storage) return [];

  try {
    const value = storage.getItem(STORAGE_KEY);
    if (!value) return [];

    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeBookmarks = (storage, bookmarks) => {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
};

const readResponseBookmarks = async (response) => {
  if (!response.ok) {
    throw new Error(`Reading bookmark request failed: ${response.status}`);
  }

  const data = await response.json();
  return normalizeBookmarks(data.bookmarks);
};

export const fetchServerBookmarks = async (fetcher = fetch) =>
  readResponseBookmarks(await fetcher(API_ENDPOINT));

export const saveServerBookmark = async (bookmark, fetcher = fetch) =>
  readResponseBookmarks(
    await fetcher(API_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookmark),
    }),
  );

export const deleteServerBookmark = async (path, fetcher = fetch) =>
  readResponseBookmarks(
    await fetcher(`${API_ENDPOINT}?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    }),
  );

export const clearServerBookmarks = async (fetcher = fetch) =>
  readResponseBookmarks(
    await fetcher(API_ENDPOINT, {
      method: "DELETE",
    }),
  );

export const shouldMigrateLocalBookmarks = (
  storage,
  serverBookmarks,
  localBookmarks,
) =>
  Boolean(storage) &&
  storage.getItem(SERVER_MIGRATION_KEY) !== "1" &&
  normalizeBookmarks(serverBookmarks).length === 0 &&
  normalizeBookmarks(localBookmarks).length > 0;

export const markServerMigrationDone = (storage) => {
  if (!storage) return;
  storage.setItem(SERVER_MIGRATION_KEY, "1");
};
