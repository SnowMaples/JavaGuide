<template>
  <div v-if="isClientReady" class="reading-bookmarks">
    <Teleport v-if="hasNavbarTarget" :to="NAVBAR_TARGET_SELECTOR">
      <div class="reading-bookmarks-nav-item hide-in-mobile">
        <button
          class="bookmark-trigger bookmark-nav-trigger auto-link"
          :class="{ 'is-open': isOpen }"
          title="阅读记录"
          @click="togglePanel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
          <span class="btn-text">阅读记录</span>
          <span v-if="bookmarks.length" class="bookmark-count">
            {{ bookmarks.length }}
          </span>
        </button>
      </div>
    </Teleport>

    <button
      class="bookmark-trigger bookmark-mobile-trigger"
      :class="{ 'is-open': isOpen }"
      title="阅读记录"
      @click="togglePanel"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
      <span class="mobile-btn-text">阅读记录</span>
      <span v-if="bookmarks.length" class="bookmark-count">
        {{ bookmarks.length }}
      </span>
    </button>

    <Teleport to="body">
      <transition name="bookmark-panel">
        <div v-if="isOpen" class="bookmark-panel">
          <div class="bookmark-panel-header">
            <h3>继续阅读</h3>
            <button
              class="bookmark-icon-btn"
              title="关闭"
              @click="isOpen = false"
            >
              ×
            </button>
          </div>

          <div v-if="syncError" class="bookmark-error">{{ syncError }}</div>

          <button
            v-if="currentPageReadable"
            class="bookmark-mark-current"
            :disabled="isSyncing || isSaving"
            @click="markCurrentPosition"
          >
            {{
              hasManuallySavedCurrentPosition
                ? "已标记当前位置"
                : "标记当前位置"
            }}
          </button>

          <div v-if="bookmarks.length" class="bookmark-list">
            <template v-if="!showAllBookmarks">
              <div
                v-if="continueReadingBookmark"
                class="bookmark-item bookmark-featured"
                :class="{ 'is-disabled': isSyncing }"
                role="button"
                tabindex="0"
                @click="openBookmark(continueReadingBookmark)"
                @keydown.enter.prevent="openBookmark(continueReadingBookmark)"
                @keydown.space.prevent="openBookmark(continueReadingBookmark)"
              >
                <span class="bookmark-eyebrow">上次读到</span>
                <span class="bookmark-title">
                  {{ continueReadingBookmark.title }}
                </span>
                <span class="bookmark-meta">
                  <span
                    v-for="tag in continueReadingBookmark.tags.slice(0, 2)"
                    :key="`${continueReadingBookmark.path}-${tag}`"
                    class="bookmark-tag"
                  >
                    {{ tag }}
                  </span>
                  <span
                    v-if="continueReadingRelatedCount"
                    class="bookmark-topic-count"
                  >
                    同专题另 {{ continueReadingRelatedCount }} 篇
                  </span>
                </span>
                <span class="bookmark-position">
                  {{
                    continueReadingBookmark.headingText ||
                    `阅读到 ${continueReadingBookmark.progress}%`
                  }}
                </span>
                <span class="bookmark-time">
                  {{ formatUpdatedAt(continueReadingBookmark.updatedAt) }}
                </span>
                <button
                  class="bookmark-remove"
                  title="删除"
                  :disabled="isSyncing"
                  @click.stop="removeBookmark(continueReadingBookmark.path)"
                >
                  ×
                </button>
              </div>

              <div
                v-if="recentBookmarkGroups.length"
                class="bookmark-section-title"
              >
                最近阅读
              </div>
              <div
                v-for="group in recentBookmarkGroups"
                :key="group.key"
                class="bookmark-item"
                :class="{ 'is-disabled': isSyncing }"
                role="button"
                tabindex="0"
                @click="openBookmark(group.representative)"
                @keydown.enter.prevent="openBookmark(group.representative)"
                @keydown.space.prevent="openBookmark(group.representative)"
              >
                <span class="bookmark-title">
                  {{ group.representative.title }}
                </span>
                <span class="bookmark-meta">
                  <span
                    v-for="tag in group.representative.tags.slice(0, 2)"
                    :key="`${group.representative.path}-${tag}`"
                    class="bookmark-tag"
                  >
                    {{ tag }}
                  </span>
                  <span v-if="group.count > 1" class="bookmark-topic-count">
                    同专题另 {{ group.count - 1 }} 篇
                  </span>
                </span>
                <span class="bookmark-position">
                  {{
                    group.representative.headingText ||
                    `阅读到 ${group.representative.progress}%`
                  }}
                </span>
                <span class="bookmark-time">
                  {{ formatUpdatedAt(group.representative.updatedAt) }}
                </span>
                <button
                  class="bookmark-remove"
                  title="删除"
                  :disabled="isSyncing"
                  @click.stop="removeBookmark(group.representative.path)"
                >
                  ×
                </button>
              </div>
            </template>

            <template v-else>
              <div class="bookmark-section-title">全部记录</div>
              <div
                v-for="bookmark in bookmarks"
                :key="bookmark.path"
                class="bookmark-item"
                :class="{ 'is-disabled': isSyncing }"
                role="button"
                tabindex="0"
                @click="openBookmark(bookmark)"
                @keydown.enter.prevent="openBookmark(bookmark)"
                @keydown.space.prevent="openBookmark(bookmark)"
              >
                <span class="bookmark-title">{{ bookmark.title }}</span>
                <span class="bookmark-meta">
                  <span
                    v-for="tag in bookmark.tags"
                    :key="`${bookmark.path}-${tag}`"
                    class="bookmark-tag"
                  >
                    {{ tag }}
                  </span>
                </span>
                <span class="bookmark-position">
                  {{ bookmark.headingText || `阅读到 ${bookmark.progress}%` }}
                </span>
                <span class="bookmark-time">
                  {{ formatUpdatedAt(bookmark.updatedAt) }}
                </span>
                <button
                  class="bookmark-remove"
                  title="删除"
                  :disabled="isSyncing"
                  @click.stop="removeBookmark(bookmark.path)"
                >
                  ×
                </button>
              </div>
            </template>
          </div>

          <div v-else class="bookmark-empty">
            {{ isSyncing ? "正在同步书签" : "暂无阅读记录" }}
          </div>

          <div v-if="bookmarks.length" class="bookmark-actions">
            <button
              v-if="bookmarks.length > 1"
              class="bookmark-view-toggle"
              :disabled="isSyncing"
              @click="showAllBookmarks = !showAllBookmarks"
            >
              {{
                showAllBookmarks
                  ? "收起全部记录"
                  : `查看全部 ${bookmarks.length} 条`
              }}
            </button>
            <button
              class="bookmark-clear"
              :disabled="isSyncing"
              @click="clearBookmarks"
            >
              清空全部
            </button>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  onContentUpdated,
  usePageData,
  useRouter,
  useRoutes,
} from "vuepress/client";
import {
  clearServerBookmarks,
  createAutoBookmarkScheduler,
  deleteServerBookmark,
  fetchServerBookmarks,
  getReadingTags,
  groupBookmarksByTopic,
  hydrateBookmarkTags,
  isReadablePage,
  markServerMigrationDone,
  NAVBAR_TARGET_SELECTOR,
  readBookmarks,
  saveServerBookmark,
  selectContinueReadingBookmark,
  shouldMigrateLocalBookmarks,
} from "../features/reading-bookmarks/bookmarks.mjs";

