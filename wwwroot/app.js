
function sendToCs(payload) {
  try {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage(JSON.stringify(payload));
    }
  } catch (e) {
    console.error("postMessage error", e);
  }
}

let allModels = [];
let filtered = [];
let state = {
  search: "",
  favOnly: false,
  freeOnly: false,
  onePerFamily: false,
  ctxMin: 0,
  priceMax: 100,
  provider: "OpenRouter",
  modality: "",
  outputModality: "",
};
let sort = { key: null, dir: 1 }; 
let favorites = new Set();

let ratings = new Map();
let providers = ["OpenRouter"];
let settings = {
  theme: "dark",
  fontSize: 13,
  tableFontSize: 13,
  provider: "OpenRouter",
  language: "en",
  autoRefreshMinutes: 0,
  
  viewMode: "table",
};

let selectedModelId = null;

let compareIds = [];

let infoModelId = null;

let snippetLang = "curl";

let cursorRow = -1;

let renderTimer = null;

let autoRefreshTimer = null;

let lastUpdatedAt = 0;

const els = {
  body: document.getElementById("modelsBody"),
  search: document.getElementById("modelSearch"),
  chipFav: document.getElementById("chipFav"),
  chipFree: document.getElementById("chipFree"),
  chipOnePerFamily: document.getElementById("chipOnePerFamily"),
  ctxMin: document.getElementById("ctxMin"),
  priceMax: document.getElementById("priceMax"),
  modalitySelect: document.getElementById("modalitySelect"),
  outputModalitySelect: document.getElementById("outputModalitySelect"),
  btnResetFilters: document.getElementById("btnResetFilters"),
  btnEmptyReset: document.getElementById("btnEmptyReset"),
  chipCount: document.getElementById("chipCountVal"),
  chipTotal: document.getElementById("chipTotalVal"),
  statusDot: document.getElementById("statusDot"),
  footerStatus: document.getElementById("footerStatus"),
  providerSelect: document.getElementById("providerSelect"),
  settingsProviderSelect: document.getElementById("settingsProviderSelect"),
  pillProvider: document.getElementById("pillProvider"),
  pillModel: document.getElementById("pillModel"),
  pillTokens: document.getElementById("pillTokens"),
  pillIn: document.getElementById("pillIn"),
  pillOut: document.getElementById("pillOut"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  emptyState: document.getElementById("emptyState"),
  viewMain: document.getElementById("view-main"),
  viewSettings: document.getElementById("view-settings"),
  themeToggle: document.getElementById("themeToggle"),
  fontValue: document.getElementById("fontValue"),
  tableFontValue: document.getElementById("tableFontValue"),
  pillProviderRow: document.getElementById("providerInfo"),
  languageSelect: document.getElementById("languageSelect"),
  autoRefreshInput: document.getElementById("autoRefreshInput"),
  columnsBox: document.getElementById("columnsBox"),
  
  rowActions: document.getElementById("rowActions"),
  
  btnViewMode: document.getElementById("btnViewMode"),
  cardsView: document.getElementById("cardsView"),
  cardsGrid: document.getElementById("cardsGrid"),
  cardsSort: document.getElementById("cardsSort"),
  cardsSortDir: document.getElementById("cardsSortDir"),
  
  btnCompare: document.getElementById("btnCompare"),
  cmpCount: document.getElementById("cmpCount"),
  compareModal: document.getElementById("compareModal"),
  compareModalBody: document.getElementById("compareModalBody"),
  btnCompareClose: document.getElementById("btnCompareClose"),
  
  infoModal: document.getElementById("infoModal"),
  infoModalBody: document.getElementById("infoModalBody"),
  infoModalTitle: document.getElementById("infoModalTitle"),
  btnInfoClose: document.getElementById("btnInfoClose"),
  snippetBox: document.getElementById("snippetBox"),
  snippetTabs: document.getElementById("snippetTabs"),
  btnCopySnippet: document.getElementById("btnCopySnippet"),
};

function fmtK(n) {
  if (n == null || n === 0) return "—";
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 100 ? k.toFixed(0) : k.toFixed(1)).replace(/\.0$/, "") + " " + t("unit.k");
  }
  return n.toString();
}

const PER_MILLION = 1000000;

function trimZeros(s) {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

function fmtPriceWithUnit(n) {
  const isFree = n == null || n < 0 || n === 0;
  return isFree ? fmtPrice(n) : fmtPrice(n) + " $";
}

function priceClass(n) {
  return (n == null || n < 0 || n === 0) ? "price-free" : "price-paid";
}

function fmtPrice(n) {
  if (n == null) return t("price.unknown");
  
  if (n < 0) return t("price.unknown");
  if (n === 0) return t("price.free");
  const perM = n * PER_MILLION;
  if (perM < 0.01) return trimZeros(perM.toFixed(6));
  if (perM < 1) return trimZeros(perM.toFixed(4));
  return trimZeros(perM.toFixed(2));
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function escapeAttr(t) {
  return String(t).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function highlight(text, query) {
  const safe = escapeHtml(text || "");
  if (!query) return safe;
  const q = query.trim();
  if (!q) return safe;
  const idx = safe.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return safe;
  return safe.slice(0, idx)
    + '<mark class="hl">' + safe.slice(idx, idx + q.length) + "</mark>"
    + safe.slice(idx + q.length);
}

const SCENARIO_INPUT_TOKENS = 1000;
const SCENARIO_OUTPUT_TOKENS = 1000;

function requestCost(m) {
  const pi = (m.inputPrice == null || m.inputPrice < 0) ? null : m.inputPrice;
  const po = (m.outputPrice == null || m.outputPrice < 0) ? null : m.outputPrice;
  if (pi == null && po == null) return null;
  return (pi || 0) * SCENARIO_INPUT_TOKENS + (po || 0) * SCENARIO_OUTPUT_TOKENS;
}

function fmtCost(cost) {
  if (cost == null) return "—";
  if (cost === 0) return t("price.free");
  if (cost < 0.0001) return "$" + cost.toFixed(6);
  if (cost < 0.01) return "$" + cost.toFixed(5);
  return "$" + cost.toFixed(4);
}

function familyOf(m) {
  const id = m.id || "";
  const slash = id.indexOf("/");
  let name = slash > 0 ? id.slice(slash + 1) : id;
  
  const colon = name.indexOf(":");
  if (colon > 0) name = name.slice(0, colon);
  return name.toLowerCase();
}

const SUB_COLUMNS = [
  { key: "context", label: "table.context", sort: "context", cls: "col-context" },
  { key: "input", label: "table.input", sort: "input", cls: "col-input" },
  { key: "output", label: "table.output", sort: "output", cls: "col-output" },
  { key: "created", label: "table.created", sort: "created", cls: "col-created" },
];

const COLUMNS = [
  { key: "context", label: "table.context" },
  { key: "input", label: "table.input" },
  { key: "output", label: "table.output" },
  { key: "created", label: "table.created" },
  { key: "rating", label: "table.rating" },
];

let visibleColumns = new Set(COLUMNS.map(c => c.key));

function visibleSubColumns() {
  return SUB_COLUMNS.filter(c => visibleColumns.has(c.key));
}

function ratingVisible() {
  return visibleColumns.has("rating");
}

function buildThead() {
  const thead = document.querySelector(".models-table thead");
  if (!thead) return;
  const subs = visibleSubColumns();
  const nSub = subs.length;

  const subHeads = subs.map(c => `
    <th class="sortable ${c.cls}" data-sort="${c.sort}">
      <span>${escapeHtml(t(c.label))}</span><span class="sort-arrow">▲</span>
    </th>`).join("");

  thead.innerHTML = `
    <tr class="head-main">
      <th class="col-cmp" rowspan="2" data-i18n-title="table.cmpTitle" title="Add to comparison">⇄</th>
      <th class="col-fav-h" rowspan="2" data-i18n-title="table.favTitle" title="Favorite">★</th>
      <th class="sortable col-model" data-sort="name" colspan="${nSub}">
        <span>${escapeHtml(t("table.model"))}</span><span class="sort-arrow">▲</span>
      </th>
      ${ratingVisible() ? `
      <th class="sortable col-rating" data-sort="rating" rowspan="2" data-i18n-title="table.ratingTitle" title="Your rating">
        <span>${escapeHtml(t("table.rating"))}</span><span class="sort-arrow">▲</span>
      </th>` : ""}
    </tr>
    <tr class="head-sub">
      ${subHeads}
    </tr>`;

  initSorting();
  updateSortIndicators();
}

function pushColumnsToCs() {
  const list = COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => c.key).join(",");
  sendToCs({ type: "settings", visibleColumns: list });
}

function applyVisibleColumns(spec) {
  if (spec == null) return;
  const list = String(spec).split(",").map(s => s.trim()).filter(Boolean);
  
  if (!list.length) visibleColumns = new Set(COLUMNS.map(c => c.key));
  else visibleColumns = new Set(list);
  renderColumnSettings();
  buildThead();
  render();
}

function renderColumnSettings() {
  const box = document.getElementById("columnsBox");
  if (!box) return;
  box.querySelectorAll("[data-col]").forEach(el => {
    el.checked = visibleColumns.has(el.dataset.col);
  });
}

function applyTheme(theme) {
  settings.theme = (theme === "light") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", settings.theme);
  const toggle = els.themeToggle;
  if (toggle) {
    const isDark = settings.theme === "dark";
    toggle.setAttribute("aria-checked", isDark ? "true" : "false");
    toggle.classList.toggle("is-dark", isDark);
    toggle.classList.toggle("is-light", !isDark);
  }
}

function applyLanguage(lang) {
  settings.language = (window.i18n ? window.i18n.setLang(lang || "en") : "en");
  if (els.languageSelect) els.languageSelect.value = settings.language;
  document.title = t("app.title");
  fillProviderSelects();
  fillModalitySelects();
  
  renderHotkeysList();
  render();
  
  if (els.footerStatus && els.footerStatus.dataset.i18nKey) {
    els.footerStatus.textContent = t(els.footerStatus.dataset.i18nKey, els.footerStatus.dataset.i18nVars
      ? JSON.parse(els.footerStatus.dataset.i18nVars) : undefined);
  }
}

function setStatusKey(key, vars) {
  if (!els.footerStatus) return;
  els.footerStatus.dataset.i18nKey = key;
  if (vars) els.footerStatus.dataset.i18nVars = JSON.stringify(vars);
  else delete els.footerStatus.dataset.i18nVars;
  els.footerStatus.textContent = t(key, vars);
}

function applyFontSizes() {
  const ui = Math.min(26, Math.max(10, settings.fontSize || 13));
  const tbl = Math.min(26, Math.max(10, settings.tableFontSize || 13));
  document.documentElement.style.setProperty("--ui-font-size", ui + "px");
  document.documentElement.style.setProperty("--table-font-size", tbl + "px");
  if (els.fontValue) els.fontValue.textContent = ui + " px";
  if (els.tableFontValue) els.tableFontValue.textContent = tbl + " px";
}

const ALL_PROVIDERS = "OpenRouter";

function providerOf(m) {
  if (m.provider) return m.provider;
  const id = m.id || "";
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : ALL_PROVIDERS;
}

function collectProviders() {
  const set = new Set(providers);
  allModels.forEach(m => set.add(providerOf(m)));
  const list = Array.from(set).filter(Boolean).sort();
  
  const allLabel = ALL_PROVIDERS;
  const rest = list.filter(p => p !== allLabel);
  return [allLabel, ...rest];
}

function fillProviderSelects() {
  const list = collectProviders();
  
  const current = state.provider || settings.provider || ALL_PROVIDERS;
  if (!list.includes(current)) list.unshift(current);

  [els.providerSelect, els.settingsProviderSelect].forEach(sel => {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";
    list.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = (p === ALL_PROVIDERS) ? t("filter.allProviders") : p;
      sel.appendChild(opt);
    });
    
    const wanted = sel === els.settingsProviderSelect ? (settings.provider || current) : current;
    sel.value = list.includes(wanted) ? wanted : (list.includes(prev) ? prev : current);
  });

  if (!list.includes(state.provider)) state.provider = current;
  if (els.pillProvider) els.pillProvider.textContent = state.provider;
}

