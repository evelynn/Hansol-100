import { t, kindLabel } from "./i18n.js";
import { h, clear, toast, toastError, relativeTime, formatBytes, download, svgToPngBlob, dropdown } from "./util.js";
import { Diagrams } from "./api.js";
import { createCanvas, zoomBar } from "./canvas.js";
import { deleteItem, duplicateItem } from "./actions.js";

const METRIC_KEYS = ["score", "nodePiercings", "crossings", "bendsPerEdgeMax", "routeStretchMax", "adjustedLabels"];

export function renderMetrics(audit) {
  const grid = h("div.metrics");
  const values = { score: audit.score, ...audit.metrics };
  for (const key of METRIC_KEYS) {
    const value = values[key];
    let state = "";
    if (key === "nodePiercings") state = value === 0 ? "good" : "bad";
    if (key === "score") state = value === 0 ? "good" : "";
    grid.append(h("div.metric", { class: state }, h("b", String(value ?? "–")), h("span", t(`metric.${key}`))));
  }
  const note = audit.violations?.length
    ? h("div.notice.warn.mt", t("quality.violations", { n: audit.violations.length, list: audit.violations.join(", ") }))
    : h("div.notice.good.mt", t("quality.clean"));
  return h("div", grid, note);
}

export function renderReceipt(result) {
  const receipt = result.receipt || result;
  const wrap = h("div");
  if (receipt.ok) {
    const passed = (receipt.checks || []).filter((c) => c.ok).length;
    wrap.append(h("div.notice.good", t("validation.pass", { passed, count: receipt.checks?.length ?? 0, errors: receipt.composition?.summary?.errors ?? 0, warnings: receipt.composition?.summary?.warnings ?? 0 })));
  } else {
    wrap.append(h("div.notice.bad", `${t("validation.fail")} — ${receipt.error || ""}`));
  }
  if (receipt.checks?.length) {
    wrap.append(h("ul.checks", receipt.checks.map((c) => h("li", { class: c.ok ? "" : "fail" }, c.name, c.details?.length && !c.ok ? h("span.dim", ` — ${c.details.join("; ")}`) : null))));
  }
  if (receipt.diagnostics?.length) wrap.append(renderDiagnostics(receipt.diagnostics));
  return wrap;
}

export function renderDiagnostics(diagnostics) {
  return h(
    "ul.errors.mt",
    diagnostics.map((d) =>
      h("li", d.code ? h("code", `[${d.code}] `) : null, d.message, d.supportedFixes?.length ? h("span.fix", `fix: ${d.supportedFixes.join("; ")}`) : null),
    ),
  );
}

