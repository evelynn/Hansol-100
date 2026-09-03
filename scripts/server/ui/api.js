export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = "GET", body, raw = false, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["content-type"] = "application/json";
  }
  const res = await fetch(path, init);
  if (raw) {
    if (!res.ok) {
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      throw new ApiError(res.status, payload?.error?.code || "http", payload?.error?.message || `${res.status} ${res.statusText}`, payload?.error?.details);
    }
    return res;
  }
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, payload?.error?.code || "http", payload?.error?.message || `${res.status} ${res.statusText}`, payload?.error?.details);
  }
  return payload;
}

const enc = encodeURIComponent;

export const Health = { get: () => request("/api/health") };

export const Diagrams = {
  list(params = {}) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
    const qs = search.toString();
    return request(`/api/diagrams${qs ? `?${qs}` : ""}`);
  },
  get: (id) => request(`/api/diagrams/${enc(id)}`),
  create: (payload) => request("/api/diagrams", { method: "POST", body: payload }),
  update: (id, payload) => request(`/api/diagrams/${enc(id)}`, { method: "PUT", body: payload }),
  remove: (id) => request(`/api/diagrams/${enc(id)}`, { method: "DELETE" }),
  duplicate: (id, newId) => request(`/api/diagrams/${enc(id)}/duplicate`, { method: "POST", body: newId ? { id: newId } : {} }),
  audit: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/diagrams/${enc(id)}/audit${qs ? `?${qs}` : ""}`);
  },
  svgUrl: (id, profile) => `/api/diagrams/${enc(id)}/render.svg${profile ? `?profile=${enc(profile)}` : ""}`,
  motionUrl: (id) => `/api/diagrams/${enc(id)}/motion.svg`,
  htmlUrl: (id) => `/api/diagrams/${enc(id)}/render.html`,
  sourceUrl: (id) => `/api/diagrams/${enc(id)}/source.json`,
  fetchText: async (url) => (await request(url, { raw: true })).text(),
};

export const Preview = {
  render: (source, opts = {}) => request("/api/preview", { method: "POST", body: { source, ...opts } }),
  validate: (source, opts = {}) => request("/api/validate", { method: "POST", body: { source, ...opts } }),
};

export const Templates = {
  list: () => request("/api/templates"),
  get: (name) => request(`/api/templates/${enc(name)}`),
};

export const Trash = {
  list: () => request("/api/trash"),
  restore: (file) => request(`/api/trash/${enc(file)}/restore`, { method: "POST" }),
};