function collectModalities(key) {
  const set = new Set();
  allModels.forEach(m => {
    const list = m[key];
    if (Array.isArray(list)) list.forEach(v => { if (v) set.add(v); });
  });
  return Array.from(set).sort();
}

function fillModalitySelects() {
  const pairs = [
    [els.modalitySelect, "inputModalities", state.modality],
    [els.outputModalitySelect, "outputModalities", state.outputModality],
  ];
  pairs.forEach(([sel, key, current]) => {
    if (!sel) return;
    const list = collectModalities(key);
    if (current && !list.includes(current)) list.unshift(current);
    const prev = sel.value;
    sel.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = t("filter.all");
    sel.appendChild(all);
    list.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
    sel.value = list.includes(current) ? current : (prev || "");
  });
}

function sortModels(list, key, dir) {
  const val = (m) => {
    switch (key) {
      case "name": return (m.name || m.id || "").toLowerCase();
      case "rating": return (m.rating > 0) ? m.rating : null;
      case "context": return m.contextLength || 0;
      
      case "input": return (m.inputPrice == null || m.inputPrice < 0) ? null : m.inputPrice;
      case "output": return (m.outputPrice == null || m.outputPrice < 0) ? null : m.outputPrice;
      case "cost": return requestCost(m);
      case "created": return m.created || null;
      default: return 0;
    }
  };
  return list.slice().sort((a, b) => {
    const va = val(a), vb = val(b);
    
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    
    const na = (a.name || a.id || "").toLowerCase();
    const nb = (b.name || b.id || "").toLowerCase();
    return na < nb ? -1 : (na > nb ? 1 : 0);
  });
}

function updateSortIndicators() {
  document.querySelectorAll(".models-table thead th.sortable").forEach(th => {
    const active = th.dataset.sort === sort.key;
    th.classList.toggle("sorted-asc", active && sort.dir === 1);
    th.classList.toggle("sorted-desc", active && sort.dir === -1);
    
    th.setAttribute("aria-sort", active ? (sort.dir === 1 ? "ascending" : "descending") : "none");
  });
}

function initSorting() {
  document.querySelectorAll(".models-table thead th.sortable").forEach(th => {
    th.setAttribute("tabindex", "0");
    th.setAttribute("role", "columnheader");
    const toggleSort = () => {
      const key = th.dataset.sort;
      if (sort.key === key) {
        
        sort.dir = sort.dir === 1 ? -1 : 1;
      } else {
        sort.key = key;
        sort.dir = 1;
      }
      updateSortIndicators();
      render();
    };
    th.addEventListener("click", toggleSort);
    
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(); }
    });
  });
  updateSortIndicators();
}

function renderStars(value) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    
    const fill = Math.max(0, Math.min(1, v - (i - 1))) * 100;
    html += `<span class="star" data-star="${i}">`
      + '<span class="star-bg"></span>'
      + `<span class="star-fg" style="width:${fill}%"></span>`
      + '</span>';
  }
  html += '</span>';
  if (v > 0) html += `<span class="rating-value">${String(v).replace(".", ",")}</span>`;
  return html;
}

function applyStarClick(id, starEl, evt) {
  const rect = starEl.getBoundingClientRect();
  if (rect.width <= 0) return;
  const x = evt.clientX - rect.left;
  const idx = parseInt(starEl.dataset.star, 10) || 1;
  
  const half = x < rect.width / 2;
  let value = half ? idx - 0.5 : idx;
  if (value < 0.5) value = 0.5;
  
  const current = ratings.get(id) || 0;
  if (Math.abs(current - value) < 0.001) value = 0;
  setRating(id, value);
}

function setRating(id, value) {
  const v = Math.round(value * 2) / 2;
  if (v <= 0) ratings.delete(id);
  else ratings.set(id, v);
  const model = allModels.find(m => m.id === id);
  if (model) model.rating = v > 0 ? v : 0;
  render();
  sendToCs({ type: "rating", id, rating: v > 0 ? v : 0 });
}

const ROW_MAIN_HEIGHT = 41;
const ROW_SUB_HEIGHT = 26;
const ROW_HEIGHT = ROW_MAIN_HEIGHT + ROW_SUB_HEIGHT;

const VIRTUAL_BUFFER = 10;

let virtualStart = 0;
let virtualEnd = 0;

function tableScroller() {
  return document.getElementById("tableWrap");
}

function computeWindow() {
  const wrap = tableScroller();
  const total = filtered.length;
  if (!wrap) return [0, total];
  
  const viewH = wrap.clientHeight || 600;
  const needed = Math.ceil(viewH / ROW_HEIGHT) + VIRTUAL_BUFFER * 2;
  if (total <= needed) return [0, total];

  const head = wrap.querySelector("thead");
  const headH = head ? head.offsetHeight : 0;
  const scrollTop = wrap.scrollTop;

  const first = Math.floor(Math.max(0, scrollTop - headH) / ROW_HEIGHT);
  const start = Math.max(0, first - VIRTUAL_BUFFER);
  const end = Math.min(total, start + needed);
  return [start, end];
}

