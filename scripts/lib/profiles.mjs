export const EMPHASIS_KEYS = ["lead", "key", "bottleneck", "loop", "normal"];

const GOV = {
  status: {
    lead: { label: "선행", fill: "#effaf5", border: "#35a77d", ink: "#123d2e", sub: "#287a5c" },
    key: { label: "핵심", fill: "#087452", border: "#087452", ink: "#ffffff", sub: "#d8f4e8" },
    normal: { label: "후속", fill: "#ffffff", border: "#b9c7bf", ink: "#17231d", sub: "#627169" },
    bottleneck: { label: "병목", fill: "#fff8e8", border: "#d9901a", ink: "#7a4305", sub: "#a96008" },
    loop: { label: "회귀", fill: "#edf4ff", border: "#3478db", ink: "#173f7a", sub: "#316bbd" },
  },
  refsLabel: "조문",
  accent: "#7c3aed",
  titleOverrides: {},
};

const DEFAULT = {
  status: {
    lead: { label: "Lead", fill: "#eef6ff", border: "#3b82f6", ink: "#1e3a5f", sub: "#3563a8" },
    key: { label: "Key", fill: "#1e293b", border: "#1e293b", ink: "#ffffff", sub: "#cbd5e1" },
    normal: { label: "Step", fill: "#ffffff", border: "#cbd5e1", ink: "#1f2937", sub: "#64748b" },
    bottleneck: { label: "Bottleneck", fill: "#fff7ed", border: "#ea9a1a", ink: "#7c4a03", sub: "#a8620a" },
    loop: { label: "Loop", fill: "#eef2ff", border: "#6366f1", ink: "#312e81", sub: "#4f46e5" },
  },
  refsLabel: "Refs",
  accent: "#2563eb",
  titleOverrides: {},
};

const PROFILES = { default: DEFAULT, gov: GOV };

export function getProfile(name) {
  return PROFILES[name] ?? DEFAULT;
}
