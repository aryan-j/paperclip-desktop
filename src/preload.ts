import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("paperclip", {
  updater: {
    onStatus: (cb: (data: { status: string; version?: string; percent?: number }) => void) => {
      ipcRenderer.on("update-status", (_e, data) => cb(data));
    },
  },
});

const nativeSidebarLayoutChannel = "paperclip-native-toolbar:layout";
let observedContent: HTMLElement | null = null;
let contentResizeObserver: ResizeObserver | null = null;
let lastReportedSidebarEdge = -1;

function reportNativeSidebarLayout(): void {
  const sidebar = document.querySelector("aside") as HTMLElement | null;
  if (sidebar && sidebar.dataset.paperclipNativeInset !== "true") {
    sidebar.style.paddingTop = "20px";
    sidebar.dataset.paperclipNativeInset = "true";
  }

  const content = document.querySelector("main#main-content") as HTMLElement | null;
  if (!content) {
    return;
  }

  if (content !== observedContent) {
    contentResizeObserver?.disconnect();
    observedContent = content;
    contentResizeObserver = new ResizeObserver(reportNativeSidebarLayout);
    contentResizeObserver.observe(content);
  }

  const edge = Math.round(content.getBoundingClientRect().left * 10) / 10;
  if (edge === lastReportedSidebarEdge) {
    return;
  }

  lastReportedSidebarEdge = edge;
  ipcRenderer.send(nativeSidebarLayoutChannel, { sidebarRight: edge, sidebarWidth: edge });
}

const sidebarMutationObserver = new MutationObserver(reportNativeSidebarLayout);
function observeNativeSidebar(): void {
  if (!document.documentElement) {
    return;
  }

  sidebarMutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  reportNativeSidebarLayout();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeNativeSidebar, { once: true });
} else {
  observeNativeSidebar();
}
