import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const requireDesktop = () => {
  if (!isTauri()) throw new Error("ファイル操作とPDF保存はWindows版アプリで利用できます。");
};

export const bridge = {
  async open(paths) {
    requireDesktop();
    return invoke("open_documents", { paths: paths ?? null });
  },
  async activate(documentId) {
    requireDesktop();
    return invoke("activate_document", { documentId });
  },
  async reload(documentId) {
    requireDesktop();
    return invoke("reload_document", { documentId });
  },
  async close(documentId) {
    requireDesktop();
    return invoke("close_document", { documentId });
  },
  async readImage(documentId, reference) {
    requireDesktop();
    return invoke("read_image", { documentId, reference });
  },
  async savePdf(documentId) {
    requireDesktop();
    return invoke("export_pdf", { documentId });
  },
  async openExternal(url) {
    requireDesktop();
    return invoke("open_external", { url });
  },
  async exit() {
    requireDesktop();
    return invoke("exit_app");
  },
  async onDrop(handler, hover) {
    if (!isTauri()) return () => {};
    const unlisteners = [];
    try {
      unlisteners.push(await listen("tauri://drag-enter", () => hover(true)));
      unlisteners.push(await listen("tauri://drag-leave", () => hover(false)));
      unlisteners.push(await listen("tauri://drag-drop", ({ payload }) => {
        hover(false);
        if (!payload.paths.length) {
          handler(null, "Markdownファイルをドロップしてください。");
        } else {
          handler(payload.paths);
        }
      }));
      return () => unlisteners.forEach((unlisten) => unlisten());
    } catch (error) {
      unlisteners.forEach((unlisten) => unlisten());
      throw error;
    }
  }
};
