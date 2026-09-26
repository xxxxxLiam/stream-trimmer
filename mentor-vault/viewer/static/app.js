const state = { topic: "", subtopic: "" };

function qs(id) { return document.getElementById(id); }

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function buildQuery() {
  const params = new URLSearchParams();
  const q = qs("search").value.trim();
  if (q) params.set("q", q);
  const speaker = qs("speaker").value;
  if (speaker) params.set("speaker", speaker);
  const industry = qs("industry").value;
  if (industry) params.set("industry", industry);
  const format = qs("format").value;
  if (format) params.set("format", format);
  if (state.topic) params.set("topic", state.topic);
  if (state.subtopic) params.set("subtopic", state.subtopic);
  return params.toString();
}

function formatLabel(fmt) {
  return fmt === "consult_qa" ? "Consult / Q&A" : "Solo teaching";
}

function renderLessons(lessons) {
  const container = qs("lessons");
  qs("lesson-count").textContent =
    lessons.length === 0 ? "" : `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`;

  if (lessons.length === 0) {
    container.innerHTML = `<div class="empty-state">No lessons match these filters yet.</div>`;
    return;
  }

  container.innerHTML = lessons.map(lessonCard).join("");
}

function lessonCard(l) {
  const tags = [
    `<span class="tag speaker">${escapeHtml(l.speaker)}</span>`,
    `<span class="tag">${escapeHtml(l.topic)}${l.subtopic ? " › " + escapeHtml(l.subtopic) : ""}</span>`,
    l.industry ? `<span class="tag industry">${escapeHtml(l.industry)}</span>` : "",
    `<span class="tag">${formatLabel(l.video_format)}</span>`,
  ].join("");

  const questioner = l.questioner_context
    ? `<div class="questioner-context">Asked about: ${escapeHtml(l.questioner_context)}</div>`
    : "";

  const transferability = l.transferability_note
    ? `<div class="transferability"><strong>Transfers because:</strong> ${escapeHtml(l.transferability_note)}</div>`
    : "";

  const sources = l.sources
    .map(
      (s) =>
        `<a class="source-link${s.is_short ? " short-badge" : ""}" href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.video_title)}</a>`
    )
    .join("");

  return `
    <div class="lesson-card">
      <div class="lesson-meta">${tags}</div>
      ${questioner}
      <div class="lesson-text">${escapeHtml(l.lesson_text)}</div>
      ${transferability}
      <div class="sources">${sources}</div>
    </div>
  `;
}

function escapeHtml(s) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadLessons() {
  const data = await fetchJSON("/api/lessons?" + buildQuery());
  renderLessons(data);
}

async function loadFilters() {
  const data = await fetchJSON("/api/filters");

  const speakerSelect = qs("speaker");
  data.speakers.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    speakerSelect.appendChild(opt);
  });

  const industrySelect = qs("industry");
  data.industries.forEach((i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    industrySelect.appendChild(opt);
  });

  renderTopicTree(data.topics);
}

function renderTopicTree(topics) {
  const container = qs("topic-tree");
  const entries = Object.entries(topics);
  if (entries.length === 0) {
    container.innerHTML = `<div style="color:var(--muted);font-size:12px;">No topics yet</div>`;
    return;
  }
  container.innerHTML = entries
    .map(([topic, subtopics]) => {
      const subHtml = subtopics
        .map(
          (sub) =>
            `<span class="subtopic-label" data-topic="${escapeHtml(topic)}" data-subtopic="${escapeHtml(sub)}">${escapeHtml(sub)}</span>`
        )
        .join("");
      return `
        <div class="topic-node">
          <span class="topic-label" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</span>
          <div class="subtopic-list">${subHtml}</div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".topic-label").forEach((el) => {
    el.addEventListener("click", () => {
      const topic = el.dataset.topic;
      const isActive = state.topic === topic && !state.subtopic;
      clearTopicSelection();
      if (!isActive) {
        state.topic = topic;
        el.classList.add("active");
      }
      loadLessons();
    });
  });
  container.querySelectorAll(".subtopic-label").forEach((el) => {
    el.addEventListener("click", () => {
      const topic = el.dataset.topic;
      const subtopic = el.dataset.subtopic;
      const isActive = state.topic === topic && state.subtopic === subtopic;
      clearTopicSelection();
      if (!isActive) {
        state.topic = topic;
        state.subtopic = subtopic;
        el.classList.add("active");
      }
      loadLessons();
    });
  });
}

function clearTopicSelection() {
  state.topic = "";
  state.subtopic = "";
  document.querySelectorAll(".topic-label.active, .subtopic-label.active").forEach((el) =>
    el.classList.remove("active")
  );
}

async function loadStats() {
  const stats = await fetchJSON("/api/stats");
  qs("stats").innerHTML = `
    ${stats.videos_total} videos ingested<br>
    ${stats.lessons_total} lessons extracted<br>
    ${stats.extraction_pending} videos awaiting extraction
  `;
  const btn = qs("needs-watching-btn");
  btn.textContent = `${stats.videos_needs_watching} need${stats.videos_needs_watching === 1 ? "s" : ""} watching`;
}

async function openNeedsWatchingModal() {
  const list = await fetchJSON("/api/needs-watching");
  const ul = qs("needs-watching-list");
  ul.innerHTML = list
    .map(
      (v) =>
        `<li><a href="${v.url}" target="_blank" rel="noopener" style="color:var(--accent)">${escapeHtml(v.title)}</a> — ${escapeHtml(v.transcript_status)}</li>`
    )
    .join("") || "<li>None right now.</li>";
  qs("needs-watching-modal").classList.remove("hidden");
}

function init() {
  qs("search").addEventListener("input", debounce(loadLessons, 250));
  qs("speaker").addEventListener("change", loadLessons);
  qs("industry").addEventListener("change", loadLessons);
  qs("format").addEventListener("change", loadLessons);
  qs("needs-watching-btn").addEventListener("click", openNeedsWatchingModal);
  qs("close-modal").addEventListener("click", () => qs("needs-watching-modal").classList.add("hidden"));

  loadStats();
  loadFilters();
  loadLessons();
}

init();
