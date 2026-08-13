/**
 * Shared, reactive UI state (Svelte 5 runes) for the app chrome:
 * the active dialog, the context menu, toasts, and the multi-select set.
 * Both the tree and the folder view drive these, so the actual dialog/menu
 * render once in the layout.
 */
import { SvelteSet } from 'svelte/reactivity';

export interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

export type Dialog =
  | { kind: 'bookmark-new'; branchId: number }
  | {
      kind: 'bookmark-edit';
      id: number;
      title: string;
      url: string;
      notes: string;
      branchId: number;
      linkIgnore: boolean;
      tags: string[];
    }
  | { kind: 'note-view'; id: number; title: string; notes: string; url: string; branchId: number; tags: string[] }
  | { kind: 'tag-edit'; id: number; name: string; hue: number }
  | { kind: 'folder-new'; parentId: number }
  | { kind: 'folder-rename'; id: number; name: string }
  | { kind: 'bulk-move'; action: 'move' | 'copy'; bookmarkIds: number[]; branchIds: number[] }
  | { kind: 'bulk-tags'; bookmarkIds: number[]; current: string[] }
  | { kind: 'confirm'; message: string; confirmLabel: string; run: () => void }
  | null;

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'error';
  action?: { label: string; run: () => void };
}

class UiState {
  dialog = $state<Dialog>(null);
  menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  toasts = $state<Toast[]>([]);
  showFolders = $state(false); // show sub-folder tiles in the main pane (off by default)
  narrow = $state(false); // true when the sidebar tree is collapsed to a drawer
  drag = $state<{ kind: 'bookmark' | 'branch'; id: number } | null>(null); // active internal drag
  faviconVersion = $state(0); // bump to force favicon <img>s to reload after a change
  zoom = $state(1); // current UI zoom (CSS `zoom` on <html>); overlays divide by it

  // Multi-select (bulk operations). Reactive sets of bookmark / folder ids.
  selBookmarks = new SvelteSet<number>();
  selFolders = new SvelteSet<number>();
  get selCount() {
    return this.selBookmarks.size + this.selFolders.size;
  }
  clearSel() {
    this.selBookmarks.clear();
    this.selFolders.clear();
  }

  #tid = 0;

  openDialog(d: Dialog) {
    this.menu = null;
    this.dialog = d;
  }
  closeDialog() {
    this.dialog = null;
  }

  openMenu(x: number, y: number, items: MenuItem[]) {
    this.menu = { x, y, items };
  }
  closeMenu() {
    this.menu = null;
  }

  toast(message: string, tone: 'ok' | 'error' = 'ok', action?: { label: string; run: () => void }) {
    const id = ++this.#tid;
    this.toasts = [...this.toasts, { id, message, tone, action }];
    // Actionable toasts (e.g. Undo) linger a little longer.
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), action ? 6000 : 3200);
  }
  dismissToast(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const ui = new UiState();