type ReadingBookmark = {
  path: string;
  fullPath: string;
  title: string;
  tags: string[];
  headingId: string | null;
  headingText: string;
  scrollY: number;
  progress: number;
  updatedAt: number;
};

type BookmarkTopicGroup = {
  key: string;
  representative: ReadingBookmark;
  count: number;
  bookmarks: ReadingBookmark[];
};

type PageFrontmatter = {
  article?: boolean;
  blog?: unknown;
  category?: string | string[];
  layout?: string;
  tag?: string | string[];
  tags?: string | string[];
};

const MAX_DEFAULT_TOPIC_GROUPS = 5;
const RESTORE_KEY = "javaguide-reading-bookmark-restore";
const CONTENT_SELECTOR =
  "#markdown-content, .theme-hope-content, .vp-page-content, .vp-content";

const pageData = usePageData<Record<string, unknown>>();
const router = useRouter();
const routes = useRoutes();
const isClientReady = ref(false);
const isOpen = ref(false);
const hasNavbarTarget = ref(false);
const bookmarks = ref<ReadingBookmark[]>([]);
const isSyncing = ref(false);
const isSaving = ref(false);
const syncError = ref("");
const showAllBookmarks = ref(false);
const hasManuallySavedCurrentPosition = ref(false);
const currentPageReadable = computed(() => isReadablePage(pageData.value));
const continueReadingBookmark = computed(
  () =>
    selectContinueReadingBookmark(bookmarks.value) as ReadingBookmark | null,
);
const bookmarkGroups = computed(
  () => groupBookmarksByTopic(bookmarks.value) as BookmarkTopicGroup[],
);
const continueReadingGroup = computed(() => {
  const bookmark = continueReadingBookmark.value;
  if (!bookmark) return null;

  return (
    bookmarkGroups.value.find((group) =>
      group.bookmarks.some((item) => item.path === bookmark.path),
    ) ?? null
  );
});
const continueReadingRelatedCount = computed(() =>
  Math.max(0, (continueReadingGroup.value?.count ?? 1) - 1),
);
const recentBookmarkGroups = computed(() =>
  bookmarkGroups.value
    .filter((group) => group.key !== continueReadingGroup.value?.key)
    .slice(0, MAX_DEFAULT_TOPIC_GROUPS),
);

