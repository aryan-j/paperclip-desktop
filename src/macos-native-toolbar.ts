import { app, BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import { existsSync } from "node:fs";
import path from "node:path";

type NativeToolbarAddon = {
  configureWindow: (nativeHandle: Buffer, onAction: (action: string) => void) => boolean;
  updateWindowLayout: (nativeHandle: Buffer, x: number, top: number) => boolean;
  disposeWindow: (nativeHandle: Buffer) => void;
};

type SidebarLayout = { x: number; top: number };

const sidebarLayouts = new WeakMap<BrowserWindow, SidebarLayout>();
const attachedToolbars = new WeakMap<BrowserWindow, { addon: NativeToolbarAddon; nativeHandle: Buffer }>();
const SIDEBAR_LAYOUT_CHANNEL = "paperclip-native-toolbar:layout";

ipcMain.on(SIDEBAR_LAYOUT_CHANNEL, (event, payload: { sidebarRight?: unknown; sidebarWidth?: unknown }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed() || process.platform !== "darwin") {
    return;
  }

  try {
    const senderUrl = new URL(event.sender.getURL());
    if (senderUrl.protocol !== "http:" || senderUrl.hostname !== "localhost") {
      return;
    }
  } catch {
    return;
  }

  const sidebarRight = Number(payload?.sidebarRight);
  const sidebarWidth = Number(payload?.sidebarWidth);
  if (
    !Number.isFinite(sidebarRight) ||
    !Number.isFinite(sidebarWidth) ||
    sidebarRight < 0 ||
    sidebarRight > 1600 ||
    sidebarWidth < 0 ||
    sidebarWidth > 1600
  ) {
    return;
  }

  const layout = {
    x: sidebarWidth < 96 ? Math.max(64, sidebarRight) : Math.max(0, sidebarRight - 36),
    top: 2,
  };
  sidebarLayouts.set(window, layout);
  const attached = attachedToolbars.get(window);
  if (attached) {
    attached.addon.updateWindowLayout(attached.nativeHandle, layout.x, layout.top);
  }
});

let nativeToolbarAddon: NativeToolbarAddon | null | undefined;

const TOGGLE_SIDEBAR_SCRIPT = `document.dispatchEvent(new KeyboardEvent('keydown', {
  key: '[',
  code: 'BracketLeft',
  bubbles: true,
  cancelable: true,
}));`;

function loadNativeToolbarAddon(): NativeToolbarAddon | null {
  if (nativeToolbarAddon !== undefined) {
    return nativeToolbarAddon;
  }

  nativeToolbarAddon = null;
  if (process.platform !== "darwin") {
    return nativeToolbarAddon;
  }

  const addonPath = app.isPackaged
    ? path.join(process.resourcesPath, "app-server", "macos-native", "paperclip_native_toolbar.node")
    : path.join(app.getAppPath(), "build", "macos-native", process.arch, "paperclip_native_toolbar.node");

  log.info(`[macos-native] Loading native sidebar bridge from ${addonPath}`);
  try {
    if (!existsSync(addonPath)) {
      log.warn(`[macos-native] Native sidebar bridge is missing at ${addonPath}`);
      return nativeToolbarAddon;
    }
    nativeToolbarAddon = require(addonPath) as NativeToolbarAddon;
    log.info("[macos-native] Native sidebar bridge loaded");
  } catch (error) {
    log.error("[macos-native] Could not load the native toolbar bridge:", error);
  }

  return nativeToolbarAddon;
}

export function attachPaperclipNativeToolbar(window: BrowserWindow): void {
  const addon = loadNativeToolbarAddon();
  if (!addon || window.isDestroyed()) {
    return;
  }

  const nativeHandle = window.getNativeWindowHandle();
  try {
    log.info("[macos-native] Attaching native sidebar controls");
    const attached = addon.configureWindow(nativeHandle, (action) => {
      if (action !== "toggle-sidebar" || window.isDestroyed()) {
        return;
      }

      void window.webContents.executeJavaScript(TOGGLE_SIDEBAR_SCRIPT).catch((error: unknown) => {
        console.warn("[macos-native] Could not toggle the Paperclip sidebar:", error);
      });
    });

    if (!attached) {
      log.error("[macos-native] Native sidebar controls did not attach to the Paperclip window.");
      return;
    }

    attachedToolbars.set(window, { addon, nativeHandle });
    const layout = sidebarLayouts.get(window);
    if (layout) {
      addon.updateWindowLayout(nativeHandle, layout.x, layout.top);
    }

    log.info("[macos-native] Native sidebar controls attached");
    window.once("closed", () => {
      addon.disposeWindow(nativeHandle);
      attachedToolbars.delete(window);
      sidebarLayouts.delete(window);
    });
  } catch (error) {
    log.error("[macos-native] Failed to configure the native Paperclip toolbar:", error);
  }
}
