export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) s.append(k, v);
  });
  return s.toString();
}

export async function getStatus() {
  const r = await fetch(`${API_BASE}/api/status`);
  if (!r.ok) throw new Error("status failed");
  return r.json();
}

export async function getFacets() {
  const r = await fetch(`${API_BASE}/api/facets`);
  if (!r.ok) throw new Error("facets failed");
  return r.json();
}

// Browse / keyword search with filters
export async function browse(params) {
  const r = await fetch(`${API_BASE}/api/products?${qs(params)}`);
  if (!r.ok) throw new Error("products failed");
  return r.json();
}

// Semantic (AI) search
export async function semanticSearch(params) {
  const r = await fetch(`${API_BASE}/api/search?${qs(params)}`);
  if (!r.ok) throw new Error("search failed");
  return r.json();
}
