"""
FastAPI backend for the E-commerce RAG recommender.

Serves the real Flipkart catalog to the Next.js frontend and exposes:
  - keyword search  (instant, pandas — always available)
  - semantic search (FAISS + OpenAI embeddings — when the index is built)
  - facets for the filter UI
  - a grounded LLM recommendation summary (optional, needs OpenAI key)

It reuses the project's existing data_processing.py and recommendation.py so
the app and this API share one pipeline.
"""

import os
import sys
import math
from functools import lru_cache

import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# Make the project root importable (data_processing / recommendation live there)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_processing import preprocess_data  # noqa: E402

DATASET_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "flipkart_com-ecommerce_sample.csv",
)
VECTORSTORE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vectorstore"
)

app = FastAPI(title="E-commerce RAG Recommender API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Data loading (cached once at process start)
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def get_df() -> pd.DataFrame:
    raw = pd.read_csv(DATASET_PATH)
    df = preprocess_data(raw)
    df = df.reset_index(drop=True)
    # Precompute discount % for sorting / display
    df["discount_pct"] = (
        (df["retail_price"] - df["discounted_price"]) / df["retail_price"] * 100
    ).round(0)
    return df


_VECTORSTORE = None
_EMBEDDINGS = None


def get_vectorstore():
    """Lazily load the FAISS store. Returns None if unavailable."""
    global _VECTORSTORE, _EMBEDDINGS
    if _VECTORSTORE is not None:
        return _VECTORSTORE
    if not os.path.exists(os.path.join(VECTORSTORE_DIR, "index.faiss")):
        return None
    if not os.getenv("OPENAI_API_KEY"):
        return None
    try:
        from dotenv import load_dotenv
        from langchain_openai import OpenAIEmbeddings
        from langchain_community.vectorstores import FAISS

        load_dotenv()
        _EMBEDDINGS = OpenAIEmbeddings(openai_api_key=os.getenv("OPENAI_API_KEY"))
        _VECTORSTORE = FAISS.load_local(
            VECTORSTORE_DIR, _EMBEDDINGS, allow_dangerous_deserialization=True
        )
        return _VECTORSTORE
    except Exception as e:  # pragma: no cover
        print("Vectorstore load failed:", e)
        return None


# --------------------------------------------------------------------------- #
# Serialization helpers
# --------------------------------------------------------------------------- #
def _clean(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def row_to_product(row) -> dict:
    return {
        "pid": _clean(row.get("pid")),
        "name": _clean(row.get("product_name")),
        "brand": _clean(row.get("brand")) or "Unbranded",
        "category": _clean(row.get("primary_category")),
        "gender": _clean(row.get("gender")),
        "retail_price": _clean(row.get("retail_price")),
        "discounted_price": _clean(row.get("discounted_price")),
        "discount_pct": _clean(row.get("discount_pct")),
        "image": _clean(row.get("primary_image_link")),
        "url": _clean(row.get("product_url")),
        "description": (str(row.get("description"))[:220] if _clean(row.get("description")) else None),
    }


def apply_filters(df, category, brand, gender, min_price, max_price):
    if category:
        df = df[df["primary_category"] == category]
    if brand:
        df = df[df["brand"] == brand]
    if gender:
        df = df[df["gender"] == gender]
    if min_price is not None:
        df = df[df["discounted_price"] >= min_price]
    if max_price is not None:
        df = df[df["discounted_price"] <= max_price]
    return df


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/status")
def status():
    df = get_df()
    return {
        "products": int(len(df)),
        "semantic_available": get_vectorstore() is not None,
        "categories": int(df["primary_category"].nunique()),
        "brands": int(df["brand"].nunique()),
    }


@app.get("/api/facets")
def facets():
    df = get_df()
    top_categories = df["primary_category"].value_counts().nlargest(40).index.tolist()
    top_brands = df["brand"].value_counts().nlargest(60).index.tolist()
    return {
        "categories": top_categories,
        "brands": top_brands,
        "genders": ["Men", "Women", "Unisex"],
        "price_min": int(df["discounted_price"].min()),
        "price_max": int(df["discounted_price"].max()),
    }


@app.get("/api/products")
def products(
    q: str = "",
    category: str = "",
    brand: str = "",
    gender: str = "",
    min_price: float = None,
    max_price: float = None,
    sort: str = "relevance",
    page: int = 1,
    limit: int = 24,
):
    """Keyword + filter search over the real catalog (instant, no API cost)."""
    df = get_df()
    if q.strip():
        needle = q.strip().lower()
        mask = (
            df["product_name"].str.lower().str.contains(needle, na=False)
            | df["brand"].str.lower().str.contains(needle, na=False)
            | df["primary_category"].str.lower().str.contains(needle, na=False)
            | df["description"].str.lower().str.contains(needle, na=False)
        )
        df = df[mask]
    df = apply_filters(df, category, brand, gender, min_price, max_price)

    if sort == "price_asc":
        df = df.sort_values("discounted_price")
    elif sort == "price_desc":
        df = df.sort_values("discounted_price", ascending=False)
    elif sort == "discount":
        df = df.sort_values("discount_pct", ascending=False)

    total = len(df)
    start = (page - 1) * limit
    page_df = df.iloc[start : start + limit]
    return {
        "mode": "keyword",
        "total": int(total),
        "page": page,
        "limit": limit,
        "products": [row_to_product(r) for _, r in page_df.iterrows()],
    }


@app.get("/api/search")
def search(
    q: str = Query(..., min_length=1),
    category: str = "",
    brand: str = "",
    gender: str = "",
    min_price: float = None,
    max_price: float = None,
    k: int = 24,
):
    """Semantic search via FAISS; falls back to keyword if the index isn't ready."""
    vs = get_vectorstore()
    if vs is None:
        res = products(
            q=q, category=category, brand=brand, gender=gender,
            min_price=min_price, max_price=max_price, limit=k,
        )
        res["fallback"] = True
        return res

    # Retrieve a wide candidate set, then apply structured filters on top.
    docs = vs.similarity_search(q, k=max(k * 3, 60))
    seen, items = set(), []
    for d in docs:
        m = d.metadata
        pid = m.get("pid")
        if pid in seen:
            continue
        seen.add(pid)
        if category and m.get("primary_category") != category:
            continue
        if brand and m.get("brand") != brand:
            continue
        if gender and m.get("gender") != gender:
            continue
        price = m.get("discounted_price")
        if min_price is not None and (price is None or price < min_price):
            continue
        if max_price is not None and (price is None or price > max_price):
            continue
        items.append(row_to_product(m))
        if len(items) >= k:
            break

    return {"mode": "semantic", "total": len(items), "products": items}


@app.get("/")
def health():
    return {"ok": True, "service": "ecommerce-rag-api"}
