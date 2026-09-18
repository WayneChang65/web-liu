// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import TurndownService from "turndown";
import { sanitizeEditorHtml } from "./sanitize.js";
import {
  buildHackmdPayload,
  postHackmdDoc,
  initHackmd,
  loadHackmdToken,
  loadHackmdPrefs,
} from "./hackmd.js";

const DIALOG_HTML = `
<button id="hackmd-button">存入HackMD</button>
<div id="top-button-container" class="expanded"></div>
<dialog id="hackmd-modal">
    <form id="hackmd-form" method="dialog">
        <input type="password" id="hackmd-token" />
        <input type="text" id="hackmd-title" />
        <input type="text" id="hackmd-description" />
        <select id="hackmd-permission">
            <option value="private">private</option>
            <option value="public">public</option>
            <option value="team">team</option>
        </select>
        <input type="text" id="hackmd-permalink" />
        <textarea id="hackmd-note"></textarea>
        <input type="checkbox" id="hackmd-remember" checked />
        <button type="button" id="hackmd-save-settings">儲存設定</button>
        <button type="submit" id="hackmd-submit">存入</button>
        <button type="button" id="hackmd-cancel">取消</button>
    </form>
</dialog>`;

function setup() {
  // Static fixture markup — inert-parsed and imported (never innerHTML).
  const parsed = new DOMParser().parseFromString(DIALOG_HTML, "text/html");
  document.body.replaceChildren(
    ...Array.from(parsed.body.childNodes, (n) => document.importNode(n, true)),
  );
  const editor = document.createElement("div");
  editor.id = "main-editor";
  editor.innerHTML = "<div>測試內容</div>";
  document.body.appendChild(editor);

  const toasts = [];
  const { dialog } = initHackmd({
    editorEl: editor,
    turndownService: new TurndownService({ headingStyle: "atx" }),
    sanitizeEditorHtml,
    showToast: (m) => toasts.push(m),
  });
  return {
    toasts,
    dialog,
    $: (id) => document.getElementById(id),
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.unstubAllGlobals();
  // Unstubbing alone does not restore happy-dom's own fetch — put it back so
  // no leaked mock fires real network calls during frame teardown.
  globalThis.fetch = originalFetch;
});

describe("buildHackmdPayload", () => {
  it("always includes title and note, omits empty optionals", () => {
    expect(
      buildHackmdPayload({
        title: "T",
        description: "",
        note: "N",
        permission: "",
        permaLink: "",
      }),
    ).toEqual({ title: "T", note: "N" });
  });

  it("includes optional fields when provided", () => {
    expect(
      buildHackmdPayload({
        title: "T",
        description: "D",
        note: "N",
        permission: "public",
        permaLink: "my-note",
      }),
    ).toEqual({
      title: "T",
      description: "D",
      note: "N",
      permission: "public",
      permaLink: "my-note",
    });
  });
});

describe("postHackmdDoc", () => {
  it("returns the doc data on a successful API response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: { id: "abc", shortId: "abc", permaLink: "my-note" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postHackmdDoc({
      token: "tk",
      payload: { title: "T", note: "N" },
    });
    expect(result).toEqual({
      ok: true,
      data: { id: "abc", shortId: "abc", permaLink: "my-note" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/hackmd/v1/docs");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tk");
    expect(JSON.parse(init.body)).toEqual({ title: "T", note: "N" });
  });

  it("surfaces the API error message on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid token" }),
      }),
    );
    const result = await postHackmdDoc({ token: "bad", payload: {} });
    expect(result).toEqual({ ok: false, error: "invalid token" });
  });

  it("reports a proxy/network failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const result = await postHackmdDoc({ token: "tk", payload: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("代理");
  });

  it("falls back to the HTTP status when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("not json");
        },
      }),
    );
    const result = await postHackmdDoc({ token: "tk", payload: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("502");
  });
});

describe("initHackmd dialog flow", () => {
  it("opens with editor content converted to markdown", () => {
    const { dialog, $ } = setup();
    $("hackmd-button").click();
    expect(dialog.open).toBe(true);
    expect($("hackmd-note").value).toContain("測試內容");
    // default title prefilled from first line
    expect($("hackmd-title").value).toBe("測試內容");
  });

  it("rejects submit without token and keeps dialog open", async () => {
    const { dialog, toasts, $ } = setup();
    $("hackmd-button").click();
    $("hackmd-title").value = "標題";
    $("hackmd-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.at(-1)).toContain("Token");
    expect(dialog.open).toBe(true);
  });

  it("rejects an invalid permaLink before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { dialog, toasts, $ } = setup();
    $("hackmd-button").click();
    $("hackmd-token").value = "tk";
    $("hackmd-title").value = "標題";
    $("hackmd-permalink").value = "中文 id!";
    $("hackmd-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.at(-1)).toContain("自有代稱");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
  });

  it("saves the doc and persists settings on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { shortId: "abc123" } }),
    }));
    const { dialog, toasts, $ } = setup();
    $("hackmd-button").click();
    $("hackmd-token").value = " tk-token ";
    $("hackmd-title").value = "我的筆記";
    $("hackmd-permission").value = "public";
    $("hackmd-form").dispatchEvent(new Event("submit", { cancelable: true }));

    await vi.waitFor(() => expect(dialog.open).toBe(false));
    expect(toasts.at(-1)).toContain("abc123");
    expect(loadHackmdToken()).toBe("tk-token");
    expect(loadHackmdPrefs()).toMatchObject({
      permission: "public",
      remember: true,
    });
  });

  it("keeps the dialog open and shows the error when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "forbidden" }),
    }));
    const { dialog, toasts, $ } = setup();
    $("hackmd-button").click();
    $("hackmd-token").value = "tk";
    $("hackmd-title").value = "標題";
    $("hackmd-form").dispatchEvent(new Event("submit", { cancelable: true }));

    await vi.waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.at(-1)).toBe("forbidden");
    expect(dialog.open).toBe(true);
    // submit button restored for retry
    expect($("hackmd-submit").disabled).toBe(false);
    expect($("hackmd-submit").textContent).toBe("存入");
  });

  it("unchecking remember wipes stored token and prefs", async () => {
    localStorage.setItem("boshiamy-hackmd-token", "old");
    localStorage.setItem("boshiamy-hackmd-prefs", JSON.stringify({ remember: true }));
    const { $ } = setup();
    $("hackmd-button").click();
    // prefilled from storage
    expect($("hackmd-token").value).toBe("old");
    $("hackmd-remember").checked = false;
    $("hackmd-save-settings").click();
    expect(loadHackmdToken()).toBe("");
    expect(loadHackmdPrefs()).toEqual({});
  });
});
