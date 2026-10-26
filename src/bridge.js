import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const requireDesktop = () => {
  if (!isTauri()) throw new Error("ファイル操作とPDF保存はWindows版アプリで利用できます。");
};

export const bridge = {
  async open(path) {
    requireDesktop();
    return invoke("open_document", { path: path ?? null });
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
        if (payload.paths.length !== 1) {
          handler(null, "Markdownファイルを1つだけドロップしてください。");
        } else {
          handler(payload.paths[0]);
        }
      }));
      return () => unlisteners.forEach((unlisten) => unlisten());
    } catch (error) {
      unlisteners.forEach((unlisten) => unlisten());
      throw error;
    }
  }
};
