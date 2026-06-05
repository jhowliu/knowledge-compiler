// Generates docs/architecture.excalidraw (import into excalidraw.com / desktop).
// Run: node docs/gen-architecture-excalidraw.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnd = () => Math.floor(Math.random() * 2 ** 31);
const elements = [];

function zone(id, x, y, w, h, bg) {
  elements.push({
    id, type: "rectangle", x, y, width: w, height: h, angle: 0,
    strokeColor: "#ced4da", backgroundColor: bg, fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "dashed", roughness: 0, opacity: 100,
    groupIds: [], frameId: null, roundness: { type: 3 }, seed: rnd(),
    version: 1, versionNonce: rnd(), isDeleted: false, boundElements: [],
    updated: 1, link: null, locked: false,
  });
}

function label(x, y, text, fontSize = 16, color = "#1e1e1e", w = 320) {
  elements.push({
    id: "t-" + rnd(), type: "text", x, y, width: w, height: fontSize * 1.5, angle: 0,
    strokeColor: color, backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [],
    frameId: null, roundness: null, seed: rnd(), version: 1, versionNonce: rnd(),
    isDeleted: false, boundElements: [], updated: 1, link: null, locked: false,
    text, fontSize, fontFamily: 2, textAlign: "left", verticalAlign: "top",
    containerId: null, originalText: text, lineHeight: 1.25, baseline: fontSize,
  });
}

function box(id, x, y, w, h, text, { bg = "#ffffff", stroke = "#1e1e1e", shape = "rectangle", fs = 15 } = {}) {
  const tid = id + "-t";
  elements.push({
    id, type: shape, x, y, width: w, height: h, angle: 0,
    strokeColor: stroke, backgroundColor: bg, fillStyle: "solid",
    strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [],
    frameId: null, roundness: shape === "diamond" ? null : { type: 3 }, seed: rnd(),
    version: 1, versionNonce: rnd(), isDeleted: false,
    boundElements: [{ type: "text", id: tid }], updated: 1, link: null, locked: false,
  });
  elements.push({
    id: tid, type: "text", x: x + 6, y: y + 6, width: w - 12, height: h - 12, angle: 0,
    strokeColor: stroke, backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [],
    frameId: null, roundness: null, seed: rnd(), version: 1, versionNonce: rnd(),
    isDeleted: false, boundElements: [], updated: 1, link: null, locked: false,
    text, fontSize: fs, fontFamily: 2, textAlign: "center", verticalAlign: "middle",
    containerId: id, originalText: text, lineHeight: 1.25, baseline: fs,
  });
  box._m = box._m || {};
  box._m[id] = { x, y, w, h };
  return id;
}

function arrow(from, to, { fromSide = "bottom", toSide = "top", dashed = false, color = "#495057" } = {}) {
  const a = box._m[from], b = box._m[to];
  const pt = (m, side) => ({
    top: [m.x + m.w / 2, m.y],
    bottom: [m.x + m.w / 2, m.y + m.h],
    left: [m.x, m.y + m.h / 2],
    right: [m.x + m.w, m.y + m.h / 2],
  }[side]);
  const [x1, y1] = pt(a, fromSide);
  const [x2, y2] = pt(b, toSide);
  elements.push({
    id: "a-" + rnd(), type: "arrow", x: x1, y: y1,
    width: x2 - x1, height: y2 - y1, angle: 0, strokeColor: color,
    backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2,
    strokeStyle: dashed ? "dashed" : "solid", roughness: 0, opacity: 100, groupIds: [],
    frameId: null, roundness: { type: 2 }, seed: rnd(), version: 1, versionNonce: rnd(),
    isDeleted: false, boundElements: [], updated: 1, link: null, locked: false,
    points: [[0, 0], [x2 - x1, y2 - y1]], lastCommittedPoint: null,
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow",
  });
}

// ---- Palette ----
const SRC = { bg: "#fff3bf", stroke: "#e8590c" };
const AGENT = { bg: "#eebefa", stroke: "#9c36b5" };
const GATE = { bg: "#ffec99", stroke: "#f08c00", shape: "diamond" };
const KNOW = { bg: "#a5d8ff", stroke: "#1971c2" };
const GRAPH = { bg: "#d8f5a2", stroke: "#66a80f" };
const RET = { bg: "#b2f2bb", stroke: "#2f9e44" };
const OUTC = { bg: "#ffd8a8", stroke: "#e8590c" };

// ===== Title =====
label(60, 24, "Knowledge Compiler — System Architecture", 30, "#1e1e1e", 760);

// ===== Zones =====
zone("zone-idx", 40, 90, 600, 1180, "#fff9db");
label(60, 100, "INDEXING  ·  ingest → compile → approve", 20, "#e8590c", 560);
zone("zone-ret", 700, 90, 600, 760, "#ebfbee");
label(720, 100, "RETRIEVAL  ·  hybrid fusion + graph", 20, "#2f9e44", 560);
zone("zone-phi", 700, 880, 600, 390, "#f8f0fc");
label(720, 890, "DESIGN PHILOSOPHY", 20, "#9c36b5", 560);