let restoreTimer: number | null = null;

const getStorage = () =>
  typeof window === "undefined" ? null : window.localStorage;

const setServerBookmarks = (serverBookmarks: ReadingBookmark[]) => {
  bookmarks.value = serverBookmarks;
};

const loadBookmarks = async () => {
  const storage = getStorage();
  isSyncing.value = true;
  syncError.value = "";

  try {
    let serverBookmarks = (await fetchServerBookmarks()) as ReadingBookmark[];
    const localBookmarks = hydrateBookmarkTags(
      readBookmarks(storage),
      routes.value,
    ) as ReadingBookmark[];

    if (shouldMigrateLocalBookmarks(storage, serverBookmarks, localBookmarks)) {
      for (const bookmark of localBookmarks) {
        serverBookmarks = (await saveServerBookmark(
          bookmark,
        )) as ReadingBookmark[];
      }
    }

    markServerMigrationDone(storage);
    setServerBookmarks(serverBookmarks);
  } catch {
    syncError.value = "书签服务不可用";
  } finally {
    isSyncing.value = false;
  }
};

const findContentEl = (): HTMLElement | null => {
  if (typeof document === "undefined") return null;
  return document.querySelector(CONTENT_SELECTOR) as HTMLElement | null;
};

const getCurrentHeading = () => {
  const contentEl = findContentEl();
  if (!contentEl) return { id: null, text: "" };

  const headings = Array.from(
    contentEl.querySelectorAll<HTMLElement>("h2[id], h3[id], h4[id]"),
  );
  const offsetY = window.scrollY + 120;
  const current = headings
    .filter((heading) => heading.offsetTop <= offsetY)
    .at(-1);

  return {
    id: current?.id ?? null,
    text: current?.innerText?.trim() ?? "",
  };
};

const getProgress = () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 0;

  return Math.min(
    100,
    Math.max(0, Math.round((window.scrollY / scrollable) * 100)),
  );
};

const getCurrentBookmark = (): ReadingBookmark | null => {
  if (!currentPageReadable.value || typeof window === "undefined") return null;

  const heading = getCurrentHeading();
  const frontmatter = pageData.value.frontmatter as PageFrontmatter | undefined;
  const path = pageData.value.path;

  return {
    path,
    fullPath: heading.id ? `${path}#${encodeURIComponent(heading.id)}` : path,
    title: pageData.value.title || document.title || "未命名页面",
    tags: getReadingTags(frontmatter),
    headingId: heading.id,
    headingText: heading.text,
    scrollY: Math.max(0, Math.round(window.scrollY)),
    progress: getProgress(),
    updatedAt: Date.now(),
  };
};

const saveCurrentBookmark = async () => {
  const bookmark = getCurrentBookmark();
  if (!bookmark || isSaving.value) return false;

  isSaving.value = true;
  syncError.value = "";

  try {
    setServerBookmarks(
      (await saveServerBookmark(bookmark)) as ReadingBookmark[],
    );
    return true;
  } catch {
    syncError.value = "书签服务不可用";
    return false;
  } finally {
    isSaving.value = false;
  }
};

const autoBookmarkScheduler = createAutoBookmarkScheduler({
  onElapsed: () => void saveCurrentBookmark(),
});

