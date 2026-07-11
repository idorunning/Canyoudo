// Reader library: save-for-later articles, shared by the article SaveButton
// and the /library page.
//
// Storage model
// -------------
// - Signed out: saves live in localStorage ('tap-library'), device-local.
// - Signed in (same Supabase auth as the research assistant): saves live in
//   the saved_articles table (owner-only RLS — see
//   supabase/migrations/0004_saved_articles.sql). On first load with a
//   session, any device-local saves are uploaded and the local store cleared,
//   so a reader who saved before signing in keeps everything.
// - No Supabase configured at build: localStorage only, everything still works.
//
// Offline tie-in: every save asks the service worker (if active) to cache the
// article page, so the library doubles as the offline reading list.

export interface SavedArticle {
  slug: string;
  section: string;
  title: string;
  description?: string;
  savedAt: string; // ISO
}

const LOCAL_KEY = 'tap-library';
const CHANGE_EVENT = 'library:change';

function supabaseEnv(): { url?: string; key?: string } {
  return {
    url: import.meta.env.PUBLIC_SUPABASE_URL,
    key: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  };
}

let clientPromise: Promise<any | null> | null = null;
function getClient(): Promise<any | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { url, key } = supabaseEnv();
      if (!url || !key) return null;
      try {
        const { createClient } = await import('@supabase/supabase-js');
        return createClient(url, key);
      } catch {
        return null;
      }
    })();
  }
  return clientPromise;
}

export async function getUser(): Promise<any | null> {
  const supabase = await getClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- local store
function readLocal(): SavedArticle[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(list: SavedArticle[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {}
}

// -------------------------------------------------------------- change signal
function emitChange(): void {
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function onLibraryChange(cb: () => void): void {
  document.addEventListener(CHANGE_EVENT, cb);
}

// -------------------------------------------------------------- offline cache
/** Ask the service worker to cache these article URLs for offline reading. */
export function cacheForOffline(urls: string[]): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CACHE_URLS', urls });
  } catch {}
}

function articleUrl(a: Pick<SavedArticle, 'slug' | 'section'>): string {
  return `/${a.section}/${a.slug}/`;
}

// ---------------------------------------------------------------- public API
/** One-time per page load: push any device-local saves up to the account. */
let migrated = false;
async function migrateLocalToCloud(supabase: any, userId: string): Promise<void> {
  if (migrated) return;
  migrated = true;
  const local = readLocal();
  if (!local.length) return;
  try {
    const rows = local.map((a) => ({
      user_id: userId,
      slug: a.slug,
      section: a.section,
      title: a.title,
      description: a.description ?? null,
      saved_at: a.savedAt,
    }));
    const { error } = await supabase
      .from('saved_articles')
      .upsert(rows, { onConflict: 'user_id,slug', ignoreDuplicates: true });
    if (!error) writeLocal([]);
  } catch {}
}

export async function listSaved(): Promise<{ items: SavedArticle[]; synced: boolean }> {
  const supabase = await getClient();
  const user = supabase ? await getUser() : null;
  if (supabase && user) {
    await migrateLocalToCloud(supabase, user.id);
    try {
      const { data, error } = await supabase
        .from('saved_articles')
        .select('slug, section, title, description, saved_at')
        .order('saved_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        const items = data.map((r: any) => ({
          slug: r.slug,
          section: r.section,
          title: r.title,
          description: r.description ?? undefined,
          savedAt: r.saved_at,
        }));
        // Read-only mirror so the offline page can list account saves too.
        try {
          localStorage.setItem('tap-library-mirror', JSON.stringify(items));
        } catch {}
        return { items, synced: true };
      }
    } catch {}
  }
  return { items: readLocal().sort((a, b) => b.savedAt.localeCompare(a.savedAt)), synced: false };
}

export async function isSaved(slug: string): Promise<boolean> {
  const { items } = await listSaved();
  return items.some((a) => a.slug === slug);
}

export async function saveArticle(meta: Omit<SavedArticle, 'savedAt'>): Promise<void> {
  const entry: SavedArticle = { ...meta, savedAt: new Date().toISOString() };
  const supabase = await getClient();
  const user = supabase ? await getUser() : null;
  let stored = false;
  if (supabase && user) {
    try {
      const { error } = await supabase.from('saved_articles').upsert(
        {
          user_id: user.id,
          slug: entry.slug,
          section: entry.section,
          title: entry.title,
          description: entry.description ?? null,
          saved_at: entry.savedAt,
        },
        { onConflict: 'user_id,slug' }
      );
      stored = !error;
    } catch {}
  }
  if (!stored) {
    const local = readLocal().filter((a) => a.slug !== entry.slug);
    local.unshift(entry);
    writeLocal(local);
  }
  cacheForOffline([articleUrl(entry)]);
  emitChange();
}

export async function removeArticle(slug: string): Promise<void> {
  const supabase = await getClient();
  const user = supabase ? await getUser() : null;
  if (supabase && user) {
    try {
      await supabase.from('saved_articles').delete().eq('slug', slug);
    } catch {}
  }
  writeLocal(readLocal().filter((a) => a.slug !== slug));
  emitChange();
}

/** Empty the whole library — account rows (if signed in) and the device store. */
export async function clearAll(): Promise<void> {
  const supabase = await getClient();
  const user = supabase ? await getUser() : null;
  if (supabase && user) {
    try {
      await supabase.from('saved_articles').delete().eq('user_id', user.id);
    } catch {}
  }
  writeLocal([]);
  try {
    localStorage.removeItem('tap-library-mirror');
  } catch {}
  emitChange();
}