function scrollToIndex(index) {
  const wrap = tableScroller();
  if (!wrap) return;
  const head = wrap.querySelector("thead");
  const headH = head ? head.offsetHeight : 0;
  const top = headH + index * ROW_HEIGHT;
  const bottom = top + ROW_HEIGHT;
  const viewTop = wrap.scrollTop + headH;
  const viewBottom = wrap.scrollTop + wrap.clientHeight;
  if (top < viewTop) wrap.scrollTop = top - headH;
  else if (bottom > viewBottom) wrap.scrollTop = bottom - wrap.clientHeight;
}

function renderWindow() {
  const tbody = els.body;
  if (!tbody) return;
  const [start, end] = computeWindow();
  if (start === virtualStart && end === virtualEnd && tbody.childElementCount > 0) return;
  virtualStart = start;
  virtualEnd = end;

  const frag = document.createDocumentFragment();
  
  const totalCols = 2 + visibleSubColumns().length + (ratingVisible() ? 1 : 0);

  if (start > 0) {
    const spacer = document.createElement("tr");
    spacer.className = "v-spacer";
    const td = document.createElement("td");
    td.colSpan = totalCols;
    td.style.height = (start * ROW_HEIGHT) + "px";
    td.style.padding = "0";
    td.style.border = "none";
    spacer.appendChild(td);
    frag.appendChild(spacer);
  }

  for (let i = start; i < end; i++) {
    const [trMain, trSub] = buildRow(filtered[i]);
    trMain.dataset.index = String(i);
    trSub.dataset.index = String(i);
    frag.appendChild(trMain);
    frag.appendChild(trSub);
  }

  if (end < filtered.length) {
    const spacer = document.createElement("tr");
    spacer.className = "v-spacer";
    const td = document.createElement("td");
    td.colSpan = totalCols;
    td.style.height = ((filtered.length - end) * ROW_HEIGHT) + "px";
    td.style.padding = "0";
    td.style.border = "none";
    spacer.appendChild(td);
    frag.appendChild(spacer);
  }

  tbody.replaceChildren(frag);
}

function ratingOf(m) {
  return ratings.has(m.id) ? ratings.get(m.id) : (m.rating || 0);
}

function passesFilters(m) {
  
  if (state.provider && state.provider !== ALL_PROVIDERS && providerOf(m) !== state.provider) return false;
  if (state.favOnly && !favorites.has(m.id)) return false;
  if (state.freeOnly && !(m.inputPrice === 0 && m.outputPrice === 0)) return false;
  
  if (state.modality) {
    const mods = m.inputModalities;
    if (!Array.isArray(mods) || !mods.includes(state.modality)) return false;
  }
  if (state.outputModality) {
    const mods = m.outputModalities;
    if (!Array.isArray(mods) || !mods.includes(state.outputModality)) return false;
  }
  
  if ((m.contextLength || 0) / 1000 < state.ctxMin) return false;
  
  const prices = [m.inputPrice, m.outputPrice]
    .filter(p => p != null && p >= 0)
    .map(p => p * PER_MILLION);
  if (prices.length && Math.max(...prices) > state.priceMax) return false;
  const haystack = (m.id + " " + (m.name || "") + " " + (m.description || "")).toLowerCase();
  return haystack.includes(state.search.toLowerCase());
}

function collapseFamilies(list) {
  const best = new Map();
  list.forEach(m => {
    const fam = familyOf(m);
    const cur = best.get(fam);
    if (!cur) { best.set(fam, m); return; }
    const costOf = (x) => {
      const c = requestCost(x);
      return c == null ? Infinity : c;
    };
    const cNew = costOf(m), cOld = costOf(cur);
    if (cNew < cOld || (cNew === cOld && (m.contextLength || 0) > (cur.contextLength || 0))) {
      best.set(fam, m);
    }
  });
  
  const keep = new Set(Array.from(best.values()).map(m => m.id));
  return list.filter(m => keep.has(m.id));
}

const CARD_SORT_KEYS = ["name", "context", "input", "output", "created", "rating"];

function isCardsMode() {
  return settings.viewMode === "cards";
}

function toggleViewMode() {
  settings.viewMode = isCardsMode() ? "table" : "cards";
  applyViewMode();
  sendToCs({ type: "settings", viewMode: settings.viewMode });
}

function applyViewMode() {
  const cards = isCardsMode();
  const wrap = document.getElementById("tableWrap");
  if (wrap) wrap.hidden = cards;
  if (els.cardsView) els.cardsView.hidden = !cards;
  if (els.btnViewMode) {
    els.btnViewMode.textContent = cards ? "▤" : "▦";
    els.btnViewMode.title = t(cards ? "btn.viewTable" : "btn.viewCards");
    els.btnViewMode.setAttribute("aria-label", els.btnViewMode.title);
  }
  
  if (cards) renderCardsSort();
  render();
}

const CARD_SORT_ITEMS = [
  { key: "name", label: "table.model" },
  { key: "context", label: "table.context" },
  { key: "input", label: "table.input" },
  { key: "output", label: "table.output" },
  { key: "created", label: "table.created" },
  { key: "rating", label: "table.rating" },
];

const VENDOR_COLORS = {
  "openai": "#10a37f",
  "anthropic": "#d97757",
  "google": "#4285f4",
  "gemini": "#4285f4",
  "meta": "#0866ff",
  "meta-llama": "#0866ff",
  "llama": "#0866ff",
  "mistralai": "#fa500f",
  "mistral": "#fa500f",
  "deepseek": "#4d6bfe",
  "qwen": "#615ced",
  "alibaba": "#ff6a00",
  "nvidia": "#76b900",
  "z-ai": "#2563eb",
  "x-ai": "#e5e5e5",
  "moonshotai": "#1f9d8a",
  "kimi": "#1f9d8a",
  "minimax": "#6d5efc",
  "cohere": "#ff7759",
  "bytedance-seed": "#325ab4",
  "tencent": "#0052d9",
  "huawei": "#cf0a2c",
  "xiaomi": "#ff6900",
  "amazon": "#ff9900",
  "perplexity": "#20808d",
  "ibm-granite": "#0f62fe",
  "upstage": "#6b4eff",
  "nousresearch": "#e8a33d",
  "writer": "#1f4b99",
  "microsoft": "#00a4ef",
  "ai21": "#0a3d91",
  "command-a": "#000000",
  "inception": "#6d28d9",
  "stepfun": "#1d6fe0",
  "liquid": "#22d3ee",
  "arcee-ai": "#7c3aed",
  "morph": "#6366f1",
  "sakanaai": "#e94f37",
  "sakana": "#e94f37",
  "reflection": "#3b82f6",
  "fireworks": "#5019c5",
  "elorian": "#f97316",
  "meituan": "#ffd100",
  "prism-ml": "#8b5cf6",
  "rekaai": "#14b8a6",
  "relace": "#22c55e",
  "sao10k": "#a855f7",
  "scarc": "#ec4899",
  "nex-agi": "#14b8a6",
  "inference-net": "#0ea5e9",
  "poolside": "#22d3ee",
  "thinkingmachines": "#f43f5e",
  "unbiased": "#84cc16",
  "scaledown": "#0891b2",
  "moondream": "#38bdf8",
  "typesafe": "#10b981",
  "dots-studio": "#f472b6",
  "arcee": "#7c3aed",
  "thedrummer": "#ec4899",
  "aion-labs": "#8b5cf6",
  "inclusionai": "#f97316",
  "xingchen-agi": "#06b6d4",
};

const VENDOR_FALLBACK = [
  "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
];

function vendorOf(m) {
  const id = m.id || "";
  const slash = id.indexOf("/");
  let v = slash > 0 ? id.slice(0, slash) : id;
  if (v.startsWith("~")) v = v.slice(1);
  return v.toLowerCase();
}

function vendorColor(m) {
  const v = vendorOf(m);
  if (!v) return VENDOR_FALLBACK[0];
  if (VENDOR_COLORS[v]) return VENDOR_COLORS[v];
  
  for (const key of Object.keys(VENDOR_COLORS)) {
    if (v.includes(key)) return VENDOR_COLORS[key];
  }
  
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
  return VENDOR_FALLBACK[h % VENDOR_FALLBACK.length];
}

function modelNameHtml(name, query) {
  const text = name || "";
  const idx = text.indexOf(":");
  if (idx <= 0) return highlight(text, query);
  const brand = text.slice(0, idx).trim();
  const rest = text.slice(idx + 1).trim();
  if (!brand || !rest) return highlight(text, query);
  return `<span class="model-brand">${highlight(brand, query)}</span>`
       + `<span class="model-rest"> ${highlight(rest, query)}</span>`;
}

function readableVendorColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum >= 0.42) return hex;
  
  const k = Math.min(0.85, (0.52 - lum) * 1.6);
  r = Math.round(r + (255 - r) * k);
  g = Math.round(g + (255 - g) * k);
  b = Math.round(b + (255 - b) * k);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function vendorInitials(m) {
  const v = vendorOf(m);
  if (!v) return "?";
  const clean = v.replace(/[^a-z0-9]/gi, "");
  if (!clean) return "?";
  if (clean.length === 1) return clean.toUpperCase();
  return (clean[0] + clean[1]).toUpperCase();
}

function renderCardsSort() {
  const box = els.cardsSort;
  if (!box) return;
  box.innerHTML = CARD_SORT_ITEMS.map(it => `
    <button class="chip ${sort.key === it.key ? "active" : ""}" data-sort="${it.key}">
      ${escapeHtml(t(it.label))}
    </button>`).join("");
  box.querySelectorAll("[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      
      if (sort.key === key) sort.dir = -sort.dir;
      else { sort.key = key; sort.dir = 1; }
      renderCardsSort();
      updateSortIndicators();
      render();
    });
  });
  if (els.cardsSortDir) {
    els.cardsSortDir.textContent = sort.dir === 1 ? "▲" : "▼";
    els.cardsSortDir.title = t("btn.sortDir");
  }
}

function buildCard(m) {
  const isFav = favorites.has(m.id);
  const rating = ratingOf(m);
  const q = state.search;
  const outModes = Array.isArray(m.outputModalities) ? m.outputModalities.join(" ") : "";
  const created = m.created ? new Date(m.created * 1000) : null;

  const card = document.createElement("article");
  card.className = "model-card";
  card.dataset.id = m.id;
  
  const brand = vendorColor(m);
  card.style.setProperty("--vendor-color", brand);
  card.style.setProperty("--vendor-text", readableVendorColor(brand));
  if (isFav) card.classList.add("fav-card");
  if (compareIds.includes(m.id)) card.classList.add("cmp-card");

  card.innerHTML = `
    <div class="card-top">
      <label class="card-cmp" title="${escapeAttr(t("table.cmpTitle"))}">
        <input type="checkbox" class="cmp-check" ${compareIds.includes(m.id) ? "checked" : ""} />
      </label>
      <span class="card-fav ${isFav ? "filled" : ""}" title="${escapeAttr(t("table.favTitle"))}">
        <span class="fav-star">${isFav ? "★" : "☆"}</span>
      </span>
      <span class="card-logo" style="--vendor-color:${escapeAttr(brand)}" aria-hidden="true">${escapeHtml(vendorInitials(m))}</span>
      <span class="card-provider">${escapeHtml(providerOf(m))}</span>
    </div>
    <div class="card-name" title="${escapeAttr(m.id)}">${modelNameHtml(m.name || m.id, q)}</div>
    <div class="card-specs">
      <div class="card-spec"><span class="spec-label">${escapeHtml(t("table.context"))}</span><span class="spec-value">${fmtK(m.contextLength)}</span></div>
      <div class="card-spec"><span class="spec-label">${escapeHtml(t("table.input"))}</span><span class="spec-value ${priceClass(m.inputPrice)}">${fmtPriceWithUnit(m.inputPrice)}</span></div>
      <div class="card-spec"><span class="spec-label">${escapeHtml(t("table.output"))}</span><span class="spec-value ${priceClass(m.outputPrice)}">${fmtPriceWithUnit(m.outputPrice)}${outModes ? ` <span class="price-modes">${escapeHtml(outModes)}</span>` : ""}</span></div>
      <div class="card-spec"><span class="spec-label">${escapeHtml(t("table.created"))}</span><span class="spec-value">${created ? created.toLocaleDateString(i18nLocale()) : "—"}</span></div>
    </div>
    <div class="card-bottom">
      <div class="card-rating">${renderStars(rating)}</div>
      <div class="card-actions">
        <button class="icon-btn card-act" data-card-act="copy" data-i18n-title="table.copyTitle" title="Copy ID">📋</button>
        <button class="icon-btn card-act" data-card-act="info" data-i18n-title="table.infoTitle" title="Information">ℹ</button>
        <button class="icon-btn card-act" data-card-act="open" data-i18n-title="table.openTitle" title="Open page">↗</button>
      </div>
    </div>`;

  card.querySelector(".card-fav")?.addEventListener("click", (e) => {
    e.stopPropagation();
    app.toggleFavorite(m.id);
  });
  card.querySelector(".cmp-check")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCompare(m.id, e.target.checked);
  });
  card.querySelectorAll(".star").forEach(starEl => {
    starEl.addEventListener("click", (e) => {
      e.stopPropagation();
      applyStarClick(m.id, starEl, e);
    });
  });
  card.querySelectorAll(".card-act").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = btn.dataset.cardAct;
      if (act === "copy") app.copyModelId(m.id);
      else if (act === "open") openModelPage(m.id);
      else app.showInfo(m.id);
    });
  });
  card.addEventListener("click", () => selectCard(card, m));

  return card;
}

function selectCard(card, m) {
  els.cardsGrid?.querySelectorAll(".model-card.selected").forEach(c => c.classList.remove("selected"));
  card.classList.add("selected");
  selectedModelId = m.id;
  showRowActions(m);
  const p = els.pillProvider;
  if (p) p.textContent = providerOf(m);
  if (els.pillModel) els.pillModel.textContent = m.name || m.id;
  if (els.pillTokens) els.pillTokens.textContent = fmtK(m.contextLength) + " ctx";
  if (els.pillIn) els.pillIn.textContent = fmtPrice(m.inputPrice) + " $/1M";
  if (els.pillOut) els.pillOut.textContent = fmtPrice(m.outputPrice) + " $/1M";
}

function renderCards() {
  const grid = els.cardsGrid;
  if (!grid) return;
  const frag = document.createDocumentFragment();
  for (const m of filtered) frag.appendChild(buildCard(m));
  grid.replaceChildren(frag);
}

function render() {
  const tbody = els.body;
  if (!tbody) return;

  const q = state.search.toLowerCase();
  filtered = allModels.filter(passesFilters);
  if (state.onePerFamily) filtered = collapseFamilies(filtered);
  if (sort.key) filtered = sortModels(filtered, sort.key, sort.dir);

  if (els.chipCount) els.chipCount.textContent = filtered.length.toLocaleString(i18nLocale());
  if (els.chipTotal) els.chipTotal.textContent = allModels.length.toLocaleString(i18nLocale());

  if (isCardsMode()) {
    
    renderCards();
  } else {
    
    virtualStart = -1;
    virtualEnd = -1;
    renderWindow();
  }

  if (els.emptyState) els.emptyState.hidden = filtered.length !== 0;
  updateCompareButton();
  updateProviderRating();
  hideLoading();
}

function buildRow(m) {
  const isFav = favorites.has(m.id);
  const rating = ratingOf(m);
  const subs = visibleSubColumns();
  const tail = (ratingVisible() ? 1 : 0) + 1;

  const created = m.created ? new Date(m.created * 1000) : null;
  
  const q = state.search;

  const brand = readableVendorColor(vendorColor(m));

  const trMain = document.createElement("tr");
  trMain.className = "row-main";
  trMain.dataset.id = m.id;
  trMain.style.setProperty("--vendor-color", brand);
  if (isFav) trMain.classList.add("fav-row");
  if (compareIds.includes(m.id)) trMain.classList.add("cmp-row");

  const outModes = Array.isArray(m.outputModalities) ? m.outputModalities.join(" ") : "";

  const subValues = {
    context: () => fmtK(m.contextLength),
    
    input: () => `<span class="${priceClass(m.inputPrice)}">${fmtPriceWithUnit(m.inputPrice)}</span>`,
    output: () => `<span class="${priceClass(m.outputPrice)}">${fmtPriceWithUnit(m.outputPrice)}</span>`
      + (outModes ? `<span class="price-modes"> ${escapeHtml(outModes)}</span>` : ""),
    created: () => created ? created.toLocaleDateString(i18nLocale()) : "—",
  };

  trMain.innerHTML = `
    <td class="col-cmp" rowspan="2"><input type="checkbox" class="cmp-check" ${compareIds.includes(m.id) ? "checked" : ""} aria-label="${escapeAttr(t("table.cmpTitle"))}" /></td>
    <td class="col-fav ${isFav ? "filled" : ""}" rowspan="2" title="${escapeAttr(t("table.favTitle"))}"><span class="fav-star">${isFav ? "★" : "☆"}</span></td>
    <td class="col-model" colspan="${subs.length}">
      <div class="model-line">
        <span class="model-name" title="${escapeAttr(m.id)}">${modelNameHtml(m.name || m.id, q)}</span>
      </div>
    </td>
    ${ratingVisible() ? `<td class="col-rating" rowspan="2" title="${escapeAttr(t("table.ratingTitle"))}">${renderStars(rating)}</td>` : ""}`;

  const trSub = document.createElement("tr");
  trSub.className = "row-sub";
  trSub.dataset.id = m.id;
  trSub.style.setProperty("--vendor-color", brand);
  if (isFav) trSub.classList.add("fav-row");
  if (compareIds.includes(m.id)) trSub.classList.add("cmp-row");
  trSub.innerHTML = subs.map(c => `<td class="${c.cls}">${subValues[c.key]()}</td>`).join("");

  [trMain, trSub].forEach(tr => {
    const favCell = tr.querySelector(".col-fav");
    if (favCell) {
      favCell.onclick = (e) => {
        e.stopPropagation();
        app.toggleFavorite(m.id);
      };
    }
    const check = tr.querySelector(".cmp-check");
    if (check) {
      check.onclick = (e) => {
        e.stopPropagation();
        toggleCompare(m.id, check.checked);
      };
    }
    tr.querySelectorAll(".star").forEach(starEl => {
      starEl.onclick = (e) => {
        e.stopPropagation();
        applyStarClick(m.id, starEl, e);
      };
    });
    tr.onclick = () => selectRow(tr, m);
  });

  return [trMain, trSub];
}

