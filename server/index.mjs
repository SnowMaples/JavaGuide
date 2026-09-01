import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createBookmarkStore } from "./bookmark-db.mjs";

const parseArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const port = Number(parseArg("port", process.env.PORT || "3000"));
const apiOnly = process.argv.includes("--api-only");
const dbPath = resolve(
  parseArg(
    "db",
    process.env.BOOKMARK_DB_PATH || "data/reading-bookmarks.sqlite",
  ),
);
const staticDir = resolve(
  parseArg("static", process.env.BOOKMARK_STATIC_DIR || "dist"),
);

const app = express();
const store = createBookmarkStore(dbPath);

app.use(express.json({ limit: "64kb" }));

const sendBookmarks = (res, bookmarks) => {
  res.json({ bookmarks });
};

app.get("/api/reading-bookmarks", (_req, res) => {
  sendBookmarks(res, store.listBookmarks());
});

app.put("/api/reading-bookmarks", (req, res, next) => {
  try {
    sendBookmarks(res, store.upsertBookmark(req.body));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/reading-bookmarks", (req, res) => {
  const path = String(req.query.path ?? "");

  if (path) {
    sendBookmarks(res, store.deleteBookmark(path));
    return;
  }

  sendBookmarks(res, store.clearBookmarks());
});

app.use((error, _req, res, _next) => {
  res.status(400).json({
    error: error instanceof Error ? error.message : "Bad request",
  });
});

if (!apiOnly) {
  if (!existsSync(staticDir)) {
    console.warn(`Static directory does not exist: ${staticDir}`);
  }

  app.use(express.static(staticDir, { extensions: ["html"] }));
  app.get(/.*/, (_req, res) => {
    res.sendFile(resolve(staticDir, "index.html"));
  });
}

const server = app.listen(port, () => {
  const mode = apiOnly ? "API" : "API + static";
  console.log(`Reading bookmarks ${mode} server listening on ${port}`);
  console.log(`SQLite database: ${dbPath}`);
});

const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
