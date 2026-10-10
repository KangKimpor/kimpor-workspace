// All platform inspection is isolated here; UI only consumes this adapter.
export const platform = {
  desktop: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  async applyTheme(theme: 'light' | 'dark') {
    if (!this.desktop) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTheme(theme);
  },
  async onAuthRedirect(callback: (url: string) => void): Promise<() => void> {
    if (!this.desktop) return () => {};
    const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
    const unlisten = await onOpenUrl(urls => urls.forEach(callback));
    (await getCurrent())?.forEach(callback);
    return unlisten;
  },
  async openExternal(raw: string) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['github.com', 'supabase.com', 'vercel.com'].includes(url.hostname)) throw new Error('External destination is not allowed');
    if (this.desktop) { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url.href); }
    else window.open(url.href, '_blank', 'noopener,noreferrer');
  },
  async persistStorage() { return navigator.storage?.persist ? navigator.storage.persist() : false; },
  haptic(_kind: 'light' | 'success') { /* Optional capability; no unverified browser haptic hack. */ },
  download(name: string, content: string, mime = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
