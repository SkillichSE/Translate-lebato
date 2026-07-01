const STORAGE_KEY = "lebato-dict-v1";
const REMOVED_KEY = "lebato-removed-v1";
const CUSTOM_KEY = "lebato-custom-v1";
const SAVED_KEY = "lebato-saved-v1";
const HISTORY_KEY = "lebato-history-v1";

let dict = {};
let removedKeys = {};
let customDict = {};
let saved = {};
let history = [];
let direction = "ru-lb";

function migrateOldStorage() {
  let old = null;
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) old = JSON.parse(r); } catch (e) {}
  if (!old) return;

  const removed = {};
  const custom = {};
  for (const k in baseDict) { if (!(k in old)) removed[k] = true; }
  for (const k in old) {
    if (!(k in baseDict)) custom[k] = old[k];
  }
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify(removed));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

function loadDict() {
  migrateOldStorage();
  try { const r = localStorage.getItem(REMOVED_KEY); removedKeys = r ? JSON.parse(r) : {}; } catch (e) { removedKeys = {}; }
  try { const r = localStorage.getItem(CUSTOM_KEY); customDict = r ? JSON.parse(r) : {}; } catch (e) { customDict = {}; }
  rebuildDict();
}

function rebuildDict() {
  dict = {};
  for (const k in baseDict) { if (!removedKeys[k]) dict[k] = baseDict[k]; }
  for (const k in customDict) { if (!removedKeys[k]) dict[k] = customDict[k]; }
}

function persistDict() {
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify(removedKeys));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customDict));
  } catch (e) {}
}

function removeWord(key) {
  if (key in baseDict) removedKeys[key] = true;
  delete customDict[key];
  delete dict[key];
  persistDict();
}

function loadSaved() {
  try { const r = localStorage.getItem(SAVED_KEY); saved = r ? JSON.parse(r) : {}; } catch(e) { saved = {}; }
}

function persistSaved() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch(e) {}
}

function loadHistory() {
  try { const r = localStorage.getItem(HISTORY_KEY); history = r ? JSON.parse(r) : []; } catch(e) { history = []; }
}

function persistHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50))); } catch(e) {}
}

function toggleSaved(ru) {
  if (saved[ru]) { delete saved[ru]; } else { saved[ru] = true; }
  persistSaved();
}

