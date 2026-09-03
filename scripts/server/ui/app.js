import { t, setLang, getLang, applyStatic, kindLabel } from "./i18n.js";
import { h, clear, toast, toastError, debounce, relativeTime, detect, formatBytes } from "./util.js";
import { Health, Diagrams, Templates, Trash } from "./api.js";
import { mountViewer } from "./viewer.js";
import { mountEditor } from "./editor.js";
import { deleteItem, duplicateItem, drafts } from "./actions.js";

const app = document.getElementById("app");
const shared = { health: null, templates: [] };
let mounted = null; // { hash, destroy, canLeave }
let lastHash = "#/";

// ---------------------------------------------------------------- routing
function parseHash() {
  const raw = location.hash || "#/";
  const [pathPart, queryPart] = raw.slice(1).split("?");
  const segments = pathPart.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const params = new URLSearchParams(queryPart || "");
  return { segments, params, raw };
}

function markNav(route) {
  for (const a of document.querySelectorAll(".topnav a[data-route]")) a.classList.toggle("active", a.dataset.route === route);
}

async function route() {
  const { segments, params, raw } = parseHash();
  if (mounted && mounted.hash === raw) return;
  if (mounted?.canLeave && !mounted.canLeave()) {
    history.replaceState(null, "", lastHash);
    return;
  }
  mounted?.destroy?.();
  mounted = null;
  clear(app);
  window.scrollTo(0, 0);
  const [head, arg] = segments;
  let view;
  try {
    if (!head) {
      markNav("library");
      view = mountLibrary(params);
    } else if (head === "view" && arg) {
      markNav(null);
      view = mountViewer(app, arg);
    } else if (head === "edit" && arg) {
      markNav(null);
      view = mountEditor(app, { id: arg });
    } else if (head === "new" && arg === "draft") {
      markNav(null);
      if (!drafts.pending) {
        location.hash = "#/import";
        return;
      }
      view = mountEditor(app, { draft: drafts.pending });
      drafts.pending = null;
    } else if (head === "new" && arg) {
      markNav(null);
      view = mountEditor(app, { template: arg });
    } else if (head === "import") {
      markNav("import");
      view = mountImport();
    } else if (head === "trash") {
      markNav("trash");
      view = mountTrash();
    } else {
      location.hash = "#/";
      return;
    }
  } catch (err) {
    toastError(err);
  }
  mounted = { hash: raw, ...(view || {}) };
  lastHash = raw;
}

// ---------------------------------------------------------------- shell
async function boot() {
  document.documentElement.lang = getLang();
  applyStatic();
  const langButton = document.getElementById("lang-toggle");
  langButton.textContent = getLang() === "ko" ? "EN" : "한국어";
  langButton.addEventListener("click", () => {
    setLang(getLang() === "ko" ? "en" : "ko");
    langButton.textContent = getLang() === "ko" ? "EN" : "한국어";
    applyStatic();
    buildNewMenu();
    updateEngineStatus();
    const hash = mounted?.hash;
    mounted = null;
    location.hash = hash || "#/";
    route();
  });

  const menuButton = document.getElementById("new-menu-button");
  const menu = document.getElementById("new-menu");
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !document.getElementById("new-menu-root").contains(event.target)) menu.hidden = true;
  });
  menu.addEventListener("click", () => {
    menu.hidden = true;
  });

  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", (event) => {
    if (mounted?.canLeave && !mounted.canLeave(true)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  try {
    const [health, templates] = await Promise.all([Health.get(), Templates.list()]);
    shared.health = health;
    shared.templates = templates.items || [];
  } catch (err) {
    toastError(err);
  }
  updateEngineStatus();
  buildNewMenu();
  route();
}

function updateEngineStatus() {
  const pill = document.getElementById("engine-status");
  const archify = shared.health?.engines?.archify;
  if (!shared.health) {
    pill.className = "status-pill bad";
    pill.textContent = "offline";
    return;
  }
  pill.className = `status-pill ${archify?.available ? "ok" : "bad"}`;
  pill.textContent = archify?.available ? t("engine.ok", { v: archify.version }) : t("engine.boardOnly");
  pill.title = `hansol-100 ${shared.health.version} · ${shared.health.library?.dir || ""}`;
}

