"use client";

import { useEffect, useState, useCallback } from "react";
import { getStatus, getFacets, browse, semanticSearch } from "../lib/api";

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#eceae4'/><g fill='none' stroke='#b9b3a6' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'><path d='M110 120 h80 l-8 70 h-64 z'/><path d='M128 120 a22 22 0 0 1 44 0'/></g></svg>`
  );

const rupee = (n) =>
  n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN");

function ProductCard({ p }) {
  const [src, setSrc] = useState(p.image || PLACEHOLDER);
  const hasDiscount = p.discount_pct && p.discount_pct > 0;
  return (
    <article className="card">
      <div className="thumb">
        <img
          src={src}
          alt={p.name}
          loading="lazy"
          onError={() => setSrc(PLACEHOLDER)}
        />
        {hasDiscount ? (
          <span className="badge">{Math.round(p.discount_pct)}% OFF</span>
        ) : null}
      </div>
      <div className="card-body">
        <div className="brand">{p.brand}</div>
        <h3 className="name" title={p.name}>
          {p.name}
        </h3>
        <div className="cat">{p.category}</div>
        <div className="price-row">
          <span className="price">{rupee(p.discounted_price)}</span>
          {hasDiscount ? (
            <span className="mrp">{rupee(p.retail_price)}</span>
          ) : null}
        </div>
        {p.url ? (
          <a className="buy" href={p.url} target="_blank" rel="noreferrer">
            View product ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function Home() {
  const [status, setStatus] = useState(null);
  const [facets, setFacets] = useState(null);
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(true);
  const [filters, setFilters] = useState({
    category: "",
    brand: "",
    gender: "",
    max_price: "",
    sort: "relevance",
  });
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ mode: "", total: 0 });
  const [loading, setLoading] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => {});
    getFacets().then(setFacets).catch(() => {});
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const base = {
        category: filters.category,
        brand: filters.brand,
        gender: filters.gender,
        max_price: filters.max_price,
      };
      let data;
      if (query.trim() && semantic && status?.semantic_available) {
        data = await semanticSearch({ q: query.trim(), ...base, k: 36 });
      } else {
        data = await browse({
          q: query.trim(),
          ...base,
          sort: filters.sort,
          limit: 36,
        });
      }
      setProducts(data.products || []);
      setMeta({
        mode: data.mode + (data.fallback ? " (fallback)" : ""),
        total: data.total || 0,
      });
    } catch (e) {
      setProducts([]);
      setMeta({ mode: "error", total: 0 });
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, [query, semantic, filters, status]);

  // Initial catalog load once facets/status arrive
  useEffect(() => {
    if (status && firstLoad) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const onSubmit = (e) => {
    e.preventDefault();
    runSearch();
  };

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const examples = [
    "comfortable running shoes for men",
    "elegant gift for my wife",
    "budget smartphone under 10000",
    "cotton kurta for summer",
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-mark">
          <span className="logo">◆</span> ShopSense
        </div>
        <div className="tagline">
          Semantic product search · RAG over{" "}
          <b>{status ? status.products.toLocaleString("en-IN") : "…"}</b>{" "}
          products
        </div>
      </header>

      <section className="hero">
        <h1>
          Search by <em>meaning</em>, not keywords.
        </h1>
        <form className="searchbar" onSubmit={onSubmit}>
          <input
            type="text"
            value={query}
            placeholder="Describe what you're looking for…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        <div className="controls">
          <label
            className={`toggle ${semantic ? "on" : ""} ${
              status && !status.semantic_available ? "disabled" : ""
            }`}
            title={
              status && !status.semantic_available
                ? "Semantic index not available — using keyword search"
                : "Toggle AI semantic search"
            }
          >
            <input
              type="checkbox"
              checked={semantic}
              disabled={status && !status.semantic_available}
              onChange={(e) => setSemantic(e.target.checked)}
            />
            <span className="knob" />✨ AI semantic search
          </label>
          <div className="examples">
            {examples.map((ex) => (
              <button
                key={ex}
                className="chip"
                onClick={() => {
                  setQuery(ex);
                  setSemantic(true);
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="layout">
        <aside className="filters">
          <h2>Filters</h2>

          <label className="fld">
            <span>Category</span>
            <select
              value={filters.category}
              onChange={(e) => setF("category", e.target.value)}
            >
              <option value="">All categories</option>
              {facets?.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="fld">
            <span>Brand</span>
            <select
              value={filters.brand}
              onChange={(e) => setF("brand", e.target.value)}
            >
              <option value="">All brands</option>
              {facets?.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="fld">
            <span>Gender</span>
            <select
              value={filters.gender}
              onChange={(e) => setF("gender", e.target.value)}
            >
              <option value="">Everyone</option>
              {facets?.genders.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="fld">
            <span>Max price (₹)</span>
            <input
              type="number"
              min="0"
              placeholder="e.g. 1000"
              value={filters.max_price}
              onChange={(e) => setF("max_price", e.target.value)}
            />
          </label>

          <label className="fld">
            <span>Sort (keyword mode)</span>
            <select
              value={filters.sort}
              onChange={(e) => setF("sort", e.target.value)}
            >
              <option value="relevance">Relevance</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
              <option value="discount">Biggest discount</option>
            </select>
          </label>

          <button className="apply" onClick={runSearch}>
            Apply filters
          </button>
        </aside>

        <section className="results">
          <div className="results-head">
            <span>
              {loading
                ? "Searching…"
                : `${meta.total.toLocaleString("en-IN")} result${
                    meta.total === 1 ? "" : "s"
                  }`}
            </span>
            {meta.mode ? (
              <span className={`mode-pill ${meta.mode.includes("semantic") ? "sem" : ""}`}>
                {meta.mode.includes("semantic") ? "✨ semantic" : "🔤 keyword"}
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card skeleton" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="empty">
              No products found. Try a broader query or clear filters.
            </div>
          ) : (
            <div className="grid">
              {products.map((p) => (
                <ProductCard key={p.pid + (p.name || "")} p={p} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="foot">
        Built with FastAPI · FAISS · OpenAI · Next.js — semantic retrieval over a
        real Flipkart catalog.
      </footer>
    </div>
  );
}
