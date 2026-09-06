import { t } from "./i18n.js";
import { toast, toastError } from "./util.js";
import { Diagrams, Convert } from "./api.js";

// Cross-view hand-off for unsaved documents (import → editor, convert → editor).
export const drafts = { pending: null };

export async function convertItem(item, to) {
  try {
    const result = await Convert.run(item.source, to);
    drafts.pending = result.source;
    const errors = result.validation?.errors?.length || 0;
    const suffix = result.orientation === "rows" ? ` · ${t("convert.rows")}` : "";
    toast((errors ? t("toast.convertedInvalid", { n: errors }) : t("toast.converted")) + suffix, errors ? "error" : "success", 6000);
    location.hash = "#/new/draft";
  } catch (err) {
    toastError(err);
  }
}

export async function duplicateItem(item) {
  try {
    const result = await Diagrams.duplicate(item.id);
    toast(t("toast.duplicated", { id: result.item.id }), "success");
    location.hash = `#/edit/${encodeURIComponent(result.item.id)}`;
  } catch (err) {
    toastError(err);
  }
}

export async function deleteItem(item, after) {
  if (!window.confirm(t("confirm.delete", { title: item.title || item.id }))) return false;
  try {
    await Diagrams.remove(item.id);
    toast(t("toast.deleted"), "success");
    after?.();
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}
