import { t } from "./i18n.js";
import { toast, toastError } from "./util.js";
import { Diagrams } from "./api.js";

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