function setupRowHover() {
  const tbody = els.body;
  if (!tbody) return;
  let hoveredId = null;

  const setHovered = (id) => {
    if (id === hoveredId) return;
    hoveredId = id;
    tbody.querySelectorAll("tr.hovered").forEach(tr => tr.classList.remove("hovered"));
    if (!id) return;
    
    tbody.querySelectorAll(`tr[data-id="${CSS.escape(id)}"]`).forEach(tr => {
      tr.classList.add("hovered");
    });
  };

  tbody.addEventListener("mouseover", (e) => {
    const tr = e.target.closest?.("tr");
    setHovered(tr && tr.dataset.id ? tr.dataset.id : null);
  });
  tbody.addEventListener("mouseleave", () => setHovered(null));
}

function selectRow(tr, m) {
  document.querySelectorAll(".models-table tr.selected").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");
  
  const pair = tr.classList.contains("row-sub") ? tr.previousElementSibling : tr.nextElementSibling;
  if (pair && pair.dataset.id === m.id) pair.classList.add("selected");
  selectedModelId = m.id;
  showRowActions(m);
  const p = els.pillProvider;
  if (p) p.textContent = providerOf(m);
  if (els.pillModel) els.pillModel.textContent = m.name || m.id;
  if (els.pillTokens) els.pillTokens.textContent = fmtK(m.contextLength) + " ctx";
  if (els.pillIn) els.pillIn.textContent = fmtPrice(m.inputPrice) + " $/1M";
  if (els.pillOut) els.pillOut.textContent = fmtPrice(m.outputPrice) + " $/1M";
}

function showRowActions(m) {
  const box = els.rowActions;
  if (!box) return;
  box.hidden = !m;
}

const MAX_COMPARE = 5;

function toggleCompare(id, on) {
  if (on) {
    if (compareIds.includes(id)) return;
    if (compareIds.length >= MAX_COMPARE) {
      
      compareIds.shift();
    }
    compareIds.push(id);
  } else {
    compareIds = compareIds.filter(x => x !== id);
  }
  
  els.body?.querySelectorAll("tr").forEach(tr => {
    const rowId = tr.dataset.id;
    const on2 = compareIds.includes(rowId);
    tr.classList.toggle("cmp-row", on2);
    const chk = tr.querySelector(".cmp-check");
    if (chk) chk.checked = on2;
  });
  updateCompareButton();
}

function updateCompareButton() {
  if (!els.btnCompare) return;
  els.btnCompare.hidden = compareIds.length === 0;
  if (els.cmpCount) els.cmpCount.textContent = String(compareIds.length);
}

function openCompare() {
  const models = compareIds
    .map(id => allModels.find(m => m.id === id))
    .filter(Boolean);
  if (!models.length) return;

  const best = {
    context: pickBest(models, m => m.contextLength || 0, true),
    input: pickBest(models, m => m.inputPrice, false),
    output: pickBest(models, m => m.outputPrice, false),
    rating: pickBest(models, m => ratingOf(m), true),
  };

  const rows = [
    [t("info.provider"), m => escapeHtml(providerOf(m)), null],
    [t("info.context"), m => fmtK(m.contextLength), best.context],
    [t("table.rating"), m => ratingOf(m) > 0 ? String(ratingOf(m)).replace(".", ",") + " / 5" : "—", best.rating],
    [t("info.input"), m => fmtPrice(m.inputPrice) + " $/1M", best.input],
    [t("info.output"), m => fmtPrice(m.outputPrice) + " $/1M", best.output],
    [t("info.maxOutput"), m => m.maxOutputTokens ? fmtK(m.maxOutputTokens) : "—", null],
  ];

  const head = models.map(m => `
    <th class="cmp-col">
      <div class="cmp-name">${escapeHtml(m.name || m.id)}</div>
      <div class="cmp-id">${escapeHtml(m.id)}</div>
    </th>`).join("");

  const body = rows.map(([label, get, bestId]) => `
    <tr>
      <td class="cmp-label">${escapeHtml(label)}</td>
      ${models.map(m => {
        const isBest = bestId && m.id === bestId;
        return `<td class="${isBest ? "cmp-best" : ""}">${get(m)}</td>`;
      }).join("")}
    </tr>`).join("");

  els.compareModalBody.innerHTML = `
    <table class="cmp-table">
      <thead><tr><th class="cmp-label"></th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  els.compareModal.hidden = false;
}

function pickBest(models, get, higherIsBetter) {
  let bestId = null, bestVal = null;
  models.forEach(m => {
    const v = get(m);
    if (v == null || v < 0) return;
    if (bestVal == null) { bestVal = v; bestId = m.id; return; }
    if (higherIsBetter ? v > bestVal : v < bestVal) { bestVal = v; bestId = m.id; }
  });
  return bestId;
}

function logoDataUri() {
  const el = document.querySelector("#view-main .logo-wrap .logo");
  return el ? el.getAttribute("src") || "" : "";
}

function fireConfetti(originX, originY) {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const colors = ["#b14dff", "#c77dff", "#e9d5ff", "#38bdf8", "#7c22ce", "#f0abfc", "#ff7ac8"];
  const parts = [];
  const count = 320;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    
    const r = Math.random();
    const speed = 4 + Math.pow(r, 1.7) * 22;
    parts.push({
      x: originX, y: originY,
      vx: Math.cos(angle) * speed * (0.85 + Math.random() * 0.4),
      vy: Math.sin(angle) * speed * (0.85 + Math.random() * 0.4) - 5,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 10,
      color: colors[i % colors.length],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.36,
      life: 1,
    });
  }

  const gravity = 0.32;
  const drag = 0.985;
  let frames = 0;

  const step = () => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    parts.forEach(p => {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.006;
      if (p.life > 0 && p.y < window.innerHeight + 60) alive = true;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      
      if (frames % 3 === 0) {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h / 2);
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    });
    frames++;
    
    if (alive && frames < 260) {
      requestAnimationFrame(step);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(step);
}

const ABOUT_TECH = [
  { key: "about.techCsharp", name: "C# / .NET 10" },
  { key: "about.techWinForms", name: "Windows Forms" },
  { key: "about.techWebView", name: "Microsoft Edge WebView2" },
  { key: "about.techChromium", name: "Chromium (Blink / V8)" },
  { key: "about.techJs", name: "Vanilla JavaScript" },
  { key: "about.techCss", name: "CSS Liquid Glass" },
  { key: "about.techApi", name: "OpenRouter API" },
  { key: "about.techTests", name: "xUnit" },
];

function openAbout() {
  const body = document.getElementById("aboutModalBody");
  if (!body) return;
  const version = "1.0";
  const year = new Date().getFullYear();
  body.innerHTML = `
    <div class="about-hero">
      <div class="about-logo"><img class="about-logo-img" src="${logoDataUri()}" alt=""><span class="about-logo-text">DUNA</span></div>
      <div class="about-hero-text">
        <div class="about-app-name" data-i18n="about.appName">AI Models Browser</div>
        <div class="about-version">v${version} · © ${year} Duna</div>
        <div class="about-desc" data-i18n="about.desc">A fast desktop browser for the AI models catalog: compare prices, context windows and modalities, keep favorites and your own ratings.</div>
      </div>
    </div>
    <div class="about-section">
      <div class="about-section-title" data-i18n="about.tech">Technologies</div>
      <div class="about-tech-grid">
        ${ABOUT_TECH.map(item => `
          <div class="about-tech">
            <div class="about-tech-name">${escapeHtml(item.name)}</div>
            <div class="about-tech-desc">${escapeHtml(t(item.key))}</div>
          </div>`).join("")}
      </div>
    </div>
    <div class="about-section">
      <div class="about-section-title" data-i18n="about.credits">Credits</div>
      <div class="about-credits" data-i18n="about.creditsText">Model data is provided by OpenRouter. Interface built with .NET and WebView2. Icons and design by the author.</div>
    </div>`;
  
  if (window.i18n) window.i18n.apply(body);
  const modal = document.getElementById("aboutModal");
  if (modal) modal.hidden = false;
}

function openModelPage(id) {
  
  sendToCs({ type: "openUrl", url: "https://openrouter.ai/" + id });
}

function buildSnippet(m, lang) {
  const id = m.id;
  const safeId = id.replace(/"/g, '\\"');
  if (lang === "python") {
    return `from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="YOUR_OPENROUTER_API_KEY",
)