const restartAutoBookmarkTimer = () => {
  autoBookmarkScheduler.cancel();
  if (!currentPageReadable.value || typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;

  autoBookmarkScheduler.restart();
};

const markCurrentPosition = async () => {
  if (!(await saveCurrentBookmark())) return;

  hasManuallySavedCurrentPosition.value = true;
  restartAutoBookmarkTimer();
};

const formatUpdatedAt = (updatedAt: number) => {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return formatter.format(new Date(updatedAt));
};

const togglePanel = async () => {
  const nextIsOpen = !isOpen.value;

  if (nextIsOpen) {
    showAllBookmarks.value = false;
    await loadBookmarks();
  }

  isOpen.value = nextIsOpen;
};

const removeBookmark = async (path: string) => {
  isSyncing.value = true;
  syncError.value = "";

  try {
    setServerBookmarks((await deleteServerBookmark(path)) as ReadingBookmark[]);
    if (path === pageData.value.path) {
      hasManuallySavedCurrentPosition.value = false;
    }
  } catch {
    syncError.value = "书签服务不可用";
  } finally {
    isSyncing.value = false;
  }
};

const clearBookmarks = async () => {
  isSyncing.value = true;
  syncError.value = "";

  try {
    setServerBookmarks((await clearServerBookmarks()) as ReadingBookmark[]);
    showAllBookmarks.value = false;
    hasManuallySavedCurrentPosition.value = false;
  } catch {
    syncError.value = "书签服务不可用";
  } finally {
    isSyncing.value = false;
  }
};

const restoreScroll = (bookmark: ReadingBookmark) => {
  if (typeof window === "undefined") return;

  const run = () => {
    if (bookmark.headingId) {
      const heading = document.getElementById(bookmark.headingId);
      if (heading) {
        heading.scrollIntoView({ block: "start" });
        return;
      }
    }

    window.scrollTo({ top: bookmark.scrollY, behavior: "auto" });
  };

  nextTick(() => {
    requestAnimationFrame(run);
    window.setTimeout(run, 300);
  });
};

const openBookmark = async (bookmark: ReadingBookmark) => {
  if (isSyncing.value) return;

  isSyncing.value = true;
  syncError.value = "";

  let serverBookmark = bookmark;

  try {
    const serverBookmarks = (await fetchServerBookmarks()) as ReadingBookmark[];
    setServerBookmarks(serverBookmarks);
    serverBookmark =
      serverBookmarks.find((item) => item.path === bookmark.path) ?? bookmark;
  } catch {
    syncError.value = "书签服务不可用";
    isSyncing.value = false;
    return;
  }

  isSyncing.value = false;
  isOpen.value = false;
  window.sessionStorage.setItem(RESTORE_KEY, JSON.stringify(serverBookmark));

  if (pageData.value.path === serverBookmark.path) {
    restoreScroll(serverBookmark);
    return;
  }

  await router.push(serverBookmark.fullPath);
};

const restorePendingBookmark = () => {
  if (typeof window === "undefined") return;

  const value = window.sessionStorage.getItem(RESTORE_KEY);
  if (!value) return;

  try {
    const bookmark = JSON.parse(value) as ReadingBookmark;
    if (bookmark.path !== pageData.value.path) return;

    window.sessionStorage.removeItem(RESTORE_KEY);
    restoreScroll(bookmark);
  } catch {
    window.sessionStorage.removeItem(RESTORE_KEY);
  }
};

const scheduleRestore = () => {
  if (typeof window === "undefined") return;

  if (restoreTimer !== null) {
    window.clearTimeout(restoreTimer);
  }

  restoreTimer = window.setTimeout(() => {
    restoreTimer = null;
    restorePendingBookmark();
  }, 120);
};

const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") {
    restartAutoBookmarkTimer();
    return;
  }

  autoBookmarkScheduler.cancel();
};

const handleScroll = () => {
  hasManuallySavedCurrentPosition.value = false;
  restartAutoBookmarkTimer();
};

onContentUpdated((reason) => {
  if (reason === "beforeUnmount") {
    autoBookmarkScheduler.cancel();
    return;
  }

  scheduleRestore();
  restartAutoBookmarkTimer();
});

onMounted(() => {
  isClientReady.value = true;
  hasNavbarTarget.value = Boolean(
    document.querySelector(NAVBAR_TARGET_SELECTOR),
  );
  void loadBookmarks();
  restartAutoBookmarkTimer();
  scheduleRestore();

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("scroll", handleScroll, { passive: true });
});

onBeforeUnmount(() => {
  autoBookmarkScheduler.cancel();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("scroll", handleScroll);

  if (restoreTimer !== null) {
    window.clearTimeout(restoreTimer);
  }
});

watch(
  () => pageData.value.path,
  () => {
    hasManuallySavedCurrentPosition.value = false;
    restartAutoBookmarkTimer();
    scheduleRestore();
    void loadBookmarks();
  },
);
</script>

<style lang="scss" scoped>
.reading-bookmarks-nav-item {
  position: relative;
  margin: 0 0.25rem;
  line-height: 2rem;
}

.bookmark-trigger.bookmark-mobile-trigger {
  display: none;
}