function normalize(word) {
  return word.toLowerCase().replace(/[.,!?;:"]/g, "").trim();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReverseDict() {
  const rev = {};
  for (const [ru, lb] of Object.entries(dict)) {
    const key = lb.toLowerCase();
    if (!rev[key]) rev[key] = ru;
  }
  return rev;
}

function buildTokens(text) {
  if (direction === "lb-ru") return buildTokensReverse(text);

  const phrases = Object.keys(dict).filter(k => k.includes(" ")).sort((a,b) => b.length - a.length);
  let remaining = text;
  const segments = [];

  while (remaining.length > 0) {
    let matchedPhrase = null, matchedIndex = -1;
    const lr = remaining.toLowerCase();
    for (const phrase of phrases) {
      const idx = lr.indexOf(phrase);
      if (idx !== -1 && (matchedIndex === -1 || idx < matchedIndex)) { matchedPhrase = phrase; matchedIndex = idx; }
    }
    if (matchedPhrase !== null) {
      if (matchedIndex > 0) segments.push({ text: remaining.slice(0, matchedIndex), translated: null });
      segments.push({ text: remaining.slice(matchedIndex, matchedIndex + matchedPhrase.length), translated: dict[matchedPhrase], ru: matchedPhrase });
      remaining = remaining.slice(matchedIndex + matchedPhrase.length);
    } else {
      segments.push({ text: remaining, translated: null });
      remaining = "";
    }
  }

  const tokens = [];
  for (const seg of segments) {
    if (seg.translated !== null) {
      tokens.push({ kind: "word", ru: seg.ru, lb: seg.translated, raw: seg.text });
      continue;
    }
    for (const part of seg.text.split(/(\s+)/)) {
      if (part === "" || /^\s+$/.test(part)) { tokens.push({ kind: "gap", raw: part }); continue; }
      const m = part.match(/^([^\wа-яёa-z]*)([\wа-яёa-z-]+)([^\wа-яёa-z]*)$/i);
      if (!m) { tokens.push({ kind: "gap", raw: part }); continue; }
      const [, prefix, word, suffix] = m;
      const norm = normalize(word);
      if (dict[norm]) {
        let translated = dict[norm];
        if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase())
          translated = translated.charAt(0).toUpperCase() + translated.slice(1);
        tokens.push({ kind: "word", ru: norm, lb: translated, raw: prefix + word + suffix, prefix, suffix });
      } else {
        tokens.push({ kind: "unknown", raw: prefix + word + suffix, prefix, suffix, word });
      }
    }
  }
  return tokens;
}

function buildTokensReverse(text) {
  const rev = buildReverseDict();
  const lbPhrases = Object.keys(rev).filter(k => k.includes(" ")).sort((a, b) => b.length - a.length);

  let remaining = text;
  const segments = [];

  while (remaining.length > 0) {
    let matchedPhrase = null, matchedIndex = -1;
    const lr = remaining.toLowerCase();
    for (const phrase of lbPhrases) {
      const idx = lr.indexOf(phrase);
      if (idx !== -1 && (matchedIndex === -1 || idx < matchedIndex)) { matchedPhrase = phrase; matchedIndex = idx; }
    }
    if (matchedPhrase !== null) {
      if (matchedIndex > 0) segments.push({ text: remaining.slice(0, matchedIndex), translated: null });
      segments.push({ text: remaining.slice(matchedIndex, matchedIndex + matchedPhrase.length), translated: rev[matchedPhrase], lb: matchedPhrase });
      remaining = remaining.slice(matchedIndex + matchedPhrase.length);
    } else {
      segments.push({ text: remaining, translated: null });
      remaining = "";
    }
  }

  const tokens = [];
  for (const seg of segments) {
    if (seg.translated !== null) {
      tokens.push({ kind: "word", ru: seg.translated, lb: seg.lb, raw: seg.text });
      continue;
    }
    for (const part of seg.text.split(/(\s+)/)) {
      if (part === "" || /^\s+$/.test(part)) { tokens.push({ kind: "gap", raw: part }); continue; }
      const m = part.match(/^([^a-zа-яё]*)([\wа-яёa-z-]+)([^a-zа-яё]*)$/i);
      if (!m) { tokens.push({ kind: "gap", raw: part }); continue; }
      const [, prefix, word, suffix] = m;
      const key = word.toLowerCase();
      if (rev[key]) {
        let translated = rev[key];
        if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase())
          translated = translated.charAt(0).toUpperCase() + translated.slice(1);
        tokens.push({ kind: "word", ru: translated, lb: key, raw: prefix + word + suffix, prefix, suffix });
      } else {
        tokens.push({ kind: "unknown", raw: prefix + word + suffix, prefix, suffix, word });
      }
    }
  }
  return tokens;
}

function renderOutputHtml(tokens) {
  let html = "";
  for (const t of tokens) {
    if (t.kind === "gap") {
      html += t.raw;
    } else if (t.kind === "word") {
      const isSaved = saved[t.ru];
      const display = direction === "lb-ru" ? escapeHtml(t.ru) : escapeHtml(t.lb);
      html += `<span class="word${isSaved ? " word--saved" : ""}" data-ru="${escapeHtml(t.ru)}" data-lb="${escapeHtml(t.lb)}">${display}</span>`;
    } else {
      html += `${escapeHtml(t.prefix || "")}<span class="unknown">${escapeHtml(t.word)}</span>${escapeHtml(t.suffix || "")}`;
    }
  }
  return html;
}

const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const statsLineEl = document.getElementById("statsLine");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const examplesCard = document.getElementById("examplesCard");
const examplesList = document.getElementById("examplesList");
const charCountEl = document.getElementById("charCount");
const labelSrc = document.getElementById("labelSrc");
const labelDst = document.getElementById("labelDst");
const swapBtn = document.getElementById("swapBtn");

let lastTokens = [];

function renderTranslation() {
  const text = inputEl.value;
  charCountEl.textContent = text.length;

  if (!text.trim()) {
    outputEl.innerHTML = '<span class="placeholder">Перевод</span>';
    statsLineEl.textContent = "";
    lastTokens = [];
    renderExamples([]);
      return;
  }

  lastTokens = buildTokens(text);
  outputEl.innerHTML = renderOutputHtml(lastTokens);

  const known = lastTokens.filter(t => t.kind === "word").length;
  const unknown = lastTokens.filter(t => t.kind === "unknown").length;
  const total = known + unknown;
  const pct = total > 0 ? Math.round(known / total * 100) : 0;
  statsLineEl.textContent = `${known}/${total} слов · ${pct}%`;

  attachWordHandlers();
  renderExamples(lastTokens.filter(t => t.kind === "word"));
  saveToHistory(text, outputEl.innerText);
}

