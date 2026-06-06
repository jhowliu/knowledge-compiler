// Generates docs/architecture.excalidraw (import into excalidraw.com / desktop).
// Run: node docs/gen-architecture-excalidraw.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnd = () => Math.floor(Math.random() * 2 ** 31);
const elements = [];

function zone(id, x, y, w, h, bg, stroke = "#ced4da") {
  elements.push({
    id, type: "rectangle", x, y, width: w, height: h, angle: 0,
    strokeColor: stroke, backgroundColor: bg, fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "dashed", roughness: 0, opacity: 100,
    groupIds: [], frameId: null, roundness: { type: 3 }, seed: rnd(),
    version: 1, versionNonce: rnd(), isDeleted: false, boundElements: [],
    updated: 1, link: null, locked: false,
  });
}

function label(x, y, text, fontSize = 16, color = "#1e1e1e", w = 320, bold = false) {
  const lines = text.split("\n").length;
  elements.push({
    id: "t-" + rnd(), type: "text", x, y, width: w, height: fontSize * 1.25 * lines + 4, angle: 0,
    strokeColor: color, backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [],
    frameId: null, roundness: null, seed: rnd(), version: 1, versionNonce: rnd(),
    isDeleted: false, boundElements: [], updated: 1, link: null, locked: false,
    text, fontSize, fontFamily: bold ? 7 : 2, textAlign: "left", verticalAlign: "top",
    containerId: null, originalText: text, lineHeight: 1.25, baseline: fontSize,
  });
}

function box(id, x, y, w, h, text, { bg = "#ffffff", stroke = "#1e1e1e", shape = "rectangle", fs = 14 } = {}) {
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
label(60, 24, "Knowledge Compiler — System Architecture", 30, "#1e1e1e", 760, true);

// ===== Zones =====
zone("zone-idx", 40, 90, 640, 1470, "#fff9db");
label(60, 100, "INDEXING  ·  ingest → compile → approve", 20, "#e8590c", 600, true);
zone("zone-ret", 740, 90, 600, 760, "#ebfbee");
label(760, 100, "RETRIEVAL  ·  hybrid fusion + graph", 20, "#2f9e44", 560, true);
zone("zone-phi", 740, 890, 600, 360, "#f8f0fc");
label(760, 900, "DESIGN PHILOSOPHY", 20, "#9c36b5", 560, true);

// ===== Indexing lane =====
const IX = 120, IW = 300;
box("ing", IX, 150, IW, 58, "Ingest source\nPOST /sources", SRC);
box("rs", 450, 148, 200, 70, "raw_sources +\nraw source chunks\n(chunked at INGEST)", SRC, { fs: 12 });
arrow("ing", "rs", { fromSide: "right", toSide: "left" });

// --- Compile agent sub-flow (ReAct) ---
zone("zone-agent", 96, 244, 348, 470, "#fdf2ff", "#ae3ec9");
label(108, 252, "COMPILE AGENT  ·  ReAct loop (wiki indexer)", 13, "#9c36b5", 320, true);
box("extract", IX, 282, IW, 70, "1 · Extract facets\nsummary · concepts(typed) · claims\nmethods · examples · constraints", AGENT, { fs: 11 });
box("search", IX, 372, IW, 58, "2 · Search existing KB\nsearchRelated by concept → candidates", AGENT, { fs: 12 });
box("judge", IX - 10, 448, IW + 20, 92, "3 · Classify outcome (after search)\nkeep / create / update  +  conflict", GATE, { fs: 12 });
box("ks", 470, 466, 180, 58, "keep_searchable\nsource only · no block", SRC, { fs: 12 });
box("draft", IX, 560, IW, 56, "4 · Draft proposal\nnote body + concepts + link suggestions", AGENT, { fs: 12 });
box("evaljudge", IX, 644, IW, 50, "5 · Eval / grounding check", AGENT, { fs: 13 });

arrow("ing", "extract");
arrow("extract", "search");
arrow("search", "judge");
arrow("judge", "ks", { fromSide: "right", toSide: "left" });
arrow("judge", "draft");
arrow("draft", "evaljudge");

// --- Proposal + approve ---
box("prop", IX, 740, IW, 52, "Update proposal (pending)", AGENT);
box("apr", IX, 824, IW, 60, "Human approve\nPOST /update-proposals/:id/approve", AGENT, { fs: 13 });
arrow("evaljudge", "prop");
arrow("prop", "apr");

// --- APPROVE boundary marker ---
label(110, 902, "▼  everything below runs at APPROVE  (not at compile)", 13, "#e03131", 540, true);

// --- Post-approve: chunk -> contextualize -> embed ---
box("chunk", IX, 936, IW, 60, "Fixed-size chunk\n~200 tokens · CJK-aware", KNOW, { fs: 13 });
box("ctx", IX, 1024, IW, 64, "Contextual Retrieval header\nLLM situating text → metadata.context", KNOW, { fs: 12 });
box("kb", IX, 1116, IW, 52, "knowledge_blocks  (corpus)", KNOW);
box("emb", IX, 1200, IW, 62, "Embed (context + body)\n→ embedding · needs pgvector", KNOW, { fs: 13 });
box("graph", IX, 1288, IW, 62, "concepts · concept_index (note-level)\nnote_links · evidence", GRAPH, { fs: 12 });
arrow("apr", "chunk");
arrow("chunk", "ctx");
arrow("ctx", "kb");
arrow("kb", "emb");
arrow("apr", "graph", { fromSide: "left", toSide: "left", color: "#66a80f" });

// ===== Retrieval lane =====
box("q", 920, 150, 240, 52, "Query", RET);
box("bm25", 760, 250, 175, 72, "Full-text / BM25\n(block-level)", RET, { fs: 13 });
box("con", 952, 250, 175, 72, "Concept match\n(note → blocks)", RET, { fs: 13 });
box("vec", 1144, 250, 175, 72, "Vector cosine\n(block · pgvector)", RET, { fs: 13 });
box("rrf", 920, 366, 240, 56, "RRF fusion (k = 60)", RET);
box("hop", 920, 462, 240, 64, "One-hop graph expand\napproved note_links", RET, { fs: 14 });
box("top", 920, 566, 240, 56, "Top-N blocks + citations", RET);
box("ans", 920, 662, 240, 64, "Answerer\nexact-question scoping prompt", RET, { fs: 14 });
box("out", 920, 766, 240, 56, "Answer + citations", OUTC);
label(760, 328, "↑ all three signals search the knowledge_blocks corpus", 13, "#1971c2", 560);

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

// ===== Philosophy (stacked single-line labels so nothing clips) =====
const phi = [
  "• Two tiers, three axes: provenance · retrievability · canonicalization.",
  "• Human-in-the-loop approval gates the knowledge corpus.",
  "• Agentic judgment keeps personal / contradicted notes out of canon.",
  "• Mechanical chunk boundaries; LLM spent on per-chunk context, not segmentation.",
  "• Hybrid retrieval — concept graph: global recall @ note;",
  "   vector + context: local precision @ chunk;  BM25: lexical.  Fused by RRF.",
];
phi.forEach((line, i) => label(762, 934 + i * 30, line, 14, "#5f3dc4", 566));

const scene = {
  type: "excalidraw", version: 2, source: "knowledge-compiler",
  elements, appState: { gridSize: null, viewBackgroundColor: "#ffffff" }, files: {},
};

const out = path.join(__dirname, "architecture.excalidraw");
writeFileSync(out, JSON.stringify(scene, null, 2));
console.log("wrote", out, "with", elements.length, "elements");
