import { t, kindLabel } from "./i18n.js";
import { h, clear, toast, toastError, debounce, detect, slugify, isValidId, download, dropdown } from "./util.js";
import { Diagrams, Preview, Templates } from "./api.js";
import { createCanvas, zoomBar } from "./canvas.js";
import { renderMetrics, renderReceipt, renderDiagnostics } from "./viewer.js";
import { deleteItem } from "./actions.js";

const EMPHASIS = ["lead", "key", "normal", "bottleneck", "loop"];
const EDGE_TYPES = ["sequence", "message", "loop"];

function pretty(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function uniqueName(list, base) {
  if (!list.includes(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!list.includes(`${base} ${n}`)) return `${base} ${n}`;
  return `${base} ${Date.now()}`;
}

function nextId(items, prefix) {
  const used = new Set(items.map((item) => item.id));
  for (let n = 1; n < 10_000; n += 1) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
  return `${prefix}${Date.now()}`;
}

function refsToText(refs) {
  return (refs || []).map((r) => (r.note ? `${r.source} | ${r.note}` : r.source)).join("\n");
}

function textToRefs(text) {
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [source, ...rest] = line.split("|");
      const note = rest.join("|").trim();
      return note ? { source: source.trim(), note } : { source: source.trim() };
    });
}

export function mountEditor(root, { id = null, draft = null, template = null }) {
  const state = {
    id,
    isNew: !id,
    revision: null,
    doc: null,
    text: "",
    detected: null,
    dirty: false,
    saving: false,
    tab: "form",
    formStale: false,
    jsonError: null,
    previewSeq: 0,
    lastAudit: null,
    original: null,
  };
  const container = h("div.editor", h("div.loading", t("misc.loading")));
  root.append(container);

  // ---- elements created once the document is known
  let els = {};
  let canvas = null;

  function statusText() {
    if (state.saving) return t("editor.status.saving");
    if (state.isNew) return t("editor.status.new");
    return state.dirty ? t("editor.status.dirty") : t("editor.status.saved");
  }

  function refreshStatus() {
    if (!els.status) return;
    els.status.textContent = statusText();
    els.status.classList.toggle("dirty", state.dirty || state.isNew);
    els.title.textContent = state.doc?.title || state.doc?.meta?.title || t("editor.new");
  }

  function changed({ structural = false } = {}) {
    state.dirty = true;
    state.text = pretty(state.doc);
    if (els.json && state.tab !== "json") els.json.value = state.text;
    if (structural && state.tab === "form") renderForm();
    refreshStatus();
    schedulePreview();
  }

  // ---------------------------------------------------------------- preview
  const schedulePreview = debounce(runPreview, 400);

  function setPreviewStatus(kind, text) {
    els.previewStatus.className = `badge ${kind}`;
    els.previewStatus.textContent = text;
  }

  function showErrors(errors, diagnostics) {
    clear(els.errors);
    if (!errors?.length && !diagnostics?.length) {
      els.errors.hidden = true;
      return;
    }
    els.errors.hidden = false;
    if (diagnostics?.length) els.errors.append(renderDiagnostics(diagnostics));
    else els.errors.append(h("ul.errors", errors.map((e) => h("li", e.path ? h("code", `${e.path} `) : null, e.message, e.supportedFixes?.length ? h("span.fix", `fix: ${e.supportedFixes.join("; ")}`) : null))));
  }

  async function runPreview() {
    if (!state.doc || state.jsonError) return;
    const seq = ++state.previewSeq;
    setPreviewStatus("soft", t("editor.previewPending"));
    let result;
    try {
      result = await Preview.render(state.doc);
    } catch (err) {
      if (seq !== state.previewSeq) return;
      setPreviewStatus("bad", t("editor.previewInvalid", { n: 1 }));
      showErrors([{ path: "", message: err.message }]);
      return;
    }
    if (seq !== state.previewSeq) return;
    if (!result.ok) {
      setPreviewStatus("bad", t("editor.previewInvalid", { n: (result.errors || result.diagnostics || []).length || 1 }));
      showErrors(result.errors, result.diagnostics);
      canvas?.setStale(true);
      return;
    }
    setPreviewStatus("good", t("editor.previewValid"));
    showErrors([]);
    if (result.engine === "board") {
      ensureBoardPreview();
      canvas.setSvg(result.svg);
      canvas.setStale(false);
      state.lastAudit = result.audit;
      renderAuditChips(result.audit);
    } else {
      ensureFramePreview();
      els.frame.src = result.previewUrl;
      els.openPreview.href = result.previewUrl;
      els.openPreview.hidden = false;
    }
  }

  function renderAuditChips(audit) {
    clear(els.chips);
    if (!audit) return;
    const chip = (label, value, state) => h("span.badge", { class: state || "soft" }, `${label} ${value}`);
    els.chips.append(
      chip(t("metric.nodePiercings"), audit.metrics.nodePiercings, audit.metrics.nodePiercings === 0 ? "good" : "bad"),
      chip(t("metric.crossings"), audit.metrics.crossings),
      chip(t("metric.adjustedLabels"), audit.metrics.adjustedLabels),
      chip("score", audit.score, audit.violations.length ? "warn" : "good"),
    );
  }

  function ensureBoardPreview() {
    if (canvas) return;
    canvas = createCanvas();
    clear(els.previewBody);
    els.previewBody.append(canvas.el);
    els.zoom.hidden = false;
    els.zoom.append(zoomBar(canvas));
    els.frame = null;
    els.openPreview.hidden = true;
  }

  function ensureFramePreview() {
    if (els.frame) return;
    canvas?.destroy();
    canvas = null;
    clear(els.previewBody);
    clear(els.zoom);
    els.zoom.hidden = true;
    els.frame = h("iframe.frame", { title: t("editor.preview") });
    els.previewBody.append(els.frame);
  }

  // ---------------------------------------------------------------- form (board)
  function input(value, onInput, extra = {}) {
    const el = h("input.input", { type: "text", value: value ?? "", ...extra });
    el.addEventListener("input", () => onInput(el.value));
    return el;
  }

  function select(options, value, onChange, extra = {}) {
    const el = h("select.select", extra, options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)));
    el.addEventListener("change", () => onChange(el.value));
    return el;
  }

  function field(label, control) {
    return h("div.field", h("label", label), control);
  }

  function section(title, action, ...body) {
    return h("div.form-section", h("h3", title, h("span.spacer"), action), ...body);
  }

  function addButton(label, onclick) {
    return h("button.btn.small", { type: "button", onclick }, label);
  }

  function listEditor(kind) {
    const doc = state.doc;
    const list = kind === "lane" ? doc.lanes : doc.stages;
    const key = kind; // node field name
    return h(
      "div.rowlist",
      list.map((name, index) => {
        const nameInput = h("input.input", { type: "text", value: name, title: t("form.renameHint") });
        nameInput.addEventListener("change", () => {
          const next = nameInput.value.trim();
          const old = list[index];
          if (!next || next === old) {
            nameInput.value = old;
            return;
          }
          if (list.includes(next)) {
            toast(`"${next}" already exists`, "error");
            nameInput.value = old;
            return;
          }
          list[index] = next;
          for (const node of doc.nodes) if (node[key] === old) node[key] = next;
          changed({ structural: true });
        });
        const move = (delta) => {
          const target = index + delta;
          if (target < 0 || target >= list.length) return;
          [list[index], list[target]] = [list[target], list[index]];
          changed({ structural: true });
        };
        const remove = () => {
          const used = doc.nodes.filter((node) => node[key] === name).length;
          if (used) {
            toast(`${used} node(s) still use "${name}"`, "error");
            return;
          }
          if (list.length <= 1) return;
          list.splice(index, 1);
          changed({ structural: true });
        };
        return h(
          "div.row",
          nameInput,
          h("button.ghost", { type: "button", title: t("form.moveUp"), onclick: () => move(-1), disabled: index === 0 }, "↑"),
          h("button.ghost", { type: "button", title: t("form.moveDown"), onclick: () => move(1), disabled: index === list.length - 1 }, "↓"),
          h("button.ghost", { type: "button", title: t("form.remove"), onclick: remove }, "✕"),
        );
      }),
    );
  }

  function nodeRow(node, index) {
    const doc = state.doc;
    const laneOptions = doc.lanes.map((l) => [l, l]);
    const stageOptions = doc.stages.map((s) => [s, s]);
    const idInput = h("input.input.mono", { type: "text", value: node.id, "aria-label": "node id" });
    idInput.addEventListener("change", () => {
      const next = idInput.value.trim();
      const old = node.id;
      if (!next || next === old) {
        idInput.value = old;
        return;
      }
      if (doc.nodes.some((n) => n !== node && n.id === next)) {
        toast(`node id "${next}" already exists`, "error");
        idInput.value = old;
        return;
      }
      node.id = next;
      for (const edge of doc.edges) {
        if (edge.source === old) edge.source = next;
        if (edge.target === old) edge.target = next;
      }
      changed({ structural: true });
    });
    const remove = () => {
      doc.nodes.splice(index, 1);
      doc.edges = doc.edges.filter((e) => e.source !== node.id && e.target !== node.id);
      changed({ structural: true });
    };
    const refs = h("textarea.textarea", { placeholder: t("form.refs"), rows: 1, value: refsToText(node.refs) });
    refs.addEventListener("input", () => {
      const parsed = textToRefs(refs.value);
      if (parsed.length) node.refs = parsed;
      else delete node.refs;
      changed();
    });
    return h(
      "div.noderow",
      h(
        "div.line.head",
        idInput,
        select(laneOptions, node.lane, (v) => { node.lane = v; changed(); }, { "aria-label": "lane" }),
        select(stageOptions, node.stage, (v) => { node.stage = v; changed(); }, { "aria-label": "stage" }),
        select(EMPHASIS.map((e) => [e, t(`emphasis.${e}`)]), node.emphasis || "normal", (v) => { node.emphasis = v; changed(); }, { "aria-label": "emphasis" }),
        h("button.ghost", { type: "button", title: t("form.remove"), onclick: remove }, "✕"),
      ),
      h(
        "div.line.label",
        input(node.label, (v) => { node.label = v; changed(); }, { placeholder: t("form.label"), "aria-label": "label" }),
        input(node.note || "", (v) => { if (v) node.note = v; else delete node.note; changed(); }, { placeholder: t("form.note"), "aria-label": "note" }),
      ),
      h("div.line.refs", refs),
    );
  }

  function edgeRow(edge, index) {
    const doc = state.doc;
    const nodeOptions = doc.nodes.map((n) => [n.id, `${n.id} · ${n.label}`]);
    const idInput = h("input.input.mono", { type: "text", value: edge.id, "aria-label": "edge id" });
    idInput.addEventListener("change", () => {
      const next = idInput.value.trim();
      if (!next || doc.edges.some((e) => e !== edge && e.id === next)) {
        idInput.value = edge.id;
        return;
      }
      edge.id = next;
      changed();
    });
    return h(
      "div.edgerow",
      h(
        "div.line.head",
        idInput,
        select(nodeOptions, edge.source, (v) => { edge.source = v; changed(); }, { "aria-label": "source" }),
        h("span.arrow", "→"),
        select(nodeOptions, edge.target, (v) => { edge.target = v; changed(); }, { "aria-label": "target" }),
        select(EDGE_TYPES.map((k) => [k, t(`edgeType.${k}`)]), edge.type || "sequence", (v) => { edge.type = v; changed(); }, { "aria-label": "edge type" }),
        h("button.ghost", { type: "button", title: t("form.remove"), onclick: () => { doc.edges.splice(index, 1); changed({ structural: true }); } }, "✕"),
      ),
      h("div.line.label", input(edge.label || "", (v) => { if (v) edge.label = v; else delete edge.label; changed(); }, { placeholder: t("form.edgeLabel"), "aria-label": "edge label" })),
    );
  }

  function renderForm() {
    clear(els.form);
    const doc = state.doc;
    if (state.detected?.engine !== "board") {
      els.form.append(h("div.notice", t("editor.jsonOnlyHint", { kind: state.detected?.kind || "?" })));
      return;
    }
    const addNode = () => {
      doc.nodes.push({ id: nextId(doc.nodes, "n"), lane: doc.lanes[0], stage: doc.stages[0], label: t("form.newNode"), emphasis: "normal" });
      changed({ structural: true });
    };
    const addEdge = () => {
      if (doc.nodes.length < 1) return;
      doc.edges.push({ id: nextId(doc.edges, "e"), source: doc.nodes[0].id, target: (doc.nodes[1] || doc.nodes[0]).id, type: "sequence" });
      changed({ structural: true });
    };
    els.form.append(
      section(
        t("form.basic"),
        null,
        field(t("form.title"), input(doc.title, (v) => { doc.title = v; changed(); }, { "aria-label": t("form.title") })),
        field(t("form.subtitle"), input(doc.subtitle || "", (v) => { if (v) doc.subtitle = v; else delete doc.subtitle; changed(); }, { "aria-label": t("form.subtitle") })),
        field(t("form.profile"), select([["default", t("form.profile.default")], ["gov", t("form.profile.gov")]], doc.profile || "default", (v) => { if (v === "default") delete doc.profile; else doc.profile = v; changed(); }, { "aria-label": t("form.profile") })),
      ),
      section(t("form.lanes"), addButton(t("form.addLane"), () => { doc.lanes.push(uniqueName(doc.lanes, t("form.newLane"))); changed({ structural: true }); }), listEditor("lane")),
      section(t("form.stages"), addButton(t("form.addStage"), () => { doc.stages.push(uniqueName(doc.stages, t("form.newStage"))); changed({ structural: true }); }), listEditor("stage")),
      section(t("form.nodes"), addButton(t("form.addNode"), addNode), h("div.rowlist", doc.nodes.map((node, i) => nodeRow(node, i)))),
      section(t("form.edges"), addButton(t("form.addEdge"), addEdge), h("div.rowlist", doc.edges.map((edge, i) => edgeRow(edge, i)))),
    );
  }

  // ---------------------------------------------------------------- JSON tab
  function onJsonInput() {
    let parsed;
    try {
      parsed = JSON.parse(els.json.value);
    } catch (err) {
      state.jsonError = err.message;
      els.jsonError.textContent = err.message;
      els.jsonError.hidden = false;
      return;
    }
    state.jsonError = null;
    els.jsonError.hidden = true;
    state.doc = parsed;
    state.text = els.json.value;
    state.detected = detect(parsed);
    state.formStale = true;
    state.dirty = true;
    refreshStatus();
    updateKindBadge();
    if (!state.detected) {
      setPreviewStatus("bad", t("import.unknown"));
      showErrors([{ path: "", message: t("import.unknown") }]);
      return;
    }
    schedulePreview();
  }

  function updateKindBadge() {
    els.kind.className = `badge kind-${state.detected?.kind || "invalid"}`;
    els.kind.textContent = kindLabel(state.detected?.kind);
    els.formTab.hidden = state.detected?.engine !== "board";
    els.validateButton.hidden = state.detected?.engine !== "archify";
    if (state.detected?.engine !== "board" && state.tab === "form") switchTab("json");
  }

  function switchTab(tab) {
    state.tab = tab;
    els.formTab.classList.toggle("active", tab === "form");
    els.jsonTab.classList.toggle("active", tab === "json");
    els.formWrap.hidden = tab !== "form";
    els.jsonWrap.hidden = tab !== "json";
    els.tabHint.textContent = tab === "json" ? t("editor.jsonHint") : "";
    if (tab === "form" && state.formStale) {
      renderForm();
      state.formStale = false;
    }
    if (tab === "json") els.json.value = state.text;
  }

  // ---------------------------------------------------------------- save / lifecycle
  async function save({ saveAs = false } = {}) {
    if (!state.doc || state.saving) return;
    if (state.jsonError) {
      toast(state.jsonError, "error");
      return;
    }
    let targetId = state.id;
    if (state.isNew) {
      targetId = els.idInput.value.trim() || slugify(state.doc.title || state.doc.meta?.title || "", state.detected?.kind || "diagram");
    }
    if (saveAs) {
      const suggested = state.id ? `${state.id}-copy` : targetId;
      const answer = window.prompt(t("editor.idLabel"), suggested);
      if (answer === null) return;
      targetId = answer.trim();
    }
    if (!isValidId(targetId)) {
      toast(`${t("editor.idLabel")}: ${t("editor.idHint")}`, "error");
      return;
    }
    const create = state.isNew || saveAs;
    const attempt = async (extra = {}) =>
      create
        ? Diagrams.create({ id: targetId, source: state.doc, ...extra })
        : Diagrams.update(state.id, { source: state.doc, revision: state.revision, ...extra });

    state.saving = true;
    refreshStatus();
    try {
      let result;
      try {
        result = await attempt();
      } catch (err) {
        if (err.status === 422 && err.code === "invalid-document") {
          if (!window.confirm(t("confirm.saveInvalid"))) return;
          result = await attempt({ allowInvalid: true });
        } else if (err.status === 409 && err.code === "conflict") {
          if (window.confirm(t("confirm.conflict"))) result = await attempt({ force: true, allowInvalid: true });
          else {
            await reloadFromServer();
            toast(t("toast.reloaded"));
            return;
          }
        } else throw err;
      }
      state.id = result.item.id;
      state.isNew = false;
      state.revision = result.item.revision;
      state.dirty = false;
      state.original = pretty(state.doc);
      els.idField.hidden = true;
      els.idText.textContent = state.id;
      els.idText.hidden = false;
      els.deleteButton.hidden = false;
      els.viewLink.href = `#/view/${encodeURIComponent(state.id)}`;
      els.viewLink.hidden = false;
      const nextHash = `#/edit/${encodeURIComponent(state.id)}`;
      if (location.hash !== nextHash) history.replaceState(null, "", nextHash);
      toast(t("toast.saved"), "success");
    } catch (err) {
      toastError(err);
    } finally {
      state.saving = false;
      refreshStatus();
    }
  }

  async function reloadFromServer() {
    const item = await Diagrams.get(state.id);
    state.doc = item.source;
    state.revision = item.revision;
    state.text = pretty(item.source);
    state.original = state.text;
    state.dirty = false;
    state.detected = detect(item.source);
    state.jsonError = null;
    els.jsonError.hidden = true;
    els.json.value = state.text;
    updateKindBadge();
    renderForm();
    refreshStatus();
    schedulePreview();
  }

  async function revert() {
    if (!state.dirty) return;
    if (!window.confirm(t("confirm.revert"))) return;
    if (state.isNew) {
      state.doc = JSON.parse(state.original);
      state.text = state.original;
      state.dirty = false;
      state.detected = detect(state.doc);
      els.json.value = state.text;
      renderForm();
      refreshStatus();
      schedulePreview();
      return;
    }
    await reloadFromServer();
  }

  async function runValidation() {
    if (!state.doc || state.jsonError) return;
    els.validateButton.disabled = true;
    els.errors.hidden = false;
    clear(els.errors);
    els.errors.append(h("span.hint", t("validation.running")));
    try {
      const result = await Preview.validate(state.doc, { quality: "showcase" });
      clear(els.errors);
      els.errors.append(renderReceipt(result));
    } catch (err) {
      clear(els.errors);
      els.errors.append(h("div.notice.bad", err.message));
    } finally {
      els.validateButton.disabled = false;
    }
  }

  function onKey(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    }
  }

  // ---------------------------------------------------------------- build
  function build() {
    clear(container);
    els = {};
    els.title = h("h1", { style: { fontSize: "16px", margin: 0, maxWidth: "32vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
    els.kind = h("span.badge");
    els.status = h("span.status");
    els.idInput = h("input.input", { type: "text", placeholder: t("editor.idHint"), value: state.id || "", "aria-label": t("editor.idLabel") });
    els.idField = h("span.idfield", `${t("editor.idLabel")}:`, els.idInput);
    els.idText = h("code", { hidden: true });
    els.idField.hidden = !state.isNew;
    if (!state.isNew) {
      els.idText.textContent = state.id;
      els.idText.hidden = false;
    }
    els.validateButton = h("button.btn", { type: "button", onclick: runValidation, hidden: true }, t("action.validate"));
    els.deleteButton = h("button.btn.danger", { type: "button", hidden: state.isNew, onclick: async () => {
      if (await deleteItem({ id: state.id, title: state.doc?.title || state.doc?.meta?.title })) {
        state.dirty = false;
        location.hash = "#/";
      }
    } }, t("action.delete"));
    els.viewLink = h("a.btn", { href: state.id ? `#/view/${encodeURIComponent(state.id)}` : "#", hidden: state.isNew }, t("action.view"));
    const exportMenu = dropdown(t("action.export"), [
      { label: t("export.json"), onclick: () => download(pretty(state.doc), `${state.id || "diagram"}.json`, "application/json") },
      { label: t("export.svg"), onclick: () => { const svg = canvas?.svgText(); if (svg) download(svg, `${state.id || "board"}.svg`, "image/svg+xml"); else toast("SVG preview not available", "error"); } },
    ]);
    const head = h(
      "div.editor-head",
      h("a.btn.small", { href: "#/" }, t("action.back")),
      els.kind,
      els.title,
      els.idField,
      els.idText,
      els.status,
      h("span.spacer"),
      els.validateButton,
      exportMenu,
      els.viewLink,
      h("button.btn", { type: "button", onclick: revert }, t("action.revert")),
      h("button.btn", { type: "button", onclick: () => save({ saveAs: true }) }, t("action.saveAs")),
      els.deleteButton,
      h("button.btn.primary", { type: "button", onclick: () => save() }, t("action.save"), h("span.kbd", "⌘/Ctrl+S")),
    );

    els.formTab = h("button.tab.active", { type: "button", onclick: () => switchTab("form") }, t("editor.tab.form"));
    els.jsonTab = h("button.tab", { type: "button", onclick: () => switchTab("json") }, t("editor.tab.json"));
    els.tabHint = h("span.hint");
    els.form = h("div");
    els.formWrap = h("div.editor-scroll", els.form);
    els.json = h("textarea.json-editor", { spellcheck: "false", "aria-label": "JSON" });
    els.json.addEventListener("input", debounce(onJsonInput, 250));
    els.jsonError = h("div.json-error", { hidden: true });
    const formatButton = h("button.btn.small", { type: "button", onclick: () => { if (!state.jsonError && state.doc) { state.text = pretty(state.doc); els.json.value = state.text; } } }, t("action.format"));
    els.jsonWrap = h("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }, hidden: true }, els.json, els.jsonError);
    const left = h("div.editor-left", h("div.editor-tabs", els.formTab, els.jsonTab, els.tabHint, h("span.spacer"), formatButton), els.formWrap, els.jsonWrap);

    els.previewStatus = h("span.badge.soft", t("editor.previewIdle"));
    els.chips = h("span.chips");
    els.zoom = h("span", { hidden: true });
    els.openPreview = h("a.btn.small", { href: "#", target: "_blank", rel: "noopener", hidden: true }, t("action.openNew"));
    els.errors = h("div.preview-errors", { hidden: true });
    els.previewBody = h("div.preview-body");
    const right = h("div.editor-right", h("div.preview-head", h("b", t("editor.preview")), els.previewStatus, els.chips, h("span.spacer"), els.openPreview, els.zoom), els.errors, els.previewBody);

    container.append(head, h("div.editor-body", left, right));
    updateKindBadge();
    renderForm();
    els.json.value = state.text;
    if (state.detected?.engine !== "board") switchTab("json");
    refreshStatus();
    document.addEventListener("keydown", onKey);
    schedulePreview();
  }

  async function load() {
    try {
      if (state.id) {
        const item = await Diagrams.get(state.id);
        if (item.source === null) throw new Error(item.raw ? "invalid JSON on disk" : "empty document");
        state.doc = item.source;
        state.revision = item.revision;
      } else if (draft) {
        state.doc = draft;
      } else if (template) {
        const tpl = await Templates.get(template);
        state.doc = tpl.source;
        if (state.doc.meta?.title && template !== "board" && template !== "board-ko") state.doc.meta.title = `${state.doc.meta.title} (copy)`;
      } else {
        throw new Error("nothing to edit");
      }
      state.detected = detect(state.doc);
      state.text = pretty(state.doc);
      state.original = state.text;
      if (state.isNew) state.dirty = true;
      build();
    } catch (err) {
      clear(container);
      container.append(h("div.page", h("div.empty", h("h2", t("misc.notFound", { id: state.id || template || "draft" })), h("p", err.message))));
    }
  }

  load();
  return {
    destroy() {
      document.removeEventListener("keydown", onKey);
      canvas?.destroy();
    },
    canLeave(silent = false) {
      if (!state.dirty) return true;
      if (silent) return false;
      return window.confirm(t("confirm.leave"));
    },
  };
}
