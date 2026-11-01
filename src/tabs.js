/** @id CODE-TABS-003 @implements REQ-TABS-003 */
export class ReadingTabs {
  constructor() { this.items = []; this.active = null; }
  add(document) {
    let tab = this.items.find((item) => item.document.id === document.id);
    if (!tab) {
      if (this.items.length >= 20) throw new Error("開けるタブは20個までです。");
      tab = { document, content: null, scroll: 0, scrollLeft: 0, zoom: 100, errors: [] };
      this.items.push(tab);
    }
    this.active = tab;
    return tab;
  }
  select(id) {
    const tab = this.items.find((item) => item.document.id === id);
    if (!tab) throw new Error("タブが見つかりません。");
    this.active = tab;
    return tab;
  }
  move(id, index) {
    const from = this.items.findIndex((item) => item.document.id === id);
    if (from < 0) throw new Error("タブが見つかりません。");
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) {
      throw new Error("タブの移動先が不正です。");
    }
    const [tab] = this.items.splice(from, 1);
    this.items.splice(index, 0, tab);
  }
  close(id) {
    const index = this.items.findIndex((item) => item.document.id === id);
    if (index < 0) throw new Error("タブが見つかりません。");
    const [closed] = this.items.splice(index, 1);
    if (closed === this.active) this.active = this.items[index] ?? this.items.at(-1) ?? null;
    return this.active;
  }
  /** @id CODE-ZOOM-001 @implements REQ-ZOOM-001 */
  zoom(action) {
    if (!this.active) throw new Error("文書を開いてください。");
    if (!["in", "out", "reset"].includes(action)) throw new Error("倍率の操作が不正です。");
    this.active.zoom = action === "reset" ? 100
      : Math.max(50, Math.min(200, this.active.zoom + (action === "in" ? 10 : -10)));
    return this.active.zoom;
  }
}
