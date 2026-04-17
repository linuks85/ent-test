/* ═══════════════════════════════════════════
   ENT Test App — Main Application Logic
   ═══════════════════════════════════════════ */

(function () {
    "use strict";

    // ─── State ───
    let lang = "ru";
    let theme = "dark";
    let phase = "start"; // start | test | confirm | timeup | results
    let studentName = "";
    let selectedSubject = "";
    let selectedVariant = "";
    let dataIndex = {};
    let questions = [];
    let shuffleMap = [];
    let currentQ = 0;
    let answers = {};
    let timeLeft = 3600;
    let timerInterval = null;

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    const t = () => I18N[lang];

    // ─── Helpers ───
    function shuffleArray(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function formatTime(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // Parse markdown table to HTML table
    function mdTableToHtml(md) {
        const lines = md.trim().split("\n").filter((l) => l.trim());
        if (lines.length < 2) return `<pre>${escapeHtml(md)}</pre>`;
        const parseRow = (line) =>
            line.split("|").map((c) => c.trim()).filter((c) => c);
        const headers = parseRow(lines[0]);
        // Skip separator line (line with dashes)
        const dataStart = lines[1].includes("---") ? 2 : 1;
        let html = "<table><thead><tr>";
        headers.forEach((h) => (html += `<th>${escapeHtml(h)}</th>`));
        html += "</tr></thead><tbody>";
        for (let i = dataStart; i < lines.length; i++) {
            const cells = parseRow(lines[i]);
            if (cells.length === 0) continue;
            html += "<tr>";
            cells.forEach((c) => (html += `<td>${escapeHtml(c)}</td>`));
            html += "</tr>";
        }
        html += "</tbody></table>";
        return html;
    }

    // Render extra_content block
    function renderExtraContent(ec) {
        if (!ec || ec === "null" || typeof ec !== "object") return "";
        const content = ec.content || "";
        if (!content) return "";
        let inner = "";
        if (ec.type === "code") {
            const langLabel = ec.language
                ? `<span class="code-lang">${escapeHtml(ec.language)}</span>`
                : "";
            // Preserve newlines in code blocks
            const codeHtml = escapeHtml(content).replace(/\n/g, "\n");
            inner = `${langLabel}<pre>${codeHtml}</pre>`;
        } else if (ec.type === "table") {
            inner = mdTableToHtml(content);
        } else if (ec.type === "image") {
            inner = `<img src="${escapeHtml(content)}" alt="illustration">`;
        } else {
            inner = `<pre>${escapeHtml(content)}</pre>`;
        }
        return `<div class="extra-content">${inner}</div>`;
    }

    // ─── Scoring ───
    function calcScore(q, qIndex, userAnswer) {
        const qNum = qIndex + 1;
        if (qNum <= 30) {
            if (userAnswer === null || userAnswer === undefined)
                return { earned: 0, max: 1 };
            return { earned: userAnswer === q.correct ? 1 : 0, max: 1 };
        }
        if (qNum <= 35) {
            if (!userAnswer || typeof userAnswer !== "object")
                return { earned: 0, max: 2 };
            const correctPairs = q.correct;
            let correctCount = 0;
            correctPairs.forEach(([li, ri]) => {
                if (userAnswer[li] === ri) correctCount++;
            });
            return { earned: correctCount, max: 2 };
        }
        // multiple
        if (!userAnswer || !Array.isArray(userAnswer) || userAnswer.length === 0)
            return { earned: 0, max: 2 };
        const correctSet = new Set(q.correct);
        let errors = 0;
        userAnswer.forEach((idx) => {
            if (!correctSet.has(idx)) errors++;
        });
        q.correct.forEach((idx) => {
            if (!userAnswer.includes(idx)) errors++;
        });
        return { earned: Math.max(0, 2 - errors), max: 2 };
    }

    // ─── Data Loading ───
    async function loadIndex() {
        try {
            const resp = await fetch("data/index.json");
            dataIndex = await resp.json();
        } catch (e) {
            console.error("Failed to load index.json", e);
            dataIndex = {};
        }
    }

    async function loadVariant(langCode, folder, variantFile) {
        try {
            const resp = await fetch(
                `data/${langCode}/${folder}/${variantFile}.json`
            );
            return await resp.json();
        } catch (e) {
            console.error("Failed to load variant", e);
            return [];
        }
    }

    // ─── Theme ───
    function setTheme(t) {
        theme = t;
        document.documentElement.setAttribute("data-theme", t);
    }

    // ─── Populate Selects ───
    function populateSubjects() {
        const sel = $("#subject-select");
        sel.innerHTML = '<option value="">—</option>';
        const langData = dataIndex[lang] || {};
        Object.keys(langData).forEach((subj) => {
            sel.innerHTML += `<option value="${escapeHtml(subj)}">${escapeHtml(subj)}</option>`;
        });
        selectedSubject = "";
        selectedVariant = "";
        populateVariants();
    }

    function populateVariants() {
        const sel = $("#variant-select");
        sel.innerHTML = '<option value="">—</option>';
        sel.disabled = !selectedSubject;
        if (!selectedSubject) return;
        const langData = dataIndex[lang] || {};
        const subjData = langData[selectedSubject];
        if (!subjData) return;
        subjData.variants.forEach((v, i) => {
            const label = `${t().variantLabel || "Вариант"} ${i + 1}`;
            sel.innerHTML += `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`;
        });
    }

    // ─── Check if answer exists for question ───
    function hasAnswer(qi) {
        const q = questions[qi];
        const a = answers[qi];
        if (!q) return false;
        if (q.type === "single" || q.type === "context")
            return a !== undefined && a !== null;
        if (q.type === "matching")
            return (
                a &&
                typeof a === "object" &&
                Object.values(a).some((v) => v !== -1 && v !== undefined)
            );
        if (q.type === "multiple") return a && Array.isArray(a) && a.length > 0;
        return false;
    }

    function countAnswered() {
        let c = 0;
        questions.forEach((_, i) => {
            if (hasAnswer(i)) c++;
        });
        return c;
    }

    // ─── Shuffle mapping ───
    function toOriginalIndex(qIdx, shuffledIdx) {
        const sm = shuffleMap[qIdx];
        if (!sm) return shuffledIdx;
        return sm.shuffledIndices[shuffledIdx];
    }

    function toShuffledIndex(qIdx, origIdx) {
        const sm = shuffleMap[qIdx];
        if (!sm) return origIdx;
        return sm.shuffledIndices.indexOf(origIdx);
    }

    function getDisplayOptions(qIdx) {
        const q = questions[qIdx];
        const sm = shuffleMap[qIdx];
        if (!q || !sm) return [];
        if (sm.type === "options")
            return sm.shuffledIndices.map((i) => q.options[i]);
        if (sm.type === "right_column")
            return sm.shuffledIndices.map((i) => q.right_column[i]);
        return [];
    }

    // ─── Start Test ───
    async function startTest() {
        const name = $("#student-input").value.trim();
        if (!name || !selectedSubject || !selectedVariant) return;
        studentName = name;

        const langData = dataIndex[lang] || {};
        const subjData = langData[selectedSubject];
        if (!subjData) return;

        const raw = await loadVariant(lang, subjData.folder, selectedVariant);
        if (!raw || raw.length === 0) return;

        // Group, shuffle within, maintain order
        const singles = shuffleArray(raw.filter((q) => q.type === "single"));
        const contexts = shuffleArray(raw.filter((q) => q.type === "context"));
        const matchings = shuffleArray(raw.filter((q) => q.type === "matching"));
        const multiples = shuffleArray(raw.filter((q) => q.type === "multiple"));
        questions = [...singles, ...contexts, ...matchings, ...multiples];

        // Build shuffle map
        shuffleMap = questions.map((q) => {
            if (
                q.type === "single" ||
                q.type === "context" ||
                q.type === "multiple"
            ) {
                return {
                    shuffledIndices: shuffleArray(q.options.map((_, i) => i)),
                    type: "options",
                };
            }
            if (q.type === "matching") {
                return {
                    shuffledIndices: shuffleArray(q.right_column.map((_, i) => i)),
                    type: "right_column",
                };
            }
            return null;
        });

        answers = {};
        currentQ = 0;
        timeLeft = 3600;
        phase = "test";
        render();
        startTimer();
    }

    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                phase = "timeup";
                render();
                return;
            }
            // Update timer display only
            const timerEl = $("#timer");
            if (timerEl) {
                timerEl.textContent = `⏱ ${formatTime(timeLeft)}`;
                timerEl.className = `timer${timeLeft <= 300 ? " warning" : ""}`;
            }
        }, 1000);
    }

    function finishTest() {
        clearInterval(timerInterval);
        phase = "results";
        render();
    }

    // ─── RENDER ───
    function render() {
        const app = $("#app");
        if (phase === "start") renderStart(app);
        else if (phase === "test") renderTest(app);
        else if (phase === "confirm") renderConfirm(app);
        else if (phase === "timeup") renderTimeUp(app);
        else if (phase === "results") renderResults(app);
    }

    // ─── Start Screen ───
    function renderStart(app) {
        const tt = t();
        const canStart = studentName.trim().length > 0 && selectedSubject && selectedVariant;
        app.innerHTML = `
      <div class="top-bar">
        <button class="btn btn-ghost btn-sm" id="theme-toggle">${theme === "dark" ? "☀️" : "🌙"}</button>
        <button class="btn btn-ghost btn-sm" id="lang-toggle">${tt.langBtn}</button>
      </div>
      <div class="start-screen">
        <div class="start-box">
          <div class="start-icon">📝</div>
          <h1 class="start-title">${tt.appTitle}</h1>
          <p class="start-sub">${tt.fillName}</p>

          <div class="form-group">
            <label class="form-label">${tt.studentName}</label>
            <input type="text" class="form-input" id="student-input" 
              placeholder="${tt.studentNamePlaceholder}" 
              maxlength="50" value="${escapeHtml(studentName)}">
            <div class="form-hint" id="name-hint"></div>
          </div>

          <div class="form-group">
            <label class="form-label">${tt.selectSubject}</label>
            <select class="form-select" id="subject-select"><option value="">—</option></select>
          </div>

          <div class="form-group">
            <label class="form-label">${tt.selectVariant}</label>
            <select class="form-select" id="variant-select" disabled><option value="">—</option></select>
          </div>

          <button class="btn btn-primary btn-full" id="start-btn" ${canStart ? "" : "disabled"}>
            ${tt.startTest}
          </button>
        </div>
      </div>
    `;

        // Populate selects
        populateSubjects();
        if (selectedSubject) {
            $("#subject-select").value = selectedSubject;
            populateVariants();
            if (selectedVariant) $("#variant-select").value = selectedVariant;
        }

        // Events
        $("#theme-toggle").onclick = () => {
            setTheme(theme === "dark" ? "light" : "dark");
            render();
        };
        $("#lang-toggle").onclick = () => {
            lang = lang === "ru" ? "kz" : "ru";
            selectedSubject = "";
            selectedVariant = "";
            render();
        };
        $("#student-input").oninput = (e) => {
            studentName = e.target.value.slice(0, 50);
            updateStartBtn();
        };
        $("#subject-select").onchange = (e) => {
            selectedSubject = e.target.value;
            selectedVariant = "";
            populateVariants();
            updateStartBtn();
        };
        $("#variant-select").onchange = (e) => {
            selectedVariant = e.target.value;
            updateStartBtn();
        };
        $("#start-btn").onclick = startTest;
    }

    function updateStartBtn() {
        const btn = $("#start-btn");
        if (btn)
            btn.disabled = !(
                studentName.trim().length > 0 &&
                selectedSubject &&
                selectedVariant
            );
    }

    // ─── Test Screen ───
    function renderTest(app) {
        const tt = t();
        const q = questions[currentQ];
        if (!q) return;

        const qNum = currentQ + 1;
        const maxPts = qNum <= 30 ? 1 : 2;
        const typeLabel =
            q.type === "single"
                ? tt.single
                : q.type === "context"
                    ? tt.contextType
                    : q.type === "matching"
                        ? tt.matching
                        : tt.multiple;
        let sectionLabel = "";
        if (currentQ < 25)
            sectionLabel = `${tt.section} 1: ${tt.single} (1-25)`;
        else if (currentQ < 30)
            sectionLabel = `${tt.section} 2: ${tt.contextType} (26-30)`;
        else if (currentQ < 35)
            sectionLabel = `${tt.section} 3: ${tt.matching} (31-35)`;
        else sectionLabel = `${tt.section} 4: ${tt.multiple} (36-40)`;

        const displayOpts = getDisplayOptions(currentQ);
        const currentAnswer = answers[currentQ];

        // Dots
        let dotsHtml = "";
        questions.forEach((_, i) => {
            const cls = [];
            if (hasAnswer(i)) cls.push("answered");
            if (i === currentQ) cls.push("current");
            dotsHtml += `<button class="nav-dot ${cls.join(" ")}" data-qi="${i}">${i + 1}</button>`;
        });

        // Options
        let optionsHtml = "";
        if (q.type === "single" || q.type === "context") {
            optionsHtml = '<div class="options-list">';
            displayOpts.forEach((opt, si) => {
                const origIdx = toOriginalIndex(currentQ, si);
                const sel = currentAnswer === origIdx ? "selected" : "";
                optionsHtml += `
          <button class="option-btn ${sel}" data-si="${si}">
            <span class="option-letter">${String.fromCharCode(65 + si)}</span>
            <span class="option-text">${escapeHtml(opt)}</span>
          </button>`;
            });
            optionsHtml += "</div>";
        } else if (q.type === "matching") {
            q.left_column.forEach((left, li) => {
                const userRi = currentAnswer?.[li];
                const shuffledVal =
                    userRi !== undefined && userRi !== -1
                        ? toShuffledIndex(currentQ, userRi)
                        : "";
                let selectOpts = `<option value="">${tt.selectOption}</option>`;
                displayOpts.forEach((opt, si) => {
                    const selected = shuffledVal === si ? "selected" : "";
                    selectOpts += `<option value="${si}" ${selected}>${String.fromCharCode(65 + si)}. ${escapeHtml(opt)}</option>`;
                });
                optionsHtml += `
          <div class="match-card">
            <div class="match-term">${li + 1}. ${escapeHtml(left)}</div>
            <select class="form-select match-select" data-li="${li}">${selectOpts}</select>
          </div>`;
            });
        } else if (q.type === "multiple") {
            optionsHtml = '<div class="options-list">';
            displayOpts.forEach((opt, si) => {
                const origIdx = toOriginalIndex(currentQ, si);
                const sel =
                    Array.isArray(currentAnswer) && currentAnswer.includes(origIdx)
                        ? "selected"
                        : "";
                optionsHtml += `
          <button class="option-btn checkbox ${sel}" data-si="${si}">
            <span class="option-letter">${sel ? "✓" : String.fromCharCode(65 + si)}</span>
            <span class="option-text">${escapeHtml(opt)}</span>
          </button>`;
            });
            optionsHtml += "</div>";
        }

        app.innerHTML = `
      <div class="test-header">
        <div class="container test-header-inner">
          <div>
            <span class="q-num">${tt.question} ${qNum}</span>
            <span class="q-total"> ${tt.of} ${questions.length}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="timer" id="timer">⏱ ${formatTime(timeLeft)}</span>
            <button class="btn btn-ghost btn-sm" id="theme-toggle-test">${theme === "dark" ? "☀️" : "🌙"}</button>
          </div>
        </div>
      </div>

      <div class="nav-dots-bar">
        <div class="container"><div class="nav-dots">${dotsHtml}</div></div>
      </div>

      <div class="container" style="padding:0 16px">
        <div class="section-bar">
          <span class="section-label">${sectionLabel}</span>
          <span class="section-pts">${maxPts} ${tt.pts}</span>
        </div>
        <div class="question-area">
          ${renderExtraContent(q.extra_content)}
          ${q.context && !(q.extra_content && q.extra_content.type === "table") ? `<div class="context-block"><div class="context-label">${tt.context}</div><div class="context-text">${escapeHtml(q.context)}</div></div>` : ""}
          <p class="question-text">${escapeHtml(q.question)}</p>
          ${optionsHtml}
        </div>
      </div>

      <div class="bottom-nav">
        <div class="container bottom-nav-inner">
          <button class="btn btn-ghost" id="prev-btn" ${currentQ === 0 ? "disabled" : ""}>${tt.prev}</button>
          ${currentQ < questions.length - 1
                ? `<button class="btn btn-primary" id="next-btn" style="flex:1">${tt.next}</button>
                 <button class="btn btn-ghost" id="finish-btn" style="color:var(--red);border-color:var(--red)">${tt.finish}</button>`
                : `<button class="btn btn-success" id="finish-btn" style="flex:1;font-weight:700">${tt.finish}</button>`
            }
        </div>
      </div>
    `;

        // Events
        $$("#theme-toggle-test").forEach(
            (el) =>
            (el.onclick = () => {
                setTheme(theme === "dark" ? "light" : "dark");
                renderTest(app);
            })
        );
        $$(".nav-dot").forEach(
            (el) =>
            (el.onclick = () => {
                currentQ = parseInt(el.dataset.qi);
                renderTest(app);
            })
        );

        if (q.type === "single" || q.type === "context") {
            $$(".option-btn").forEach(
                (el) =>
                (el.onclick = () => {
                    const si = parseInt(el.dataset.si);
                    answers[currentQ] = toOriginalIndex(currentQ, si);
                    renderTest(app);
                })
            );
        } else if (q.type === "matching") {
            $$(".match-select").forEach(
                (el) =>
                (el.onchange = () => {
                    const li = parseInt(el.dataset.li);
                    const val = el.value;
                    if (!answers[currentQ]) answers[currentQ] = {};
                    answers[currentQ][li] =
                        val === "" ? -1 : toOriginalIndex(currentQ, parseInt(val));
                })
            );
        } else if (q.type === "multiple") {
            $$(".option-btn").forEach(
                (el) =>
                (el.onclick = () => {
                    const si = parseInt(el.dataset.si);
                    const origIdx = toOriginalIndex(currentQ, si);
                    if (!answers[currentQ]) answers[currentQ] = [];
                    const arr = [...answers[currentQ]];
                    const idx = arr.indexOf(origIdx);
                    if (idx > -1) arr.splice(idx, 1);
                    else arr.push(origIdx);
                    answers[currentQ] = arr;
                    renderTest(app);
                })
            );
        }

        const prevBtn = $("#prev-btn");
        if (prevBtn)
            prevBtn.onclick = () => {
                currentQ = Math.max(0, currentQ - 1);
                renderTest(app);
            };
        const nextBtn = $("#next-btn");
        if (nextBtn)
            nextBtn.onclick = () => {
                currentQ = Math.min(questions.length - 1, currentQ + 1);
                renderTest(app);
            };
        const finBtn = $("#finish-btn");
        if (finBtn)
            finBtn.onclick = () => {
                phase = "confirm";
                render();
            };
    }

    // ─── Confirm Modal ───
    function renderConfirm(app) {
        const tt = t();
        const answered = countAnswered();
        const unanswered = questions.length - answered;

        // Keep test visible behind modal
        const modalHtml = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal-box">
          <h2 class="modal-title">${tt.confirmTitle}</h2>
          <p class="modal-text">${tt.confirmMsg.replace("{answered}", answered).replace("{total}", questions.length)}</p>
          ${unanswered > 0 ? `<p class="modal-warn">⚠️ ${tt.unanswered.replace("{count}", unanswered)}</p>` : ""}
          <div class="modal-actions">
            <button class="btn btn-ghost" id="cancel-btn" style="flex:1">${tt.cancel}</button>
            <button class="btn btn-danger" id="confirm-finish-btn" style="flex:1">${tt.confirmBtn}</button>
          </div>
        </div>
      </div>
    `;

        // Append modal on top
        const div = document.createElement("div");
        div.id = "modal-container";
        div.innerHTML = modalHtml;
        document.body.appendChild(div);

        $("#cancel-btn").onclick = () => {
            document.body.removeChild(div);
            phase = "test";
        };
        $("#confirm-finish-btn").onclick = () => {
            document.body.removeChild(div);
            finishTest();
        };
    }

    // ─── Time Up ───
    function renderTimeUp(app) {
        const tt = t();
        app.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="text-align:center">
          <div class="modal-icon">⏰</div>
          <h2 class="modal-title" style="color:var(--red)">${tt.timeUp}</h2>
          <p class="modal-text">${tt.timeUpMsg}</p>
          <button class="btn btn-primary" id="timeup-ok" style="margin-top:16px;padding:12px 32px">${tt.ok}</button>
        </div>
      </div>
    `;
        $("#timeup-ok").onclick = finishTest;
    }

    // ─── Results ───
    function renderResults(app) {
        const tt = t();

        let totalEarned = 0,
            totalMax = 0;
        const details = questions.map((q, i) => {
            const userAns = answers[i] ?? null;
            const { earned, max } = calcScore(q, i, userAns);
            totalEarned += earned;
            totalMax += max;
            return { q, index: i, userAns, earned, max };
        });

        const pct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
        const correctCount = details.filter((d) => d.earned === d.max).length;
        const errors = details.filter((d) => d.earned < d.max);
        const skippedCount = details.filter((d) => !hasAnswer(d.index)).length;
        const incorrectCount = errors.length - skippedCount;

        const scoreColor =
            pct >= 70 ? "var(--green)" : pct >= 50 ? "var(--orange)" : "var(--red)";

        // Error review
        let reviewHtml = "";
        if (errors.length > 0) {
            reviewHtml = `<h2 class="review-title">${tt.reviewErrors}</h2>`;
            errors.forEach(({ q, index: qIdx, userAns, earned, max }) => {
                const qNum = qIdx + 1;
                const typeLabel =
                    q.type === "single"
                        ? tt.single
                        : q.type === "context"
                            ? tt.contextType
                            : q.type === "matching"
                                ? tt.matching
                                : tt.multiple;
                const partial = earned > 0 ? "partial" : "";
                const ptsColor = earned > 0 ? "var(--orange)" : "var(--red)";

                let optionsReview = "";

                if (q.type === "single" || q.type === "context") {
                    q.options.forEach((opt, oi) => {
                        const isCorrect = oi === q.correct;
                        const isUserPick = userAns === oi;
                        let cls = "";
                        if (isCorrect) cls = "correct-opt";
                        else if (isUserPick) cls = "wrong-opt";
                        const letterColor = isCorrect
                            ? "var(--green)"
                            : isUserPick
                                ? "var(--red)"
                                : "var(--text-dim)";
                        let tag = "";
                        if (isUserPick && !isCorrect)
                            tag = `<span class="review-tag" style="color:var(--red)">✗ ${tt.yourAnswer}</span>`;
                        if (isCorrect)
                            tag = `<span class="review-tag" style="color:var(--green)">✓ ${tt.correctAnswer}</span>`;
                        optionsReview += `
              <div class="review-option ${cls}">
                <span class="review-letter" style="color:${letterColor}">${String.fromCharCode(65 + oi)}</span>
                <span style="flex:1">${escapeHtml(opt)}</span>
                ${tag}
              </div>`;
                    });
                } else if (q.type === "matching") {
                    q.left_column.forEach((left, li) => {
                        const correctRi = q.correct.find((p) => p[0] === li)?.[1];
                        const userRi = userAns?.[li];
                        const isCorrect = userRi === correctRi;
                        let wrongPart = "";
                        if (!isCorrect && userRi !== undefined && userRi !== -1) {
                            wrongPart = `<span class="review-match-wrong">${escapeHtml(q.right_column[userRi])}</span> →`;
                        }
                        optionsReview += `
              <div class="review-match">
                <span class="review-match-term">${escapeHtml(left)}</span>
                ${wrongPart}
                <span class="review-match-correct">${escapeHtml(q.right_column[correctRi])}</span>
              </div>`;
                    });
                } else if (q.type === "multiple") {
                    q.options.forEach((opt, oi) => {
                        const isCorrect = q.correct.includes(oi);
                        const isUserPick =
                            Array.isArray(userAns) && userAns.includes(oi);
                        let cls = "";
                        if (isCorrect && isUserPick) cls = "correct-opt";
                        else if (isCorrect && !isUserPick) cls = "correct-opt";
                        else if (!isCorrect && isUserPick) cls = "wrong-opt";
                        const letterColor = isCorrect
                            ? "var(--green)"
                            : isUserPick
                                ? "var(--red)"
                                : "var(--text-dim)";
                        let tag = "";
                        if (isUserPick && !isCorrect)
                            tag = `<span class="review-tag" style="color:var(--red)">✗</span>`;
                        if (isCorrect && !isUserPick)
                            tag = `<span class="review-tag" style="color:var(--orange)">⚠ ${tt.correctAnswer}</span>`;
                        if (isCorrect && isUserPick)
                            tag = `<span class="review-tag" style="color:var(--green)">✓</span>`;
                        optionsReview += `
              <div class="review-option ${cls}">
                <span class="review-letter" style="color:${letterColor}">${String.fromCharCode(65 + oi)}</span>
                <span style="flex:1">${escapeHtml(opt)}</span>
                ${tag}
              </div>`;
                    });
                }

                reviewHtml += `
          <div class="card review-card ${partial}">
            <div class="review-head">
              <span class="review-meta">${tt.question} ${qNum} • ${typeLabel}</span>
              <span class="review-pts" style="color:${ptsColor}">${earned}/${max} ${tt.pts}</span>
            </div>
            ${renderExtraContent(q.extra_content)}
            ${q.context && !(q.extra_content && q.extra_content.type === "table") ? `<div class="context-block" style="margin-bottom:12px"><div class="context-text">${escapeHtml(q.context)}</div></div>` : ""}
            <p class="review-question">${escapeHtml(q.question)}</p>
            ${optionsReview}
            ${q.explanation ? `<div class="explanation-box">💡 ${escapeHtml(q.explanation)}</div>` : ""}
          </div>`;
            });
        }

        app.innerHTML = `
      <div class="results-page">
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px">
          <button class="btn btn-ghost btn-sm" id="theme-toggle-results">${theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
        <div class="container">
          <div class="card score-card">
            <p class="score-student">${tt.student}: <strong>${escapeHtml(studentName)}</strong></p>
            <h1 class="score-title">${tt.results}</h1>
            <div class="score-big" style="color:${scoreColor}">
              ${totalEarned}<span class="score-max">/${totalMax}</span>
            </div>
            <div class="score-pct">${pct}%</div>
            <div class="score-stats">
              <div class="stat-box" style="background:var(--green-soft)">
                <div class="stat-value" style="color:var(--green)">${correctCount}</div>
                <div class="stat-label">${tt.correct}</div>
              </div>
              <div class="stat-box" style="background:var(--red-soft)">
                <div class="stat-value" style="color:var(--red)">${incorrectCount}</div>
                <div class="stat-label">${tt.incorrect}</div>
              </div>
              <div class="stat-box" style="background:var(--orange-soft)">
                <div class="stat-value" style="color:var(--orange)">${skippedCount}</div>
                <div class="stat-label">${tt.skipped}</div>
              </div>
            </div>
          </div>

          ${reviewHtml}

          <button class="btn btn-primary btn-full" id="back-btn" style="margin-top:16px;margin-bottom:40px">
            ${tt.backToStart}
          </button>
        </div>
      </div>
    `;

        $("#theme-toggle-results").onclick = () => {
            setTheme(theme === "dark" ? "light" : "dark");
            renderResults(app);
        };
        $("#back-btn").onclick = () => {
            phase = "start";
            selectedVariant = "";
            render();
        };
    }

    // ─── Init ───
    async function init() {
        setTheme("dark");
        await loadIndex();
        render();
    }

    document.addEventListener("DOMContentLoaded", init);
})();