response = client.chat.completions.create(
    model="${safeId}",
    messages=[
        {"role": "user", "content": "Hello!"},
    ],
)
print(response.choices[0].message.content)`;
  }
  if (lang === "js") {
    return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: "YOUR_OPENROUTER_API_KEY",
});

const response = await client.chat.completions.create({
  model: "${safeId}",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`;
  }
  return `curl https://openrouter.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${safeId}",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'`;
}

function openInfo(id) {
  const m = allModels.find(x => x.id === id);
  if (!m) return;
  infoModelId = id;

  const rating = ratingOf(m);
  const cost = requestCost(m);
  const created = m.created ? new Date(m.created * 1000) : null;

  const rows = [
    [t("info.provider"), escapeHtml(providerOf(m))],
    [t("info.context"), fmtK(m.contextLength)],
    [t("table.rating"), rating > 0 ? String(rating).replace(".", ",") + " / 5" : "—"],
    [t("info.input"), fmtPrice(m.inputPrice) + " $/1M"],
    [t("info.output"), fmtPrice(m.outputPrice) + " $/1M"],
    [t("info.cost"), fmtCost(cost)],
    [t("info.maxOutput"), m.maxOutputTokens ? fmtK(m.maxOutputTokens) + " " + t("unit.tokens") : "—"],
    [t("info.created"), created ? created.toLocaleDateString(i18nLocale()) : "—"],
  ];

  const mods = [];
  if (Array.isArray(m.inputModalities) && m.inputModalities.length) {
    mods.push(`<span class="mode-in">${escapeHtml(t("filter.modality"))}: ${escapeHtml(m.inputModalities.join(", "))}</span>`);
  }
  if (Array.isArray(m.outputModalities) && m.outputModalities.length) {
    mods.push(`<span class="mode-out">${escapeHtml(t("filter.outputModality"))}: ${escapeHtml(m.outputModalities.join(", "))}</span>`);
  }

  els.infoModalTitle.textContent = m.name || m.id;
  
  if (els.infoModal) {
    els.infoModal.style.setProperty("--vendor-color", readableVendorColor(vendorColor(m)));
  }
  els.infoModalBody.innerHTML = `
    <div class="info-grid">
      ${rows.map(([k, v]) => `<div class="info-cell"><div class="info-k">${escapeHtml(k)}</div><div class="info-v">${v}</div></div>`).join("")}
    </div>
    ${mods.length ? `<div class="info-modes">${mods.join("")}</div>` : ""}
    ${m.description ? `<div class="info-desc"><div class="info-desc-title">${escapeHtml(t("info.description"))}</div>${escapeHtml(m.description)}</div>` : ""}
    <div class="info-snip-title">${escapeHtml(t("info.snippet"))}</div>`;

  updateSnippet();
  els.infoModal.hidden = false;
}

function updateSnippet() {
  if (!infoModelId) return;
  const m = allModels.find(x => x.id === infoModelId);
  if (!m) return;
  els.snippetBox.textContent = buildSnippet(m, snippetLang);
  if (els.snippetTabs) {
    els.snippetTabs.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.lang === snippetLang);
    });
  }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) { 
 }
  document.body.removeChild(ta);
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(list, filename) {
  const header = ["id", "name", "provider", "context", "input_$1M", "output_$1M", "request_cost_$", "rating", "created"];
  const rows = list.map(m => [
    m.id,
    m.name || "",
    providerOf(m),
    m.contextLength || 0,
    m.inputPrice == null || m.inputPrice < 0 ? "" : (m.inputPrice * PER_MILLION).toFixed(4),
    m.outputPrice == null || m.outputPrice < 0 ? "" : (m.outputPrice * PER_MILLION).toFixed(4),
    requestCost(m) == null ? "" : requestCost(m).toFixed(6),
    ratingOf(m) || "",
    m.created || "",
  ]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [header.join(";"), ...rows.map(r => r.map(esc).join(";"))].join("\n");
  
  downloadFile(filename, "﻿" + csv, "text/csv;charset=utf-8");
}

function pushFiltersToCs() {
  sendToCs({
    type: "filters",
    filters: {
      search: state.search,
      favOnly: state.favOnly,
      freeOnly: state.freeOnly,
      ctxMin: state.ctxMin,
      priceMax: state.priceMax,
      sortKey: sort.key || "",
      sortDir: sort.dir,
      modality: state.modality,
      outputModality: state.outputModality,
      onePerFamily: state.onePerFamily,
    },
  });
}

function applyFilters(f) {
  if (!f) return;
  state.search = f.search || "";
  state.favOnly = !!f.favOnly;
  state.freeOnly = !!f.freeOnly;
  state.ctxMin = f.ctxMin || 0;
  state.priceMax = (f.priceMax == null) ? Infinity : f.priceMax;
  state.modality = f.modality || "";
  state.outputModality = f.outputModality || "";
  state.onePerFamily = !!f.onePerFamily;
  if (f.sortKey) { sort.key = f.sortKey; sort.dir = f.sortDir || 1; }

  if (els.search) els.search.value = state.search;
  if (els.ctxMin) els.ctxMin.value = String(state.ctxMin);
  if (els.priceMax) els.priceMax.value = Number.isFinite(state.priceMax) ? String(state.priceMax) : "";
  if (els.chipFav) els.chipFav.classList.toggle("active", state.favOnly);
  if (els.chipFree) els.chipFree.classList.toggle("active", state.freeOnly);
  if (els.chipOnePerFamily) els.chipOnePerFamily.classList.toggle("active", state.onePerFamily);
  updateSortIndicators();
  render();
}

function resetFilters() {
  state.search = "";
  state.favOnly = false;
  state.freeOnly = false;
  state.onePerFamily = false;
  state.ctxMin = 0;
  state.priceMax = 100;
  state.modality = "";
  state.outputModality = "";
  sort.key = null;
  sort.dir = 1;

  if (els.search) els.search.value = "";
  if (els.ctxMin) els.ctxMin.value = "0";
  if (els.priceMax) els.priceMax.value = "100";
  if (els.modalitySelect) els.modalitySelect.value = "";
  if (els.outputModalitySelect) els.outputModalitySelect.value = "";
  if (els.chipFav) els.chipFav.classList.remove("active");
  if (els.chipFree) els.chipFree.classList.remove("active");
  if (els.chipOnePerFamily) els.chipOnePerFamily.classList.remove("active");
  updateSortIndicators();
  render();
  pushFiltersToCs();
}

function setupAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  const minutes = Math.max(0, settings.autoRefreshMinutes || 0);
  if (!minutes) return;
  autoRefreshTimer = setInterval(() => {
    
    sendToCs({ type: "refresh" });
  }, minutes * 60 * 1000);
}

function moveCursor(delta) {
  if (!filtered.length) return;
  cursorRow = Math.max(0, Math.min(filtered.length - 1, cursorRow + delta));
  
  scrollToIndex(cursorRow);
  virtualStart = -1;
  virtualEnd = -1;
  renderWindow();

  const tr = els.body?.querySelector(`tr.row-main[data-index="${cursorRow}"]`);
  if (!tr) return;
  els.body?.querySelectorAll("tr.cursor").forEach(r => r.classList.remove("cursor"));
  tr.classList.add("cursor");
  
  const sub = tr.nextElementSibling;
  if (sub && sub.dataset.id === tr.dataset.id) sub.classList.add("cursor");
  const m = filtered[cursorRow];
  if (m) selectRow(tr, m);
}

function initVirtualScroll() {
  const wrap = tableScroller();
  if (!wrap) return;
  let pending = false;
  wrap.addEventListener("scroll", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      renderWindow();
    });
  }, { passive: true });
  
  window.addEventListener("resize", () => {
    virtualStart = -1;
    virtualEnd = -1;
    renderWindow();
  });
}