.bookmark-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 2rem;
  padding: 0;
  font-size: 0.875rem;
  color: var(--vp-c-text);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: color 0.2s ease;
  white-space: nowrap;

  &::before {
    content: " ";
    position: absolute;
    inset: auto 50% 0;
    height: 2px;
    background: var(--vp-c-accent-hover);
    border-radius: 1px;
    visibility: hidden;
    transition: inset 0.2s ease-in-out;
  }

  &:hover,
  &.is-open {
    color: var(--vp-c-accent);

    &::before {
      inset: auto 0 0;
      visibility: visible;
    }
  }

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
}

.btn-text {
  font-weight: 500;
}

.bookmark-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 16px;
  color: #fff;
  text-align: center;
  background: var(--vp-c-accent);
  border-radius: 9px;
}

.bookmark-panel {
  position: fixed;
  right: 20px;
  top: 64px;
  bottom: auto;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 32px));
  max-height: min(520px, calc(100vh - 180px));
  padding: 14px;
  overflow: hidden;
  color: var(--vp-c-text);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
}

.bookmark-panel-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  h3 {
    margin: 0;
    font-size: 16px;
    line-height: 1.4;
  }
}

.bookmark-icon-btn,
.bookmark-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--vp-c-text-mute);
  background: transparent;
  border: 0;
  cursor: pointer;

  &:hover {
    color: var(--vp-c-accent);
  }
}

.bookmark-icon-btn {
  width: 28px;
  height: 28px;
  font-size: 22px;
}

.bookmark-list {
  display: grid;
  flex: 1;
  gap: 8px;
  min-height: 0;
  padding-right: 2px;
  overflow-x: hidden;
  overflow-y: auto;
}

.bookmark-item {
  position: relative;
  display: grid;
  box-sizing: border-box;
  gap: 5px;
  width: 100%;
  padding: 10px 10px 10px 34px;
  color: inherit;
  text-align: left;
  background: var(--vp-c-bg-soft);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    border-color: var(--vp-c-accent);
  }

  &.is-disabled {
    cursor: wait;
    opacity: 0.72;
  }
}

.bookmark-featured {
  border-color: var(--vp-c-accent);
  background: var(--vp-c-accent-bg);
}

.bookmark-eyebrow,
.bookmark-section-title {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--vp-c-text-mute);
}

.bookmark-eyebrow {
  color: var(--vp-c-accent);
}

.bookmark-section-title {
  padding: 4px 2px 0;
}

.bookmark-title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 0;
}

.bookmark-tag {
  max-width: 120px;
  padding: 2px 7px;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.5;
  color: var(--vp-c-accent);
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--vp-c-accent-bg);
  border-radius: 4px;
}

.bookmark-topic-count {
  align-self: center;
  font-size: 11px;
  line-height: 1.5;
  color: var(--vp-c-text-mute);
}

.bookmark-position,
.bookmark-time {
  overflow: hidden;
  font-size: 12px;
  line-height: 1.45;
  color: var(--vp-c-text-mute);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-remove {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  height: 22px;
  font-size: 18px;
}

.bookmark-empty {
  padding: 28px 0;
  font-size: 13px;
  color: var(--vp-c-text-mute);
  text-align: center;
}

.bookmark-error {
  flex-shrink: 0;
  margin-bottom: 10px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fecdca;
  border-radius: 6px;
}

.bookmark-mark-current {
  flex-shrink: 0;
  width: 100%;
  height: 36px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--vp-c-accent);
  border: 0;
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--vp-c-accent-hover);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }
}

.bookmark-actions {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  margin-top: 10px;
}

.bookmark-view-toggle,
.bookmark-clear {
  width: 100%;
  height: 34px;
  font-size: 13px;
  color: var(--vp-c-text-mute);
  background: transparent;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    color: var(--vp-c-accent);
    border-color: var(--vp-c-accent);
  }
}

.bookmark-panel-enter-active,
.bookmark-panel-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.bookmark-panel-enter-from,
.bookmark-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 959px) {
  .bookmark-trigger.bookmark-mobile-trigger {
    position: fixed;
    right: 14px;
    bottom: 24px;
    z-index: 999;
    display: flex;
    height: 36px;
    padding: 0 12px;
    color: var(--vp-c-text);
    background: var(--vp-c-bg);
    border: 1px solid var(--vp-c-border);
    border-radius: 18px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);

    &.is-open {
      color: #fff;
      background: var(--vp-c-accent);
      border-color: var(--vp-c-accent);
    }

    &::before {
      display: none;
    }
  }

  .mobile-btn-text {
    font-weight: 500;
  }

  .bookmark-panel {
    right: 12px;
    top: auto;
    bottom: 76px;
    width: calc(100vw - 24px);
    max-height: min(520px, calc(100vh - 84px));
  }
}
</style>