// ===== Indexing lane (centered x≈ 250, width 280) =====
const IX = 110, IW = 280;
box("ing", IX, 150, IW, 64, "Ingest source\nPOST /sources", SRC);
box("cmp", IX, 254, IW, 64, "Compile agent\nReAct loop + wiki indexer", AGENT);
box("judge", IX - 10, 358, IW + 20, 96, "Judge\nkeep / create / update\n+ conflict detection", GATE);
box("ks", 430, 374, 190, 64, "keep_searchable\nsource only · no block", SRC);
box("prop", IX, 494, IW, 56, "Update proposal (pending)", AGENT);
box("apr", IX, 590, IW, 56, "Human approve\nPOST /update-proposals/:id/approve", AGENT, );
box("chunk", IX, 686, IW, 64, "Fixed-size chunk\n~200 tokens · CJK-aware", KNOW);
box("ctx", IX, 790, IW, 64, "Contextual Retrieval header\nLLM situating text → metadata.context", KNOW);
box("kb", IX, 894, IW, 56, "knowledge_blocks  (corpus)", KNOW);
box("emb", IX, 990, IW, 64, "Embed (context + body)\n→ embedding · needs pgvector", KNOW);
box("graph", IX, 1094, IW, 64, "concepts · concept_index (note-level)\nnote_links · evidence", GRAPH);

arrow("ing", "cmp");
arrow("cmp", "judge");
arrow("judge", "ks", { fromSide: "right", toSide: "left" });
arrow("judge", "prop");
arrow("prop", "apr");
arrow("apr", "chunk");
arrow("chunk", "ctx");
arrow("ctx", "kb");
arrow("kb", "emb");
arrow("apr", "graph", { fromSide: "left", toSide: "left", color: "#66a80f" });

// raw source storage note
box("rs", 430, 158, 190, 64, "raw_sources\nraw_source_chunks (verbatim)", SRC, { fs: 13 });
arrow("ing", "rs", { fromSide: "right", toSide: "left" });

// ===== Retrieval lane =====
box("q", 880, 150, 240, 52, "Query", RET);
box("bm25", 720, 250, 175, 72, "Full-text / BM25\n(block-level)", RET, { fs: 13 });
box("con", 912, 250, 175, 72, "Concept match\n(note → blocks)", RET, { fs: 13 });
box("vec", 1104, 250, 175, 72, "Vector cosine\n(block · pgvector)", RET, { fs: 13 });
box("rrf", 880, 366, 240, 56, "RRF fusion (k = 60)", RET);
box("hop", 880, 462, 240, 64, "One-hop graph expand\napproved note_links", RET, { fs: 14 });
box("top", 880, 566, 240, 56, "Top-N blocks + citations", RET);
box("ans", 880, 662, 240, 64, "Answerer\nexact-question scoping prompt", RET, { fs: 14 });
box("out", 880, 766, 240, 56, "Answer + citations", OUTC);

arrow("q", "bm25", { toSide: "top" });
arrow("q", "con");
arrow("q", "vec", { toSide: "top" });
arrow("bm25", "rrf", { fromSide: "bottom", toSide: "top" });
arrow("con", "rrf");
arrow("vec", "rrf", { fromSide: "bottom", toSide: "top" });
arrow("rrf", "hop");
arrow("hop", "top");
arrow("top", "ans");
arrow("ans", "out");

// knowledge_blocks feeds retrieval (annotation instead of a long cross arrow)
label(720, 328, "↑ all three signals search the knowledge_blocks corpus", 13, "#1971c2", 560);

// ===== Philosophy text =====
label(720, 928,
  "• Two tiers, three axes: provenance (keep originals) · retrievability · canonicalization.\n" +
  "• Human-in-the-loop approval gates the knowledge corpus.\n" +
  "• Agentic judgment keeps personal/contradicted notes out of canonical knowledge.\n" +
  "• Mechanical chunk boundaries; LLM spent on per-chunk context (Anthropic-style), not segmentation.\n" +
  "• Hybrid retrieval: concept graph = global recall @ note; vector + context = local precision @ chunk;\n" +
  "  BM25 = lexical. Fused with RRF.",
  15, "#5f3dc4", 560);

const scene = {
  type: "excalidraw", version: 2, source: "knowledge-compiler",
  elements, appState: { gridSize: null, viewBackgroundColor: "#ffffff" }, files: {},
};

const out = path.join(__dirname, "architecture.excalidraw");
writeFileSync(out, JSON.stringify(scene, null, 2));
console.log("wrote", out, "with", elements.length, "elements");