function initHotkeys() {
  document.addEventListener("keydown", (e) => {
    
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === "Escape") {
      const about = document.getElementById("aboutModal");
      if (about && !about.hidden) { about.hidden = true; return; }
      if (!els.infoModal.hidden) { els.infoModal.hidden = true; return; }
      if (!els.compareModal.hidden) { els.compareModal.hidden = true; return; }
      if (inField) { e.target.blur(); return; }
      resetFilters();
      return;
    }
    if (inField) return;

    if (e.key === "/") {
      e.preventDefault();
      if (els.search) els.search.focus();
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); moveCursor(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); moveCursor(-1); return; }
    if (e.key === "Enter") {
      const sel = document.querySelector(".models-table tr.selected");
      if (sel && sel.dataset.id) app.copyModelId(sel.dataset.id);
      return;
    }
    if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
      e.preventDefault();
      showLoadingKey("status.loadingModels");
      sendToCs({ type: "reload" });
    }
  });
}

const HOTKEYS = [
  { keys: ["/"], key: "hotkey.search" },
  { keys: ["\u2191", "\u2193"], key: "hotkey.navigate" },
  { keys: ["Enter"], key: "hotkey.copy" },
  { keys: ["R"], key: "hotkey.reload" },
  { keys: ["Esc"], key: "hotkey.reset" },
];

function renderHotkeysList() {
  const box = document.getElementById("hotkeysList");
  if (!box) return;
  box.innerHTML = HOTKEYS.map(h => `
    <div class="hotkey-item">
      <span class="hotkey-keys">${h.keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join("")}</span>
      <span class="hotkey-desc">${escapeHtml(t(h.key))}</span>
    </div>`).join("");
}

function showLoading(text) {
  if (!els.loadingOverlay) return;
  const label = els.loadingOverlay.querySelector(".loading-text");
  if (label && text) label.textContent = text;
  els.loadingOverlay.classList.remove("hidden");
}

function showLoadingKey(key, vars) {
  showLoading(t(key, vars));
}
function hideLoading() {
  if (els.loadingOverlay) els.loadingOverlay.classList.add("hidden");
}

function showView(name) {
  const isSettings = name === "settings";
  els.viewSettings.classList.toggle("view-hidden", !isSettings);
  els.viewMain.classList.toggle("view-hidden", isSettings);
  if (isSettings) syncSettingsUi();
}

function syncSettingsUi() {
  applyTheme(settings.theme);
  applyLanguage(settings.language);
  applyFontSizes();
  fillProviderSelects();
  renderHotkeysList();
  if (els.settingsProviderSelect) els.settingsProviderSelect.value = settings.provider;
  if (els.autoRefreshInput) els.autoRefreshInput.value = String(settings.autoRefreshMinutes || 0);
}

function pushSettingsToCs() {
  sendToCs({
    type: "settings",
    theme: settings.theme,
    fontSize: settings.fontSize,
    tableFontSize: settings.tableFontSize,
    provider: settings.provider,
    language: settings.language,
    autoRefreshMinutes: settings.autoRefreshMinutes || 0,
    visibleColumns: COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => c.key).join(","),
    viewMode: settings.viewMode || "table",
  });
}

window.app = {
  setModels(models, meta) {
    allModels = models || [];
    favorites = new Set(allModels.filter(m => m.isFavorite).map(m => m.id));
    
    ratings = new Map();
    allModels.forEach(m => {
      const v = Number(m.rating) || 0;
      if (v > 0) ratings.set(m.id, v);
    });
    
    compareIds = compareIds.filter(id => allModels.some(m => m.id === id));
    fillProviderSelects();
    fillModalitySelects();
    render();
    if (meta && meta.updatedAt) lastUpdatedAt = meta.updatedAt;
    if (meta && meta.fromCache) {
      setStatusKey("status.cached");
      setStatusColor("var(--sun)");
    } else {
      setStatusKey("status.loadedModels", { n: allModels.length });
      setStatusColor("var(--green)");
    }
    updateFooterTime();
  },
  setProviders(list) {
    if (Array.isArray(list) && list.length) {
      providers = list.slice();
      fillProviderSelects();
    }
  },
  setFilters(f) {
    applyFilters(f);
  },
  setSettings(s) {
    if (!s) return;
    if (s.theme) settings.theme = s.theme;
    if (s.fontSize) settings.fontSize = s.fontSize;
    if (s.tableFontSize) settings.tableFontSize = s.tableFontSize;
    if (s.autoRefreshMinutes != null) settings.autoRefreshMinutes = s.autoRefreshMinutes;
    if (s.visibleColumns != null) applyVisibleColumns(s.visibleColumns);
    if (s.viewMode) settings.viewMode = s.viewMode;
    if (s.provider) {
      settings.provider = s.provider;
      state.provider = s.provider;
    }
    applyTheme(settings.theme);
    applyLanguage(s.language || settings.language);
    applyFontSizes();
    fillProviderSelects();
    setupAutoRefresh();
    applyViewMode();
  },
  setStatus(text) {
    if (!els.footerStatus) return;
    
    delete els.footerStatus.dataset.i18nKey;
    delete els.footerStatus.dataset.i18nVars;
    els.footerStatus.textContent = text;
  },
  setError(text) {
    if (!els.footerStatus) return;
    delete els.footerStatus.dataset.i18nKey;
    delete els.footerStatus.dataset.i18nVars;
    els.footerStatus.textContent = t("error.prefix") + text;
    setStatusColor("var(--red)");
    hideLoading();
  },
  showLoading(text) { showLoading(text); },
  copyModelId(id) {
    const done = () => {
      const btn = document.querySelector(`button[data-act="copy"]`);
      if (btn) {
        const old = btn.textContent;
        btn.textContent = "OK";
        setTimeout(() => btn.textContent = old, 800);
      }
      setStatusKey("status.copied");
    };
    copyText(id);
    done();
  },
  showInfo(id) {
    openInfo(id);
  },
  toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    render();
    sendToCs({ type: "favorite", id, isFavorite: favorites.has(id) });
  },
  exportModels() {
    const data = JSON.stringify(filtered, null, 2);
    downloadFile("models.json", data, "application/json");
  },
  exportCsv() {
    exportCsv(filtered, "models.csv");
  },
  exportFavorites() {
    const list = allModels.filter(m => favorites.has(m.id));
    exportCsv(list, "favorites.csv");
  },
  openCompare() {
    openCompare();
  },
};

function updateFooterTime() {
  if (!lastUpdatedAt) return;
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - lastUpdatedAt);
  const mins = Math.floor(diff / 60);
  const when = mins < 1
    ? t("status.updated", { n: "1 min" })
    : t("status.updated", { n: mins + " min" });
  const el = document.getElementById("footerUpdated");
  if (el) el.textContent = when;
}

function updateProviderRating() {
  const el = document.getElementById("footerRating");
  if (!el) return;
  const values = [];
  filtered.forEach(m => {
    const r = ratings.get(m.id);
    if (r != null && r > 0) values.push(r);
  });
  if (!values.length) { el.textContent = ""; return; }
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  el.textContent = t("footer.avgRating", {
    n: avg.toFixed(1),
    c: values.length,
  });
}

function setStatusColor(color) {
  if (els.statusDot) els.statusDot.style.background = color;
}
function setStatus(text) {
  if (els.footerStatus) els.footerStatus.textContent = text;
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { renderTimer = null; render(); }, 150);
}

els.search?.addEventListener("input", (e) => {
  state.search = e.target.value;
  scheduleRender();
});

els.chipFav?.addEventListener("click", () => {
  state.favOnly = !state.favOnly;
  els.chipFav.classList.toggle("active", state.favOnly);
  render();
  pushFiltersToCs();
});

els.chipFree?.addEventListener("click", () => {
  state.freeOnly = !state.freeOnly;
  els.chipFree.classList.toggle("active", state.freeOnly);
  render();
  pushFiltersToCs();
});

if (els.chipOnePerFamily) {
  els.chipOnePerFamily.addEventListener("click", () => {
    state.onePerFamily = !state.onePerFamily;
    els.chipOnePerFamily.classList.toggle("active", state.onePerFamily);
    render();
    pushFiltersToCs();
  });
}

els.ctxMin?.addEventListener("change", (e) => {
  state.ctxMin = parseInt(e.target.value) || 0;
  render();
  pushFiltersToCs();
});

els.priceMax?.addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  state.priceMax = isNaN(v) ? Infinity : v;
  render();
  pushFiltersToCs();
});

if (els.modalitySelect) {
  els.modalitySelect.addEventListener("change", (e) => {
    state.modality = e.target.value;
    render();
    pushFiltersToCs();
  });
}
if (els.outputModalitySelect) {
  els.outputModalitySelect.addEventListener("change", (e) => {
    state.outputModality = e.target.value;
    render();
    pushFiltersToCs();
  });
}

if (els.btnResetFilters) els.btnResetFilters.addEventListener("click", resetFilters);
if (els.btnEmptyReset) els.btnEmptyReset.addEventListener("click", resetFilters);

