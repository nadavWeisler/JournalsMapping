(() => {
  "use strict";

  const data = window.ATLAS_DATA;
  if (!data?.root) {
    console.error("ATLAS_DATA missing");
    return;
  }

  const state = {
    path: [data.root],
    venue: "journals",
    search: "",
    quartiles: new Set(["Q1", "Q2", "Q3", "Q4"]),
    formats: new Set(["conference", "symposium", "workshop"]),
    cadences: new Set(["annual", "biennial"]),
    ifMin: 0,
    predatory: "all",
    sort: "if-desc",
  };

  const els = {
    crumbs: document.getElementById("crumbs"),
    children: document.getElementById("children"),
    journals: document.getElementById("journals"),
    journalsTitle: document.getElementById("journals-title"),
    scopeStats: document.getElementById("scope-stats"),
    search: document.getElementById("search"),
    searchLabel: document.getElementById("search-label"),
    ifMin: document.getElementById("if-min"),
    ifLabel: document.getElementById("if-label"),
    sort: document.getElementById("sort"),
    quartileChart: document.getElementById("quartile-chart"),
    donutCenter: document.getElementById("donut-center"),
    ifBars: document.getElementById("if-bars"),
    mixCaption: document.getElementById("mix-caption"),
    distCaption: document.getElementById("dist-caption"),
    journalFilters: document.getElementById("journal-filters"),
    conferenceFilters: document.getElementById("conference-filters"),
    healthChart: document.getElementById("health-chart"),
    disclaimer: document.getElementById("disclaimer"),
    dataUpdated: document.getElementById("data-updated"),
    heroCanvas: document.getElementById("hero-canvas"),
    sourcesList: document.getElementById("sources-list"),
    fetchMethod: document.getElementById("fetch-method"),
    fieldsGrid: document.getElementById("fields-grid"),
    fieldsCount: document.getElementById("fields-count"),
    fieldFilter: document.getElementById("field-filter"),
    exploreTitle: document.getElementById("explore-title"),
    exploreLede: document.getElementById("explore-lede"),
    detailArticle: document.getElementById("detail-article"),
    detailBack: document.getElementById("detail-back"),
    screens: document.querySelectorAll("[data-screen]"),
    navLinks: document.querySelectorAll(".site-nav a[data-nav]"),
  };

  const journalByIssn = new Map();
  const conferenceByAcronym = new Map();

  if (els.disclaimer) els.disclaimer.textContent = data.disclaimer;
  if (els.dataUpdated) els.dataUpdated.textContent = data.updated;

  const sourceById = new Map((data.sources || []).map((s) => [s.id, s]));

  function renderSources() {
    if (!els.sourcesList) return;
    if (data.fetch && els.fetchMethod) {
      els.fetchMethod.textContent = `${data.fetch.method} Local file: ${data.fetch.localFile}.`;
    }
    els.sourcesList.replaceChildren();
    for (const source of data.sources || []) {
      const article = document.createElement("article");
      article.className = "source-card";
      const links = [`<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.provider)}</a>`];
      if (source.secondaryUrl) {
        links.push(
          `<a href="${escapeHtml(source.secondaryUrl)}" target="_blank" rel="noopener noreferrer">Secondary link</a>`
        );
      }
      article.innerHTML = `
        <p class="source-field">${escapeHtml(source.field)}</p>
        <h3>${escapeHtml(source.provider)}</h3>
        <p>${escapeHtml(source.howWeUse)}</p>
        <p class="source-access"><strong>Access:</strong> ${escapeHtml(source.access)}</p>
        <p class="source-links">${links.join(" · ")}</p>`;
      els.sourcesList.appendChild(article);
    }
  }

  function currentNode() {
    return state.path[state.path.length - 1];
  }

  function collectJournals(node, out = []) {
    if (Array.isArray(node.journals)) {
      for (const j of node.journals) {
        out.push({ ...j, domainPath: node._pathName || node.name });
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        collectJournals(child, out);
      }
    }
    return out;
  }

  function collectConferences(node, out = []) {
    if (Array.isArray(node.conferences)) {
      for (const conference of node.conferences) {
        out.push({ ...conference, domainPath: node._pathName || node.name });
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        collectConferences(child, out);
      }
    }
    return out;
  }

  function cadenceLabel(cadence) {
    switch (cadence) {
      case "annual":
        return "Annual";
      case "biennial":
        return "Biennial";
      default: {
        const _exhaustive = cadence;
        throw new Error(`Unexpected cadence: ${String(_exhaustive)}`);
      }
    }
  }

  function formatLabel(format) {
    switch (format) {
      case "conference":
        return "Conference";
      case "symposium":
        return "Symposium";
      case "workshop":
        return "Workshop";
      default: {
        const _exhaustive = format;
        throw new Error(`Unexpected format: ${String(_exhaustive)}`);
      }
    }
  }

  function annotatePaths(node, trail = [], nodeTrail = []) {
    node._pathName = [...trail, node.name].join(" › ");
    node._depth = trail.length;
    node._nodeTrail = [...nodeTrail, node];
    if (node.children) {
      for (const child of node.children) {
        annotatePaths(child, [...trail, node.name], [...nodeTrail, node]);
      }
    }
  }

  annotatePaths(data.root);
  indexRecords(data.root);

  function indexRecords(node) {
    const domainPath = node._pathName || node.name;
    for (const journal of node.journals || []) {
      journalByIssn.set(journal.issn, { ...journal, domainPath });
    }
    for (const conference of node.conferences || []) {
      conferenceByAcronym.set(conference.acronym, { ...conference, domainPath });
    }
    for (const child of node.children || []) indexRecords(child);
  }

  function listFieldNodes(node = data.root, out = []) {
    // Field tiles: nodes that contain journals or are mid-level research fields.
    const hasKids = Boolean(node.children?.length);
    const hasJournals = Boolean(node.journals?.length);
    const hasConferences = Boolean(node.conferences?.length);
    if (
      node.id !== "academia" &&
      (hasJournals || hasConferences || (hasKids && node._depth >= 2))
    ) {
      out.push(node);
    }
    for (const child of node.children || []) listFieldNodes(child, out);
    return out;
  }

  function renderFieldsCatalog(filterText = "") {
    if (!els.fieldsGrid) return;
    const q = filterText.trim().toLowerCase();
    const fields = listFieldNodes()
      .map((node) => {
        const stats = countSubtree(node);
        return { node, stats };
      })
      .filter(({ node, stats }) => {
        if (!stats.journals && !stats.conferences) return false;
        if (!q) return true;
        return (
          node.name.toLowerCase().includes(q) ||
          (node._pathName || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.node.name.localeCompare(b.node.name));

    els.fieldsCount.textContent = `${fields.length} fields · ${
      collectJournals(data.root).length
    } journals · ${collectConferences(data.root).length} conferences in atlas`;
    els.fieldsGrid.replaceChildren();
    fields.forEach(({ node, stats }, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "field-tile";
      btn.style.animationDelay = `${Math.min(i, 20) * 0.015}s`;
      const metaBits = [];
      if (stats.journals) {
        metaBits.push(
          `${stats.journals} journals${stats.predatory ? ` (${stats.predatory} predatory)` : ""}`
        );
      }
      if (stats.conferences) metaBits.push(`${stats.conferences} conferences`);
      btn.innerHTML = `<span class="fname">${escapeHtml(node.name)}</span>
        <span class="fpath">${escapeHtml(node._pathName || node.name)}</span>
        <span class="fmeta">${metaBits.join(" · ")}</span>`;
      btn.addEventListener("click", () => {
        state.path = node._nodeTrail?.length ? [...node._nodeTrail] : [data.root, node];
        go("#/journals");
      });
      els.fieldsGrid.appendChild(btn);
    });
  }

  function syncFiltersFromDom() {
    state.search = els.search.value.trim();
    state.ifMin = Number(els.ifMin.value) || 0;
    els.ifLabel.textContent = String(state.ifMin);
    state.sort = els.sort.value;
    state.quartiles = checkedValues("#quartile-filters input:checked");
    state.formats = checkedValues("#format-filters input:checked");
    state.cadences = checkedValues("#cadence-filters input:checked");
    const pred = document.querySelector('#pred-filters input[name="pred"]:checked');
    state.predatory = pred ? pred.value : "all";
  }

  function matchesFilters(journal) {
    if (!state.quartiles.has(journal.quartile)) return false;
    if (journal.if < state.ifMin) return false;
    if (state.predatory === "safe" && journal.predatory) return false;
    if (state.predatory === "only" && !journal.predatory) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = [
        journal.name,
        journal.issn,
        journal.publisher,
        journal.focus,
        journal.domainPath,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function sortJournals(list) {
    const copy = [...list];
    switch (state.sort) {
      case "if-asc":
        return copy.sort((a, b) => a.if - b.if || a.name.localeCompare(b.name));
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case "quartile":
        return copy.sort(
          (a, b) =>
            a.quartile.localeCompare(b.quartile) || b.if - a.if || a.name.localeCompare(b.name)
        );
      case "if-desc":
        return copy.sort((a, b) => b.if - a.if || a.name.localeCompare(b.name));
      default: {
        const _exhaustive = state.sort;
        return copy;
      }
    }
  }

  function countSubtree(node) {
    const journals = collectJournals(node);
    return {
      journals: journals.length,
      conferences: collectConferences(node).length,
      predatory: journals.filter((j) => j.predatory).length,
      meanIf:
        journals.length === 0
          ? 0
          : journals.reduce((s, j) => s + j.if, 0) / journals.length,
      children: node.children?.length || 0,
    };
  }

  function renderCrumbs() {
    els.crumbs.replaceChildren();
    state.path.forEach((node, index) => {
      if (index > 0) {
        const sep = document.createElement("span");
        sep.className = "sep";
        sep.textContent = "/";
        sep.setAttribute("aria-hidden", "true");
        els.crumbs.appendChild(sep);
      }
      if (index === state.path.length - 1) {
        const cur = document.createElement("span");
        cur.className = "current";
        cur.textContent = node.name;
        els.crumbs.appendChild(cur);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = node.name;
        btn.addEventListener("click", () => {
          state.path = state.path.slice(0, index + 1);
          render();
        });
        els.crumbs.appendChild(btn);
      }
    });
  }

  function renderChildren() {
    const node = currentNode();
    els.children.replaceChildren();
    if (!node.children?.length) {
      const note = document.createElement("p");
      note.className = "empty";
      note.style.margin = "0";
      note.style.padding = "0.85rem 1rem";
      note.textContent = "Leaf domain — browse the list below.";
      els.children.appendChild(note);
      return;
    }

    node.children.forEach((child, i) => {
      const stats = countSubtree(child);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "domain-chip";
      btn.style.animationDelay = `${i * 0.04}s`;
      let meta = `${stats.journals} journals`;
      if (stats.conferences) meta += ` · ${stats.conferences} conferences`;
      meta += ` · ${stats.children} sub-domains`;
      if (stats.predatory) meta += ` · ${stats.predatory} risk`;
      btn.innerHTML = `<span class="name">${escapeHtml(child.name)}</span>
        <span class="meta">${meta}</span>`;
      btn.addEventListener("click", () => {
        state.path = [...state.path, child];
        render();
      });
      els.children.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function maxIfInData() {
    return Math.max(...collectJournals(data.root).map((j) => j.if), 1);
  }

  const globalMaxIf = maxIfInData();

  function checkedValues(selector) {
    return new Set(
      [...document.querySelectorAll(selector)].map((el) => el.value)
    );
  }

  function applyVenueChrome() {
    const conferences = state.venue === "conferences";
    if (els.journalFilters) els.journalFilters.hidden = conferences;
    if (els.conferenceFilters) els.conferenceFilters.hidden = !conferences;
    if (els.searchLabel) {
      els.searchLabel.textContent = conferences ? "Search conferences" : "Search journals";
    }
    if (els.search) {
      els.search.placeholder = conferences
        ? "Name, acronym, organizer…"
        : "Name, ISSN, publisher…";
    }
    if (els.mixCaption) {
      els.mixCaption.textContent = conferences ? "Cadence mix in scope" : "Quartile mix in scope";
    }
    if (els.distCaption) {
      els.distCaption.textContent = conferences ? "Format mix in scope" : "Impact factor distribution";
    }
    if (els.ifBars) {
      els.ifBars.setAttribute(
        "aria-label",
        conferences ? "Conference format mix" : "Impact factor histogram"
      );
      els.ifBars.classList.toggle("is-format", conferences);
    }
    if (els.exploreTitle) {
      els.exploreTitle.textContent = conferences ? "Conferences" : "Journals";
    }
    if (els.exploreLede) {
      els.exploreLede.textContent = conferences
        ? "Catalog of conference series in this domain. Filter by format and cadence, then open a series for its record. Labels are illustrative — not ranks."
        : "Catalog of journals in this domain. Filter by quartile, impact, or predatory status, then open a title for its record. Figures are illustrative.";
    }

    const options = conferences
      ? [
          ["name", "Name"],
          ["acronym", "Acronym"],
          ["format", "Format"],
        ]
      : [
          ["if-desc", "Impact ↓"],
          ["if-asc", "Impact ↑"],
          ["name", "Name"],
          ["quartile", "Quartile"],
        ];
    const allowed = new Set(options.map(([value]) => value));
    if (!allowed.has(state.sort)) state.sort = options[0][0];
    els.sort.replaceChildren();
    for (const [value, label] of options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      if (value === state.sort) opt.selected = true;
      els.sort.appendChild(opt);
    }
  }

  function matchesConferenceFilters(conference) {
    if (!state.formats.has(conference.format)) return false;
    if (!state.cadences.has(conference.cadence)) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = [
        conference.name,
        conference.acronym,
        conference.organizer,
        conference.focus,
        conference.domainPath,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function sortConferences(list) {
    const copy = [...list];
    switch (state.sort) {
      case "acronym":
        return copy.sort(
          (a, b) => a.acronym.localeCompare(b.acronym) || a.name.localeCompare(b.name)
        );
      case "format":
        return copy.sort(
          (a, b) => a.format.localeCompare(b.format) || a.name.localeCompare(b.name)
        );
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      default: {
        const _exhaustive = state.sort;
        throw new Error(`Unexpected conference sort: ${String(_exhaustive)}`);
      }
    }
  }

  function sourceChips(ids) {
    return (ids || [])
      .map((id) => sourceById.get(id))
      .filter(Boolean)
      .map(
        (s) =>
          `<a class="source-chip" href="#/sources" title="${escapeHtml(s.provider)}">${escapeHtml(
            s.field
          )}</a>`
      )
      .join("");
  }

  function renderJournals() {
    syncFiltersFromDom();
    const node = currentNode();
    const all = collectJournals(node);
    const filtered = sortJournals(all.filter(matchesFilters));
    const conferencesHere = collectConferences(node).length;

    els.journalsTitle.textContent =
      state.path.length <= 1
        ? "Journals across academia"
        : `Journals in ${node.name}`;

    const preds = all.filter((j) => j.predatory).length;
    els.scopeStats.innerHTML = `<strong>${filtered.length}</strong>
      shown of ${all.length} in scope
      <div style="margin-top:0.45rem">${preds} predatory flagged · mean IF ${
      all.length ? (all.reduce((s, j) => s + j.if, 0) / all.length).toFixed(1) : "—"
    }</div>${
      conferencesHere
        ? `<div style="margin-top:0.35rem"><a href="#/conferences">${conferencesHere} conferences in this domain</a></div>`
        : ""
    }`;

    drawQuartileDonut(filtered);
    drawIfBars(filtered);

    els.journals.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No journals match these filters. Widen quartile or IF range.";
      els.journals.appendChild(empty);
      return;
    }

    filtered.forEach((journal, index) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.className = `journal journal-link${journal.predatory ? " is-predatory" : ""}`;
      link.href = `#/journal/${encodeURIComponent(journal.issn)}`;
      link.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;
      link.innerHTML = `
        <div>
          <div class="journal-top">
            <h4>${escapeHtml(journal.name)}</h4>
            <span class="badge badge-${journal.quartile.toLowerCase()}">${journal.quartile}</span>
            ${journal.predatory ? '<span class="badge badge-pred">Predatory</span>' : ""}
            ${journal.openAccess ? '<span class="badge badge-oa">Open access</span>' : ""}
          </div>
          <p class="journal-meta">${escapeHtml(journal.domainPath || node.name)}</p>
        </div>
        <div class="journal-if">
          <div>
            <div class="value">${journal.if.toFixed(1)}</div>
            <div class="label">Impact factor</div>
          </div>
        </div>`;
      li.appendChild(link);
      els.journals.appendChild(li);
    });
  }

  function renderConferences() {
    syncFiltersFromDom();
    const node = currentNode();
    const all = collectConferences(node);
    const filtered = sortConferences(all.filter(matchesConferenceFilters));
    const journalsHere = collectJournals(node).length;

    els.journalsTitle.textContent =
      state.path.length <= 1
        ? "Conferences across academia"
        : `Conferences in ${node.name}`;

    els.scopeStats.innerHTML = `<strong>${filtered.length}</strong>
      shown of ${all.length} in scope
      <div style="margin-top:0.45rem">Illustrative series only — no CORE, JCR, or Scopus rank stored.</div>${
        journalsHere
          ? `<div style="margin-top:0.35rem"><a href="#/journals">${journalsHere} journals in this domain</a></div>`
          : ""
      }`;

    const cadenceCounts = { annual: 0, biennial: 0 };
    for (const conference of filtered) {
      cadenceCounts[conference.cadence] = (cadenceCounts[conference.cadence] || 0) + 1;
    }
    paintDonut(
      cadenceCounts,
      { annual: "#0f766e", biennial: "#0369a1" },
      `${filtered.length}<small>conferences<br>not ranked</small>`
    );
    drawLabeledBars([
      { label: "Conference", count: filtered.filter((c) => c.format === "conference").length },
      { label: "Symposium", count: filtered.filter((c) => c.format === "symposium").length },
      { label: "Workshop", count: filtered.filter((c) => c.format === "workshop").length },
    ]);

    els.journals.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No conferences match these filters. Widen format or cadence.";
      els.journals.appendChild(empty);
      return;
    }

    filtered.forEach((conference, index) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.className = "journal journal-link is-conference";
      link.href = `#/conference/${encodeURIComponent(conference.acronym)}`;
      link.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;
      link.innerHTML = `
        <div>
          <div class="journal-top">
            <h4>${escapeHtml(conference.name)}</h4>
            <span class="badge badge-oa">${escapeHtml(conference.acronym)}</span>
            <span class="badge badge-note">Illustrative</span>
          </div>
          <p class="journal-meta">${escapeHtml(conference.domainPath || node.name)}</p>
        </div>
        <div class="journal-if">
          <div>
            <div class="value value-text">${escapeHtml(cadenceLabel(conference.cadence))}</div>
            <div class="label">${escapeHtml(formatLabel(conference.format))}</div>
            <div class="label">Not a rank</div>
          </div>
        </div>`;
      li.appendChild(link);
      els.journals.appendChild(li);
    });
  }

  function renderList() {
    switch (state.venue) {
      case "journals":
        renderJournals();
        return;
      case "conferences":
        renderConferences();
        return;
      default: {
        const _exhaustive = state.venue;
        throw new Error(`Unexpected venue: ${String(_exhaustive)}`);
      }
    }
  }

  function journalSourceIds(journal) {
    if (journal.metricSourceIds?.length) return journal.metricSourceIds;
    if (journal.predatory) return ["predatory", "jcr", "jcr-quartile"];
    return ["jcr", "jcr-quartile"];
  }

  function renderMissingDetail(message) {
    document.title = "Not in snapshot — ATLAS";
    els.detailArticle.innerHTML = `<h2 id="detail-heading">Not in this snapshot</h2><p class="empty">${message}</p>`;
  }

  function renderJournalDetail(journal) {
    const pct = Math.min(100, (journal.if / globalMaxIf) * 100);
    document.title = `${journal.name} — ATLAS`;
    if (els.detailBack) {
      els.detailBack.href = "#/journals";
      els.detailBack.textContent = "Back to journals";
    }
    els.detailArticle.innerHTML = `
      <article class="journal detail-card${journal.predatory ? " is-predatory" : ""}">
        <div>
          <div class="journal-top">
            <h2 id="detail-heading">${escapeHtml(journal.name)}</h2>
            <span class="badge badge-${journal.quartile.toLowerCase()}">${journal.quartile}</span>
            ${journal.predatory ? '<span class="badge badge-pred">Predatory</span>' : ""}
            ${journal.openAccess ? '<span class="badge badge-oa">Open access</span>' : ""}
          </div>
          <p class="journal-meta">${escapeHtml(journal.publisher)} · ISSN ${escapeHtml(
            journal.issn
          )} · ${escapeHtml(journal.domainPath || "")}</p>
          <p class="journal-focus">${escapeHtml(journal.focus || "")}</p>
          <p class="detail-note">Illustrative impact factor and quartile — not a live Clarivate or Scopus pull.</p>
          <p class="journal-sources"><span>Metrics basis:</span> ${sourceChips(
            journalSourceIds(journal)
          )}</p>
        </div>
        <div class="journal-if">
          <div>
            <div class="value">${journal.if.toFixed(1)}</div>
            <div class="label">Impact factor</div>
          </div>
          <div class="meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
        </div>
      </article>`;
  }

  function renderConferenceDetail(conference) {
    document.title = `${conference.name} — ATLAS`;
    if (els.detailBack) {
      els.detailBack.href = "#/conferences";
      els.detailBack.textContent = "Back to conferences";
    }
    els.detailArticle.innerHTML = `
      <article class="journal detail-card is-conference">
        <div>
          <div class="journal-top">
            <h2 id="detail-heading">${escapeHtml(conference.name)}</h2>
            <span class="badge badge-oa">${escapeHtml(conference.acronym)}</span>
            <span class="badge badge-note">Illustrative</span>
          </div>
          <p class="journal-meta">${escapeHtml(conference.organizer)} · ${escapeHtml(
            cadenceLabel(conference.cadence)
          )} ${escapeHtml(formatLabel(conference.format).toLowerCase())} · ${escapeHtml(
            conference.domainPath || ""
          )}</p>
          <p class="journal-focus">${escapeHtml(conference.focus || "")}</p>
          <p class="detail-note">Illustrative series. No CORE, JCR, or Scopus rank is stored.</p>
          <p class="journal-sources"><span>Provenance:</span> ${sourceChips(
            conference.metricSourceIds
          )}</p>
        </div>
        <div class="journal-if">
          <div>
            <div class="value value-text">${escapeHtml(cadenceLabel(conference.cadence))}</div>
            <div class="label">${escapeHtml(formatLabel(conference.format))}</div>
            <div class="label">Not a rank</div>
          </div>
        </div>
      </article>`;
  }

  function renderDetail(route) {
    if (!els.detailArticle) return;
    switch (route.kind) {
      case "journal": {
        const journal = journalByIssn.get(route.id);
        if (!journal) {
          if (els.detailBack) {
            els.detailBack.href = "#/journals";
            els.detailBack.textContent = "Back to journals";
          }
          renderMissingDetail(
            `No journal with ISSN ${escapeHtml(route.id)} is in this snapshot.`
          );
          return;
        }
        renderJournalDetail(journal);
        return;
      }
      case "conference": {
        const conference = conferenceByAcronym.get(route.id);
        if (!conference) {
          if (els.detailBack) {
            els.detailBack.href = "#/conferences";
            els.detailBack.textContent = "Back to conferences";
          }
          renderMissingDetail(
            `No conference series with acronym ${escapeHtml(route.id)} is in this snapshot.`
          );
          return;
        }
        renderConferenceDetail(conference);
        return;
      }
      default: {
        const _exhaustive = route.kind;
        throw new Error(`Unexpected detail kind: ${String(_exhaustive)}`);
      }
    }
  }

  function paintDonut(counts, colors, centerHtml) {
    const canvas = els.quartileChart;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const keys = Object.keys(counts);
    const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0) || 1;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 86;
    const inner = 52;
    let start = -Math.PI / 2;
    let drawn = 0;

    for (const key of keys) {
      const value = counts[key];
      if (!value) continue;
      const angle = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[key] || "#0f766e";
      ctx.fill();
      start += angle;
      drawn += value;
    }

    if (!drawn) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#d7e4ea";
      ctx.fill();
    }

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    els.donutCenter.innerHTML = centerHtml;
  }

  function drawQuartileDonut(journals) {
    const counts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    for (const j of journals) counts[j.quartile] = (counts[j.quartile] || 0) + 1;
    const total = journals.length || 1;
    const q1pct = Math.round((counts.Q1 / total) * 100) || 0;
    paintDonut(
      counts,
      { Q1: "#0f766e", Q2: "#0369a1", Q3: "#a16207", Q4: "#c2410c" },
      `${journals.length}<small>journals<br>${q1pct}% Q1</small>`
    );
  }

  function drawLabeledBars(rows) {
    const max = Math.max(...rows.map((row) => row.count), 1);
    els.ifBars.replaceChildren();
    for (const row of rows) {
      const height = Math.max(4, (row.count / max) * 130);
      const col = document.createElement("div");
      col.className = "bar";
      col.innerHTML = `<i style="height:${height}px"></i><span>${escapeHtml(row.label)}<br>${
        row.count
      }</span>`;
      els.ifBars.appendChild(col);
    }
  }

  function drawIfBars(journals) {
    const bins = [
      { label: "0–2", min: 0, max: 2 },
      { label: "2–5", min: 2, max: 5 },
      { label: "5–10", min: 5, max: 10 },
      { label: "10–20", min: 10, max: 20 },
      { label: "20–40", min: 20, max: 40 },
      { label: "40+", min: 40, max: Infinity },
    ];
    drawLabeledBars(
      bins.map((bin) => ({
        label: bin.label,
        count: journals.filter((j) => j.if >= bin.min && j.if < bin.max).length,
      }))
    );
  }

  function renderHealth() {
    // Rank field-level domains (one level under major divisions) for a clearer map.
    const top = [];
    for (const major of data.root.children || []) {
      for (const field of major.children || []) top.push(field);
      if (!major.children?.length) top.push(major);
    }
    const rows = top.map((node) => {
      const journals = collectJournals(node);
      const mean =
        journals.length === 0
          ? 0
          : journals.reduce((s, j) => s + j.if, 0) / journals.length;
      const predatory = journals.filter((j) => j.predatory).length;
      return {
        name: node.name,
        mean,
        predatory,
        count: journals.length,
        conferences: collectConferences(node).length,
      };
    });
    rows.sort((a, b) => b.mean - a.mean);
    const maxMean = Math.max(...rows.map((r) => r.mean), 1);

    els.healthChart.replaceChildren();
    rows.forEach((row, i) => {
      const el = document.createElement("div");
      el.className = "health-row";
      el.style.animationDelay = `${i * 0.06}s`;
      const width = row.count ? (row.mean / maxMean) * 100 : 0;
      const journalNums = row.count
        ? `IF̄ ${row.mean.toFixed(1)} · ${row.count} titles`
        : "No journals in this slice";
      const confNums = row.conferences
        ? `${row.conferences} conferences (not ranked)`
        : "";
      el.innerHTML = `
        <div class="label">${escapeHtml(row.name)}</div>
        <div class="health-track"><i style="width:${width}%"></i></div>
        <div class="nums">${journalNums}${
          row.predatory ? `<span class="warn"> · ${row.predatory} predatory</span>` : ""
        }${confNums ? ` · ${confNums}` : ""}
        </div>`;
      els.healthChart.appendChild(el);
    });
  }

  function render() {
    renderCrumbs();
    renderChildren();
    renderList();
  }

  function bindFilters() {
    els.search.addEventListener("input", () => {
      state.search = els.search.value.trim();
      renderList();
    });

    els.ifMin.addEventListener("input", () => {
      state.ifMin = Number(els.ifMin.value);
      els.ifLabel.textContent = String(state.ifMin);
      renderList();
    });
    els.ifMin.addEventListener("change", () => {
      state.ifMin = Number(els.ifMin.value);
      els.ifLabel.textContent = String(state.ifMin);
      renderList();
    });

    els.sort.addEventListener("change", () => {
      state.sort = els.sort.value;
      renderList();
    });

    document.querySelectorAll("#quartile-filters input").forEach((input) => {
      input.addEventListener("change", () => {
        state.quartiles = new Set(
          [...document.querySelectorAll("#quartile-filters input:checked")].map(
            (el) => el.value
          )
        );
        renderList();
      });
    });

    document.querySelectorAll('#pred-filters input[name="pred"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.predatory = input.value;
          renderList();
        }
      });
    });

    document.querySelectorAll("#format-filters input, #cadence-filters input").forEach((input) => {
      input.addEventListener("change", () => {
        state.formats = checkedValues("#format-filters input:checked");
        state.cadences = checkedValues("#cadence-filters input:checked");
        renderList();
      });
    });
  }

  function initHeroCanvas() {
    const canvas = els.heroCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;

    const nodes = [];
    function rebuildNodes(w, h) {
      nodes.length = 0;
      const count = Math.min(48, Math.floor((w * h) / 18000));
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 2 + Math.random() * 4,
          vx: -0.15 + Math.random() * 0.3,
          vy: -0.1 + Math.random() * 0.2,
          ring: Math.random() > 0.7,
          hue: 160 + Math.random() * 40,
        });
      }
    }

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildNodes(rect.width, rect.height);
    }

    function frame() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      t += 0.004;
      ctx.clearRect(0, 0, w, h);

      const grd = ctx.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, "#0c2433");
      grd.addColorStop(0.45, "#0f3d45");
      grd.addColorStop(1, "#085f6b");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      // nested domain rings
      for (let i = 0; i < 5; i++) {
        const cx = w * 0.62 + Math.sin(t + i) * 18;
        const cy = h * 0.42 + Math.cos(t * 0.8 + i) * 12;
        ctx.beginPath();
        ctx.arc(cx, cy, 40 + i * 55 + Math.sin(t * 2 + i) * 6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(103, 232, 249, ${0.08 + i * 0.03})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // treemap-ish blocks
      const cols = 8;
      const rows = 5;
      const pad = 8;
      const gw = w * 0.55;
      const gh = h * 0.55;
      const ox = w * 0.38;
      const oy = h * 0.22;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + c * 0.4 + r * 0.7));
          const x = ox + (c * gw) / cols + pad;
          const y = oy + (r * gh) / rows + pad;
          const bw = gw / cols - pad * 2;
          const bh = gh / rows - pad * 2;
          ctx.fillStyle = `rgba(15, 118, 110, ${0.08 + pulse * 0.18})`;
          ctx.fillRect(x, y, bw, bh);
          if ((c + r) % 5 === 0) {
            ctx.strokeStyle = `rgba(8, 145, 178, ${0.25 + pulse * 0.35})`;
            ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
          }
        }
      }

      for (const n of nodes) {
        if (!reduced) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${n.hue}, 70%, 65%, 0.55)`;
        ctx.fill();
        if (n.ring) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6 + Math.sin(t * 4 + n.x) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${n.hue}, 70%, 70%, 0.25)`;
          ctx.stroke();
        }
      }

      // connection lines among nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(167, 243, 208, ${0.18 * (1 - dist / 120)})`;
            ctx.stroke();
          }
        }
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    }

    resize();
    frame();
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      resize();
      frame();
    });
  }

  function parseHash() {
    let raw = location.hash || "#/";
    if (raw.startsWith("#")) raw = raw.slice(1);
    try {
      raw = decodeURIComponent(raw);
    } catch {
      raw = location.hash.replace(/^#/, "");
    }
    const parts = raw.split("/").filter((part) => part.length > 0);
    const head = parts[0] || "";
    switch (head) {
      case "":
        return { view: "home" };
      case "journals":
        return { view: "journals" };
      case "conferences":
        return { view: "conferences" };
      case "journal":
        return { view: "detail", kind: "journal", id: parts.slice(1).join("/") };
      case "conference":
        return { view: "detail", kind: "conference", id: parts.slice(1).join("/") };
      case "fields":
        return { view: "fields" };
      case "legend":
        return { view: "legend" };
      case "health":
        return { view: "health" };
      case "sources":
        return { view: "sources" };
      default:
        return { view: "home" };
    }
  }

  function showScreen(name) {
    els.screens.forEach((section) => {
      section.hidden = section.dataset.screen !== name;
    });
    if (name === "home") {
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }
  }

  function showCatalog(venue) {
    state.venue = venue;
    showScreen("catalog");
    applyVenueChrome();
    render();
    document.title = venue === "conferences" ? "Conferences — ATLAS" : "Journals — ATLAS";
  }

  function navKeyFor(route) {
    switch (route.view) {
      case "home":
        return "home";
      case "journals":
        return "journals";
      case "conferences":
        return "conferences";
      case "fields":
        return "fields";
      case "legend":
        return "legend";
      case "health":
        return "health";
      case "sources":
        return "sources";
      case "detail":
        switch (route.kind) {
          case "journal":
            return "journals";
          case "conference":
            return "conferences";
          default: {
            const _exhaustiveKind = route.kind;
            throw new Error(`Unexpected detail kind: ${String(_exhaustiveKind)}`);
          }
        }
      default: {
        const _exhaustive = route.view;
        throw new Error(`Unexpected view: ${String(_exhaustive)}`);
      }
    }
  }

  function renderRoute() {
    const route = parseHash();
    switch (route.view) {
      case "home":
        showScreen("home");
        document.title = "ATLAS — Journals and conferences";
        break;
      case "journals":
        showCatalog("journals");
        break;
      case "conferences":
        showCatalog("conferences");
        break;
      case "detail":
        showScreen("detail");
        renderDetail(route);
        break;
      case "fields":
        showScreen("fields");
        document.title = "Fields — ATLAS";
        break;
      case "legend":
        showScreen("legend");
        document.title = "Legend — ATLAS";
        break;
      case "health":
        showScreen("health");
        document.title = "Domain health — ATLAS";
        break;
      case "sources":
        showScreen("sources");
        document.title = "Sources — ATLAS";
        break;
      default: {
        const _exhaustive = route.view;
        throw new Error(`Unexpected view: ${String(_exhaustive)}`);
      }
    }
    const key = navKeyFor(route);
    els.navLinks.forEach((link) => {
      if (link.dataset.nav === key) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function go(hash) {
    if (location.hash === hash) {
      renderRoute();
      window.scrollTo(0, 0);
      return;
    }
    location.hash = hash;
  }

  bindFilters();
  if (els.fieldFilter) {
    els.fieldFilter.addEventListener("input", () => {
      renderFieldsCatalog(els.fieldFilter.value);
    });
  }
  renderSources();
  renderFieldsCatalog();
  renderHealth();
  window.addEventListener("hashchange", () => {
    renderRoute();
    window.scrollTo(0, 0);
  });
  renderRoute();
  initHeroCanvas();
})();