export function mountViewer(root, id) {
  const container = h("div.viewer", h("div.loading", t("misc.loading")));
  root.append(container);
  let canvas = null;

  async function load() {
    let item;
    try {
      item = await Diagrams.get(id);
    } catch (err) {
      clear(container);
      container.append(h("div.page", h("div.empty", h("h2", t("misc.notFound", { id })), h("p", err.message))));
      return;
    }
    clear(container);
    const isBoard = item.engine === "board";

    // ---- head
    const exportItems = [{ label: t("export.json"), onclick: () => download(`${JSON.stringify(item.source, null, 2)}\n`, `${id}.json`, "application/json") }];
    if (isBoard) {
      exportItems.push(
        { label: t("export.svg"), onclick: async () => download(await Diagrams.fetchText(Diagrams.svgUrl(id)), `${id}.svg`, "image/svg+xml") },
        { label: t("export.png"), onclick: () => exportPng(1) },
        { label: t("export.png2x"), onclick: () => exportPng(2) },
        { label: t("export.motion"), onclick: async () => download(await Diagrams.fetchText(Diagrams.motionUrl(id)), `${id}.motion.svg`, "image/svg+xml") },
      );
    } else {
      exportItems.push({ label: t("export.html"), onclick: async () => download(await Diagrams.fetchText(Diagrams.htmlUrl(id)), `${id}.html`, "text/html") });
    }
    async function exportPng(scale) {
      try {
        const svg = await Diagrams.fetchText(Diagrams.svgUrl(id));
        const png = await svgToPngBlob(svg, scale);
        download(png, `${id}${scale > 1 ? `@${scale}x` : ""}.png`);
        toast(t("toast.exported", { name: "PNG" }), "success");
      } catch (err) {
        toastError(err);
      }
    }
    const head = h(
      "div.viewer-head",
      h("a.btn.small", { href: "#/" }, t("action.back")),
      h("span.badge", { class: `kind-${item.kind}` }, kindLabel(item.kind)),
      h("h1", { title: item.title }, item.title),
      item.subtitle ? h("span.sub", item.subtitle) : null,
      h("span.spacer"),
      h("a.btn.primary", { href: `#/edit/${encodeURIComponent(id)}` }, t("action.edit")),
      h("button.btn", { type: "button", onclick: () => duplicateItem(item) }, t("action.duplicate")),
      dropdown(t("action.export"), exportItems),
      h("button.btn.danger", { type: "button", onclick: async () => { if (await deleteItem(item)) location.hash = "#/"; } }, t("action.delete")),
    );

    // ---- stage
    const stage = h("div.stage");
    if (isBoard) {
      canvas = createCanvas();
      const boardTab = h("button.tab.active", { type: "button" }, t("viewer.tab.board"));
      const motionTab = h("button.tab", { type: "button" }, t("viewer.tab.motion"));
      const showBoard = async () => {
        boardTab.classList.add("active");
        motionTab.classList.remove("active");
        try {
          canvas.setSvg(await Diagrams.fetchText(Diagrams.svgUrl(id)));
        } catch (err) {
          toastError(err);
        }
      };
      const showMotion = () => {
        motionTab.classList.add("active");
        boardTab.classList.remove("active");
        canvas.setImage(`${Diagrams.motionUrl(id)}?r=${encodeURIComponent(item.revision)}`);
      };
      boardTab.addEventListener("click", showBoard);
      motionTab.addEventListener("click", showMotion);
      stage.append(h("div.stage-bar", h("div.tabs", boardTab, motionTab), zoomBar(canvas)), canvas.el);
      showBoard();
    } else {
      const url = Diagrams.htmlUrl(id);
      stage.append(
        h("div.stage-bar", h("span.hint", "Archify viewer · ? guide · / search · T theme · E export"), h("span.grow"), h("a.btn.small", { href: url, target: "_blank", rel: "noopener" }, t("action.openNew"))),
        h("iframe.frame", { src: url, title: item.title }),
      );
    }

    // ---- side
    const side = h("div.side");
    const info = h(
      "dl.kv",
      h("dt", t("info.id")), h("dd", h("code", item.id)),
      h("dt", t("info.kind")), h("dd", kindLabel(item.kind)),
      h("dt", t("info.profile")), h("dd", item.profile || "default"),
      h("dt", t("info.nodes")), h("dd", String(item.counts?.nodes ?? 0)),
      h("dt", t("info.edges")), h("dd", String(item.counts?.edges ?? 0)),
      h("dt", t("info.updated")), h("dd", { title: item.updatedAt }, relativeTime(item.updatedAt)),
      h("dt", t("info.revision")), h("dd", h("code", item.revision)),
      h("dt", t("info.bytes")), h("dd", formatBytes(item.bytes)),
    );
    side.append(h("h3", t("side.info")), info);
    if (item.lanes?.length) side.append(h("h3", t("side.lanes")), h("div.taglist", item.lanes.map((l) => h("span", l))));
    if (item.stages?.length) side.append(h("h3", t("side.stages")), h("div.taglist", item.stages.map((s) => h("span", s))));

    if (isBoard) {
      const quality = h("div", h("span.hint", t("misc.loading")));
      side.append(h("h3", t("side.quality")), quality);
      Diagrams.audit(id).then((audit) => {
        clear(quality);
        quality.append(audit.ok ? renderMetrics(audit.audit) : h("ul.errors", audit.errors.map((e) => h("li", e.message))));
      }).catch((err) => { clear(quality); quality.append(h("div.notice.bad", err.message)); });
    } else {
      const result = h("div");
      const run = h("button.btn.small", { type: "button", onclick: async () => {
        run.disabled = true;
        clear(result);
        result.append(h("span.hint", t("validation.running")));
        try {
          const receipt = await Diagrams.audit(id, { quality: "showcase" });
          clear(result);
          result.append(renderReceipt(receipt));
        } catch (err) {
          clear(result);
          result.append(h("div.notice.bad", err.message));
        } finally {
          run.disabled = false;
        }
      } }, t("validation.run"));
      side.append(h("h3", t("side.validation")), h("p.hint", t("validation.hint")), run, result);
    }

    side.append(h("h3", t("side.export")), h("div.rowlist", exportItems.map((entry) => h("button.btn.small", { type: "button", onclick: entry.onclick }, entry.label))));
    container.append(head, stage, side);
  }

  load();
  return { destroy: () => canvas?.destroy?.() };
}