function buildNewMenu() {
  const menu = document.getElementById("new-menu");
  clear(menu);
  const boards = shared.templates.filter((tpl) => tpl.engine === "board");
  const archify = shared.templates.filter((tpl) => tpl.engine === "archify");
  if (boards.length) menu.append(h("div.menu-group", t("new.boards")));
  for (const tpl of boards) menu.append(h("a", { href: `#/new/${encodeURIComponent(tpl.name)}` }, tpl.title, h("small", tpl.description)));
  if (archify.length) menu.append(h("div.menu-group", t("new.archify")));
  for (const tpl of archify) menu.append(h("a", { href: `#/new/${encodeURIComponent(tpl.name)}` }, `${kindLabel(tpl.kind)} — ${tpl.title}`, h("small", tpl.description)));
  if (!shared.templates.length) menu.append(h("div.menu-group", "—"));
}

// ---------------------------------------------------------------- library
function kindBadge(kind) {
  return h("span.badge", { class: `kind-${kind || "invalid"}` }, kindLabel(kind));
}

function mountLibrary(params) {
  const state = { q: params.get("q") || "", kind: params.get("kind") || "", sort: params.get("sort") || "updated" };
  const search = h("input.input", { type: "search", placeholder: t("library.search"), value: state.q, "aria-label": t("library.search") });
  const sort = h(
    "select.select",
    { "aria-label": "sort" },
    h("option", { value: "updated", selected: state.sort === "updated" }, t("sort.updated")),
    h("option", { value: "title", selected: state.sort === "title" }, t("sort.title")),
  );
  const chips = h("div.chips");
  const count = h("span.dim");
  const grid = h("div.grid");
  const help = h("p.hint", t("misc.searchHelp"));

  const page = h(
    "div.page",
    h("div.page-head", h("div", h("h1", t("library.title")), h("p", t("library.subtitle")))),
    h("div.toolbar", { style: { marginBottom: "12px" } }, h("div.search", search), sort, count),
    chips,
    help,
    h("div.mt", grid),
  );
  app.append(page);

  function syncHash() {
    const qs = new URLSearchParams();
    if (state.q) qs.set("q", state.q);
    if (state.kind) qs.set("kind", state.kind);
    if (state.sort !== "updated") qs.set("sort", state.sort);
    const next = `#/${qs.toString() ? `?${qs}` : ""}`;
    history.replaceState(null, "", next);
    if (mounted) mounted.hash = next;
    lastHash = next;
  }

  function renderChips(byKind) {
    clear(chips);
    const total = Object.values(byKind || {}).reduce((a, b) => a + b, 0);
    const make = (kind, label, n) =>
      h(
        "button.chip",
        { type: "button", class: state.kind === kind ? "active" : "", onclick: () => { state.kind = kind; syncHash(); load(); } },
        label,
        h("span.count", String(n)),
      );
    chips.append(make("", t("library.all"), total));
    for (const kind of ["board", "architecture", "workflow", "sequence", "dataflow", "lifecycle"]) {
      if (byKind?.[kind]) chips.append(make(kind, kindLabel(kind), byKind[kind]));
    }
  }

  async function load() {
    try {
      const [result, health] = await Promise.all([Diagrams.list({ q: state.q, kind: state.kind, sort: state.sort }), Health.get()]);
      shared.health = health;
      renderChips(health.library?.byKind);
      count.textContent = state.q ? t("library.matches", { n: result.total }) : t("library.count", { n: result.total });
      clear(grid);
      if (!result.items.length) {
        grid.append(
          h("div.empty", { style: { gridColumn: "1 / -1" } }, h("h2", state.q ? t("library.noResults") : t("library.empty")), state.q ? null : h("p", t("library.emptyHint"))),
        );
        return;
      }
      for (const item of result.items) grid.append(card(item));
    } catch (err) {
      toastError(err);
    }
  }

  function card(item) {
    const viewHref = `#/view/${encodeURIComponent(item.id)}`;
    const editHref = `#/edit/${encodeURIComponent(item.id)}`;
    const thumb = item.kind === "board" && !item.invalid
      ? h("a.thumb", { href: viewHref }, h("img", { src: Diagrams.svgUrl(item.id), alt: item.title, loading: "lazy" }))
      : h("a.thumb", { href: viewHref, style: { background: item.invalid ? "#7a2e0a" : `var(--kind-${item.kind})` } }, h("div.glyph", kindLabel(item.kind), h("small", item.invalid ? item.invalid : item.title)));
    const meta = item.invalid
      ? [h("span", { style: { color: "var(--danger)" } }, item.invalid)]
      : [
          item.counts?.lanes ? h("span", `${t("info.lanes")} ${item.counts.lanes}`) : null,
          item.counts?.stages ? h("span", `${t("info.stages")} ${item.counts.stages}`) : null,
          h("span", `${t("info.nodes")} ${item.counts?.nodes ?? 0}`),
          h("span", `${t("info.edges")} ${item.counts?.edges ?? 0}`),
          h("span", { title: item.updatedAt }, t("misc.updated", { when: relativeTime(item.updatedAt) })),
        ];
    const matches = item.matches?.length
      ? h("p.matches", item.matches.slice(0, 3).flatMap((m, i) => [i ? " · " : "", h("b", `${m.field}: `), m.text]))
      : null;
    return h(
      "article.card",
      { class: item.invalid ? "invalid" : "" },
      thumb,
      h("div.body", h("h2.title", h("a", { href: viewHref, title: item.title }, item.title), kindBadge(item.kind)), item.subtitle ? h("p.subtitle", { title: item.subtitle }, item.subtitle) : null, h("div.meta", meta), matches),
      h(
        "div.actions",
        h("a.ghost", { href: viewHref }, t("action.view")),
        h("a.ghost", { href: editHref }, t("action.edit")),
        h("button.ghost", { type: "button", onclick: () => duplicateItem(item) }, t("action.duplicate")),
        h("span.spacer"),
        h("button.ghost", { type: "button", onclick: () => deleteItem(item, load) }, t("action.delete")),
      ),
    );
  }

  search.addEventListener("input", debounce(() => { state.q = search.value.trim(); syncHash(); load(); }, 250));
  sort.addEventListener("change", () => { state.sort = sort.value; syncHash(); load(); });
  load();
  return { destroy() {} };
}

