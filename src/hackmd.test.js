// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import TurndownService from "turndown";
import { sanitizeEditorHtml } from "./sanitize.js";
import {
  loadHackmdToken,
  saveHackmdSettings,
  listNotes,
  getNote,
  createNote,
  updateNoteContent,
  HACKMD_API_BASE,
} from "./hackmd-api.js";
import { initHackmdSave } from "./hackmd.js";

const SAVE_DIALOG_HTML = `
<button id="hackmd-save-button">存入HackMD</button>
<div id="top-button-container"></div>
<dialog id="hackmd-save-modal">
    <h2 id="hackmd-save-heading"></h2>
    <p id="hackmd-save-bound-note"></p>
    <form id="hackmd-save-form" method="dialog">
        <div id="hackmd-save-title-row">
            <input type="text" id="hackmd-save-title" />
        </div>
        <input type="password" id="hackmd-save-token" />
        <button type="button" id="hackmd-save-settings">儲存設定</button>
        <input type="checkbox" id="hackmd-save-remember" checked />
        <textarea id="hackmd-save-note"></textarea>
        <button type="submit" id="hackmd-save-submit">存入</button>
        <button type="button" id="hackmd-save-cancel">取消</button>
    </form>
</dialog>`;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.unstubAllGlobals();
  // Unstubbing alone does not restore happy-dom's own fetch — put it back so
  // no leaked mock fires real network calls during frame teardown.
  globalThis.fetch = originalFetch;
  localStorage.clear();
});

function setupSave(binding = null) {
  const parsed = new DOMParser().parseFromString(SAVE_DIALOG_HTML, "text/html");
  document.body.replaceChildren(
    ...Array.from(parsed.body.childNodes, (n) => document.importNode(n, true)),
  );
  const editor = document.createElement("div");
  editor.id = "main-editor";
  editor.innerHTML = "<div>測試內容</div>";
  document.body.appendChild(editor);

  const toasts = [];
  let currentBinding = binding;
  const { dialog } = initHackmdSave({
    editorEl: editor,
    turndownService: new TurndownService({ headingStyle: "atx" }),
    sanitizeEditorHtml,
    showToast: (m) => toasts.push(m),
    getBinding: () => currentBinding,
    setBinding: (b) => {
      currentBinding = b;
    },
  });
  return {
    toasts,
    dialog,
    getBinding: () => currentBinding,
    $: (id) => document.getElementById(id),
  };
}

async function submit(t) {
  t.$("hackmd-save-form").dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
  // let the async handler settle
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("token storage", () => {
  it("saves token only when remember is checked; wipes on uncheck", () => {
    saveHackmdSettings({ token: "tok", remember: true });
    expect(loadHackmdToken()).toBe("tok");
    saveHackmdSettings({ token: "tok", remember: false });
    expect(loadHackmdToken()).toBe("");
  });
});

describe("hackmd-api contract (M0-verified shapes)", () => {
  it("listNotes hits /api/hackmd/notes and returns the bare array", async () => {
    const notes = [{ id: "a", title: "甲", lastChangedAt: 2 }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => notes });
    vi.stubGlobal("fetch", fetchMock);
    const r = await listNotes("tok");
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(notes);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(HACKMD_API_BASE);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("createNote POSTs {title, content} only", async () => {
    const created = { id: "n1", title: "T", content: "C", shortId: "s" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => created });
    vi.stubGlobal("fetch", fetchMock);
    const r = await createNote("tok", { title: "T", content: "C" });
    expect(r.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: "T", content: "C" });
  });

  it("updateNoteContent PATCHes {content} to /notes/{id}", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 202, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    const r = await updateNoteContent("tok", "id/1", "新內容");
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HACKMD_API_BASE}/id%2F1`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ content: "新內容" });
  });

  it("401 maps to a token error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => null }));
    const r = await listNotes("bad");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.error).toContain("Token");
  });

  it("network failure returns ok:false without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const r = await getNote("tok", "x");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });
});

describe("initHackmdSave — new-note mode", () => {
  it("requires token and title; creates note then binds the tab", async () => {
    const t = setupSave(null);
    t.$("hackmd-save-button").click();
    // empty token -> toast, no fetch
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await submit(t);
    expect(t.toasts.at(-1)).toContain("Token");
    expect(fetchMock).not.toHaveBeenCalled();

    // empty title -> toast
    t.$("hackmd-save-token").value = "tok";
    t.$("hackmd-save-title").value = "  ";
    await submit(t);
    expect(t.toasts.at(-1)).toContain("標題");
    expect(fetchMock).not.toHaveBeenCalled();

    // good path
    t.$("hackmd-save-title").value = "新筆記";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "abc", title: "新筆記", shortId: "S" }),
    });
    await submit(t);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(HACKMD_API_BASE);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.title).toBe("新筆記");
    expect(body.content).toContain("測試內容");
    expect(t.getBinding()).toEqual({ noteId: "abc", title: "新筆記" });
  });

  it("prefills title from first markdown line when empty", () => {
    const t = setupSave(null);
    vi.stubGlobal("fetch", vi.fn());
    t.$("hackmd-save-button").click();
    expect(t.$("hackmd-save-title").value).toBe("測試內容");
  });

  it("refuses to open the dialog when the editor is empty", () => {
    const t = setupSave(null);
    document.getElementById("main-editor").innerHTML = "   ";
    vi.stubGlobal("fetch", vi.fn());
    t.$("hackmd-save-button").click();
    expect(t.dialog.open).toBe(false);
    expect(t.toasts.at(-1)).toContain("空的");
  });
});

describe("initHackmdSave — update mode (bound)", () => {
  it("PATCHes without requiring a title, keeps binding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    const t = setupSave({ noteId: "note9", title: "綁定檔" });
    t.$("hackmd-save-button").click();
    // heading reflects update mode
    expect(t.$("hackmd-save-heading").textContent).toContain("更新");
    t.$("hackmd-save-token").value = "tok";
    // happy-dom dialogs do not block on confirm(); the module calls global
    // confirm — stub it to approve so the PATCH path runs.
    vi.stubGlobal("confirm", () => true);
    await submit(t);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HACKMD_API_BASE}/note9`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body).content).toContain("測試內容");
    expect(t.getBinding()).toEqual({ noteId: "note9", title: "綁定檔" });
  });

  it("cancelling the update confirm sends nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", () => false);
    const t = setupSave({ noteId: "note9", title: "綁定檔" });
    t.$("hackmd-save-button").click();
    t.$("hackmd-save-token").value = "tok";
    await submit(t);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