function attachWordHandlers() {
  outputEl.querySelectorAll(".word").forEach(el => {
    el.addEventListener("click", () => {
      const ru = el.getAttribute("data-ru");
      toggleSaved(ru);
      el.classList.toggle("word--saved", !!saved[ru]);
      renderFlashcards();
    });
  });
}



swapBtn.addEventListener("click", () => {
  direction = direction === "ru-lb" ? "lb-ru" : "ru-lb";
  if (direction === "lb-ru") {
    labelSrc.textContent = "Лебато Броза";
    labelDst.textContent = "Русский";
  } else {
    labelSrc.textContent = "Русский";
    labelDst.textContent = "Лебато Броза";
  }
  const cur = inputEl.value;
  const translated = outputEl.innerText;
  if (translated && translated !== "Перевод") {
    inputEl.value = translated;
  }
  renderTranslation();
  inputEl.focus();
});

function saveToHistory(src, dst) {
  if (!src.trim() || !dst.trim() || dst === "Перевод") return;
  const entry = { src: src.trim(), dst: dst.trim(), dir: direction, ts: Date.now() };
  const existing = history.findIndex(h => h.src === entry.src && h.dir === entry.dir);
  if (existing !== -1) history.splice(existing, 1);
  history.unshift(entry);
  persistHistory();
}

function renderExamples(wordTokens) {
  if (!wordTokens || wordTokens.length === 0) {
    examplesCard.hidden = true;
    examplesList.innerHTML = "";
    return;
  }

  const ruWords = new Set(wordTokens.map(t => t.ru));
  const phraseEntries = Object.entries(dict).filter(([ru]) => ru.includes(" "));
  const matches = [];

  for (const [ru, lb] of phraseEntries) {
    for (const word of ruWords) {
      if (ru.includes(word) || lb.toLowerCase().includes(word)) { matches.push({ ru, lb }); break; }
    }
    if (matches.length >= 4) break;
  }

  if (matches.length === 0) {
    examplesCard.hidden = true;
    examplesList.innerHTML = "";
    return;
  }

  examplesCard.hidden = false;
  examplesList.innerHTML = matches.map(({ ru, lb }) => {
    let lbHtml = escapeHtml(lb);
    let ruHtml = escapeHtml(ru);
    for (const word of ruWords) {
      const re = new RegExp(`(${escapeRegExp(word)})`, "i");
      if (re.test(ruHtml)) ruHtml = ruHtml.replace(re, "<mark>$1</mark>");
    }
    return `<div class="example"><div class="example__lb">${lbHtml}</div><div class="example__ru">${ruHtml}</div></div>`;
  }).join("");
}

const flashCard = document.getElementById("flashCard");
const flashBody = document.getElementById("flashBody");
const flashCountEl = document.getElementById("flashCount");
const flashFlip = document.getElementById("flashFlip");
const flashNext = document.getElementById("flashNext");
const flashRemove = document.getElementById("flashRemove");

let flashDeck = [];
let flashIndex = 0;
let flashShowing = false;

function renderFlashcards() {
  flashDeck = Object.keys(saved);
  if (flashDeck.length === 0) { flashCard.hidden = true; return; }
  flashCard.hidden = false;
  flashCountEl.textContent = `${flashDeck.length} слов`;
  if (flashIndex >= flashDeck.length) flashIndex = 0;
  showFlashcard();
}

function showFlashcard() {
  flashShowing = false;
  const ru = flashDeck[flashIndex];
  const lb = dict[ru] || "—";
  const front = direction === "ru-lb" ? ru : lb;
  const back = direction === "ru-lb" ? lb : ru;
  flashBody.innerHTML = `
    <div class="flash__word">${escapeHtml(front)}</div>
    <div class="flash__translation" id="flashTranslation">${escapeHtml(back)}</div>
  `;
  flashFlip.textContent = "Показать перевод";
}

flashFlip.addEventListener("click", () => {
  flashShowing = !flashShowing;
  const el = document.getElementById("flashTranslation");
  if (el) el.classList.toggle("flash__translation--visible", flashShowing);
  flashFlip.textContent = flashShowing ? "Скрыть" : "Показать перевод";
});

flashNext.addEventListener("click", () => {
  if (!flashDeck.length) return;
  flashIndex = (flashIndex + 1) % flashDeck.length;
  showFlashcard();
});

flashRemove.addEventListener("click", () => {
  if (!flashDeck.length) return;
  const ru = flashDeck[flashIndex];
  delete saved[ru];
  persistSaved();
  renderFlashcards();
  renderTranslation();
});

let debounceTimer = null;
inputEl.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderTranslation, 150);
});

clearBtn.addEventListener("click", () => { inputEl.value = ""; renderTranslation(); inputEl.focus(); });