// ---------------------------------------------------------------- import
function mountImport() {
  const area = h("textarea.textarea.import-area", { placeholder: t("import.placeholder"), spellcheck: "false" });
  const file = h("input", { type: "file", accept: ".json,application/json" });
  const error = h("div.notice.bad", { hidden: true });
  const go = h("button.btn.primary", { type: "button", onclick: open }, t("import.go"));
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    area.value = await chosen.text();
    open();
  });
  function open() {
    error.hidden = true;
    let doc;
    try {
      doc = JSON.parse(area.value);
    } catch (err) {
      error.textContent = t("import.invalidJson", { message: err.message });
      error.hidden = false;
      return;
    }
    if (!detect(doc)) {
      error.textContent = t("import.unknown");
      error.hidden = false;
      return;
    }
    drafts.pending = doc;
    location.hash = "#/new/draft";
  }
  app.append(
    h(
      "div.page",
      h("div.panel", h("h2", t("import.title")), h("p", t("import.subtitle")), area, h("div.toolbar.mt", file, h("span.grow"), go), h("div.mt", error)),
    ),
  );
  return { destroy() {} };
}

// ---------------------------------------------------------------- trash
function mountTrash() {
  const list = h("ul.list");
  const panel = h("div.panel", h("h2", t("trash.title")), h("p", t("trash.subtitle")), list);
  app.append(h("div.page", panel));
  async function load() {
    clear(list);
    try {
      const result = await Trash.list();
      if (!result.items.length) {
        list.append(h("li", h("span.dim", t("trash.empty"))));
        return;
      }
      for (const entry of result.items) {
        list.append(
          h(
            "li",
            h("div.grow", h("div", h("b", entry.id)), h("div.dim", `${entry.trashedAt ? relativeTime(entry.trashedAt) : ""} · ${formatBytes(entry.bytes)} · `, h("code", entry.file))),
            h("button.btn.small", { type: "button", onclick: async () => {
              try {
                const restored = await Trash.restore(entry.file);
                toast(t("toast.restored", { id: restored.item.id }), "success");
                load();
              } catch (err) {
                toastError(err);
              }
            } }, t("action.restore")),
          ),
        );
      }
    } catch (err) {
      toastError(err);
    }
  }
  load();
  return { destroy() {} };
}

boot();