if (els.providerSelect) {
  els.providerSelect.addEventListener("change", (e) => {
    state.provider = e.target.value;
    settings.provider = e.target.value;
    if (els.pillProvider) els.pillProvider.textContent = state.provider;
    if (els.settingsProviderSelect) els.settingsProviderSelect.value = state.provider;
    pushSettingsToCs();
    render();
  });
}

document.getElementById("btnSettings")?.addEventListener("click", () => showView("settings"));
document.getElementById("btnBack")?.addEventListener("click", () => showView("main"));
document.getElementById("btnReload")?.addEventListener("click", () => {
  showLoadingKey("status.loadingModels");
  sendToCs({ type: "reload" });
});
document.getElementById("btnExport")?.addEventListener("click", (e) => {
  
  e.stopPropagation();
  const menu = e.currentTarget.parentElement;
  if (menu) menu.classList.toggle("open");
});
document.getElementById("btnExportJson")?.addEventListener("click", () => app.exportModels());
document.getElementById("btnExportCsvBtn")?.addEventListener("click", () => app.exportCsv());
document.getElementById("btnExportFavBtn")?.addEventListener("click", () => app.exportFavorites());

document.addEventListener("click", () => {
  document.querySelectorAll(".export-menu.open").forEach(m => m.classList.remove("open"));
});

els.themeToggle?.addEventListener("click", () => {
  applyTheme(settings.theme === "dark" ? "light" : "dark");
  pushSettingsToCs();
});

document.getElementById("fontMinus")?.addEventListener("click", () => {
  settings.fontSize = Math.max(10, settings.fontSize - 1);
  applyFontSizes();
  pushSettingsToCs();
});

document.getElementById("fontPlus")?.addEventListener("click", () => {
  settings.fontSize = Math.min(26, settings.fontSize + 1);
  applyFontSizes();
  pushSettingsToCs();
});

document.getElementById("tableFontMinus")?.addEventListener("click", () => {
  settings.tableFontSize = Math.max(10, settings.tableFontSize - 1);
  applyFontSizes();
  pushSettingsToCs();
});

document.getElementById("tableFontPlus")?.addEventListener("click", () => {
  settings.tableFontSize = Math.min(26, settings.tableFontSize + 1);
  applyFontSizes();
  pushSettingsToCs();
});

if (els.autoRefreshInput) {
  els.autoRefreshInput.addEventListener("change", (e) => {
    settings.autoRefreshMinutes = Math.max(0, parseInt(e.target.value) || 0);
    setupAutoRefresh();
    pushSettingsToCs();
  });
}

if (els.settingsProviderSelect) {
  els.settingsProviderSelect.addEventListener("change", (e) => {
    settings.provider = e.target.value;
    state.provider = e.target.value;
    if (els.providerSelect) els.providerSelect.value = state.provider;
    if (els.pillProvider) els.pillProvider.textContent = state.provider;
    pushSettingsToCs();
    render();
  });
}

document.getElementById("btnReset")?.addEventListener("click", () => {
  settings.theme = "dark";
  settings.fontSize = 13;
  settings.tableFontSize = 13;
  settings.provider = "OpenRouter";
  settings.language = "en";
  settings.autoRefreshMinutes = 0;
  state.provider = "OpenRouter";
  applyTheme(settings.theme);
  applyLanguage(settings.language);
  applyFontSizes();
  fillProviderSelects();
  setupAutoRefresh();
  pushSettingsToCs();
  
  resetFilters();
});

document.getElementById("btnSaveSettings")?.addEventListener("click", () => {
  pushSettingsToCs();
  setStatusKey("status.saved");
  showView("main");
});

if (els.btnInfoClose) {
  els.btnInfoClose.addEventListener("click", () => { els.infoModal.hidden = true; });
}
if (els.btnCompareClose) {
  els.btnCompareClose.addEventListener("click", () => { els.compareModal.hidden = true; });
}
if (els.btnCompare) {
  els.btnCompare.addEventListener("click", () => openCompare());
}

const btnCompareClear = document.getElementById("btnCompareClear");
if (btnCompareClear) {
  btnCompareClear.addEventListener("click", () => {
    compareIds = [];
    updateCompareButton();
    render();
  });
}

if (els.btnViewMode) {
  els.btnViewMode.addEventListener("click", () => toggleViewMode());
}

if (els.cardsSortDir) {
  els.cardsSortDir.addEventListener("click", () => {
    sort.dir = -sort.dir;
    renderCardsSort();
    updateSortIndicators();
    render();
  });
}

const btnOpenModel = document.getElementById("btnOpenModel");
if (btnOpenModel) {
  btnOpenModel.addEventListener("click", () => {
    if (infoModelId) openModelPage(infoModelId);
  });
}

if (els.rowActions) {
  els.rowActions.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-row-act]");
    if (!btn || !selectedModelId) return;
    const act = btn.dataset.rowAct;
    if (act === "copy") app.copyModelId(selectedModelId);
    else if (act === "open") openModelPage(selectedModelId);
    else app.showInfo(selectedModelId);
  });
}

document.querySelectorAll(".logo-wrap").forEach(logo => {
  logo.classList.add("logo-clickable");
  logo.title = t("about.title");
  logo.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = logo.getBoundingClientRect();
    fireConfetti(r.left + r.width / 2, r.top + r.height / 2);
    openAbout();
  });
});
const btnAboutClose = document.getElementById("btnAboutClose");
if (btnAboutClose) {
  btnAboutClose.addEventListener("click", () => {
    const m = document.getElementById("aboutModal");
    if (m) m.hidden = true;
  });
}
const aboutModal = document.getElementById("aboutModal");
if (aboutModal) {
  aboutModal.addEventListener("click", (e) => {
    if (e.target === aboutModal) aboutModal.hidden = true;
  });
}

if (els.columnsBox) {
  els.columnsBox.addEventListener("change", (e) => {
    const box = e.target;
    if (!box || !box.dataset || !box.dataset.col) return;
    const key = box.dataset.col;
    if (box.checked) visibleColumns.add(key);
    else visibleColumns.delete(key);
    buildThead();
    pushColumnsToCs();
    render();
  });
}

[els.infoModal, els.compareModal].forEach(modal => {
  if (!modal) return;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.hidden = true;
  });
});
if (els.snippetTabs) {
  els.snippetTabs.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      snippetLang = tab.dataset.lang;
      updateSnippet();
    });
  });
}
if (els.btnCopySnippet) {
  els.btnCopySnippet.addEventListener("click", () => {
    if (!els.snippetBox) return;
    copyText(els.snippetBox.textContent);
    setStatusKey("status.copied");
  });
}

function fillLanguageSelect() {
  const sel = els.languageSelect;
  if (!sel || !window.i18n) return;
  sel.innerHTML = "";
  window.i18n.supported.forEach(code => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = window.i18n.langs[code] || code;
    sel.appendChild(opt);
  });
  sel.value = settings.language;
}

if (els.languageSelect) {
  els.languageSelect.addEventListener("change", (e) => {
    applyLanguage(e.target.value);
    pushSettingsToCs();
  });
}

if (window.chrome && window.chrome.webview) {
  window.chrome.webview.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "models":
          window.app.setModels(msg.data, { updatedAt: msg.updatedAt, fromCache: msg.fromCache });
          break;
        case "providers":
          window.app.setProviders(msg.providers);
          break;
        case "settings":
          window.app.setSettings(msg.settings);
          break;
        case "filters":
          window.app.setFilters(msg.filters);
          break;
        case "status":
          if (msg.key) setStatusKey(msg.key, msg.vars ? JSON.parse(msg.vars) : undefined);
          else window.app.setStatus(msg.text);
          setStatusColor("var(--green)");
          break;
        case "loading":
          if (msg.key) showLoadingKey(msg.key, msg.vars ? JSON.parse(msg.vars) : undefined);
          else showLoading(msg.text || t("status.loadingModels"));
          break;
        case "error":
          if (msg.key) showLoadingKey(msg.key, msg.vars ? JSON.parse(msg.vars) : undefined);
          window.app.setError(msg.text || "");
          break;
        default:
          console.warn("Unknown message", msg);
      }
    } catch (e) {
      console.error("Invalid message from C#", event.data, e);
    }
  });
}

applyTheme(settings.theme);
applyFontSizes();
fillLanguageSelect();
applyLanguage(settings.language);
fillProviderSelects();
buildThead();
initHotkeys();
initVirtualScroll();
setupRowHover();
showLoadingKey("status.loadingModels");
setStatusKey("status.connected");
setStatusColor("var(--red)");

setInterval(updateFooterTime, 60 * 1000);
sendToCs({ type: "ready" });