copyBtn.addEventListener("click", async () => {
  const text = outputEl.innerText;
  if (!text || text === "Перевод") return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "✓ скопировано";
    setTimeout(() => (copyBtn.textContent = "⧉ копировать"), 1500);
  } catch(e) {}
});



const searchEl = document.getElementById("search");
const dictListEl = document.getElementById("dictList");
const countAllEl = document.getElementById("countAll");
const countSavedEl = document.getElementById("countSaved");
const filterChips = document.querySelectorAll(".chip[data-filter]");

let currentFilter = "all";

function setDictFilter(filter) {
  currentFilter = filter;
  filterChips.forEach(c => c.classList.toggle("chip--active", c.getAttribute("data-filter") === filter));
  renderDictList();
}

filterChips.forEach(chip => chip.addEventListener("click", () => setDictFilter(chip.getAttribute("data-filter"))));

function renderDictList() {
  const query = (searchEl.value || "").toLowerCase().trim();
  let entries = Object.entries(dict).filter(([ru, lb]) => ru.includes(query) || lb.toLowerCase().includes(query));
  if (currentFilter === "saved") entries = entries.filter(([ru]) => saved[ru]);
  entries.sort((a, b) => a[0].localeCompare(b[0], "ru"));

  countAllEl.textContent = Object.keys(dict).length;
  countSavedEl.textContent = Object.keys(saved).length;

  if (entries.length === 0) {
    dictListEl.innerHTML = `<div class="dict-empty">${
      currentFilter === "saved" ? "Нет сохранённых слов — кликай по словам в переводе" : "Ничего не найдено"
    }</div>`;
    return;
  }

  dictListEl.innerHTML = entries.map(([ru, lb]) => {
    const isSaved = !!saved[ru];
    return `<div class="dict-row">
      <span class="dict-row__pair">
        <span class="dict-row__ru">${escapeHtml(ru)}</span>
        <span class="dict-row__arrow">→</span>
        <span class="dict-row__lb">${escapeHtml(lb)}</span>
      </span>
      <span class="dict-row__actions">
        <button class="dict-row__star${isSaved ? " dict-row__star--active" : ""}" data-key="${escapeHtml(ru)}" title="Изучать">${isSaved ? "★" : "☆"}</button>
        <button class="dict-row__remove" data-key="${escapeHtml(ru)}" title="Удалить">✕</button>
      </span>
    </div>`;
  }).join("");

  dictListEl.querySelectorAll(".dict-row__remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      removeWord(key); delete saved[key];
      persistSaved();
      renderDictList(); renderTranslation(); renderFlashcards();
    });
  });

  dictListEl.querySelectorAll(".dict-row__star").forEach(btn => {
    btn.addEventListener("click", () => {
      toggleSaved(btn.getAttribute("data-key"));
      renderDictList(); renderTranslation(); renderFlashcards();
    });
  });
}



searchEl.addEventListener("input", renderDictList);

const dictUpdatedEl = document.getElementById("dictUpdated");

async function loadLastUpdated() {
  if (!dictUpdatedEl) return;
  const cacheKey = "lebato_last_updated_cache";
  const cacheTtl = 1000 * 60 * 30;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.fetchedAt < cacheTtl) {
      renderLastUpdated(cached.date);
      return;
    }
  } catch (e) {}

  try {
    const res = await fetch("https://api.github.com/repos/SkillichSE/Translate-lebato/commits?per_page=1");
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    const dateStr = data?.[0]?.commit?.committer?.date;
    if (!dateStr) throw new Error("no date");
    localStorage.setItem(cacheKey, JSON.stringify({ date: dateStr, fetchedAt: Date.now() }));
    renderLastUpdated(dateStr);
  } catch (e) {
    dictUpdatedEl.textContent = "";
  }
}

function renderLastUpdated(dateStr) {
  const date = new Date(dateStr);
  const formatted = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  dictUpdatedEl.textContent = `Обновлено: ${formatted}`;
}

loadLastUpdated();

const navTabs = document.querySelectorAll(".bottomnav__tab");
const views = {
  translate: document.getElementById("view-translate"),
  dict: document.getElementById("view-dict"),
};

function switchView(target) {
  navTabs.forEach(t => t.classList.toggle("bottomnav__tab--active", t.getAttribute("data-view") === target));
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("view--active", key === target));
  if (target === "dict") renderDictList();
}

navTabs.forEach(tab => tab.addEventListener("click", () => switchView(tab.getAttribute("data-view"))));

loadDict();
loadSaved();
loadHistory();
renderTranslation();
renderFlashcards();