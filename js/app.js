/* ENT Test App v2 */
(function () {
    "use strict";
    var lang = "ru", theme = "dark", phase = "start", studentName = "", selectedSubject = "", selectedVariant = "";
    var dataIndex = {}, questions = [], shuffleMap = [], currentQ = 0, answers = {}, timeLeft = 3600, timerInterval = null;
    function $(s) { return document.querySelector(s); }
    function $$(s) { return document.querySelectorAll(s); }
    function T() { return I18N[lang]; }
    function shuf(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
    function fmt(s) { var m = Math.floor(s / 60), sec = s % 60; return m + ":" + (sec < 10 ? "0" : "") + sec; }
    function esc(s) { if (s == null) return ""; return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

    function mdTable(md) {
        if (!md) return "";
        var lines = md.trim().split("\n"); if (lines.length < 2) return "<pre>" + esc(md) + "</pre>";
        function pr(l) { return l.split("|").map(function (c) { return c.trim(); }).filter(function (c) { return c && c.indexOf("---") === -1; }); }
        var hd = pr(lines[0]), ds = lines[1] && lines[1].indexOf("---") !== -1 ? 2 : 1;
        var h = "<table><thead><tr>"; for (var i = 0; i < hd.length; i++)h += "<th>" + esc(hd[i]) + "</th>";
        h += "</tr></thead><tbody>";
        for (var r = ds; r < lines.length; r++) { if (lines[r].indexOf("---") !== -1) continue; var c = pr(lines[r]); if (!c.length) continue; h += "<tr>"; for (var j = 0; j < c.length; j++)h += "<td>" + esc(c[j]) + "</td>"; h += "</tr>"; }
        return h + "</tbody></table>";
    }

    function renderExtra(ec) {
        if (ec === null || ec === undefined || typeof ec !== "object") return "";
        var c = ec.content; if (!c) return "";
        var inner = "";
        if (ec.type === "code") {
            var lb = ec.language ? '<span class="code-lang">' + esc(ec.language) + "</span>" : "";
            inner = lb + "<pre>" + esc(c) + "</pre>";
        } else if (ec.type === "table") {
            inner = mdTable(c);
        } else if (ec.type === "image") {
            inner = '<img src="' + esc(c) + '" alt="">';
        } else {
            inner = "<pre>" + esc(c) + "</pre>";
        }
        return '<div class="extra-content">' + inner + "</div>";
    }

    function renderCtx(q) {
        if (!q.context) return "";
        if (q.extra_content && typeof q.extra_content === "object" && q.extra_content !== null && q.extra_content.type === "table") return "";
        return '<div class="context-block"><div class="context-label">' + T().context + '</div><div class="context-text">' + esc(q.context) + "</div></div>";
    }

    function calcScore(q, qi, ua) {
        var n = qi + 1;
        if (n <= 30) { if (ua === null || ua === undefined) return { e: 0, m: 1 }; return { e: ua === q.correct ? 1 : 0, m: 1 }; }
        if (n <= 35) { if (!ua || typeof ua !== "object") return { e: 0, m: 2 }; var cc = 0; for (var p = 0; p < q.correct.length; p++)if (ua[q.correct[p][0]] === q.correct[p][1]) cc++; return { e: cc, m: 2 }; }
        if (!ua || !Array.isArray(ua) || !ua.length) return { e: 0, m: 2 };
        var er = 0; for (var u = 0; u < ua.length; u++)if (q.correct.indexOf(ua[u]) === -1) er++;
        for (var c = 0; c < q.correct.length; c++)if (ua.indexOf(q.correct[c]) === -1) er++;
        return { e: Math.max(0, 2 - er), m: 2 };
    }

    async function loadIndex() { try { dataIndex = await (await fetch("data/index.json")).json(); } catch (e) { dataIndex = {}; } }
    async function loadVar(lc, f, v) { try { return await (await fetch("data/" + lc + "/" + f + "/" + v + ".json")).json(); } catch (e) { return []; } }
    function setTh(t) { theme = t; document.documentElement.setAttribute("data-theme", t); }

    function popSubj() {
        var s = $("#subj-sel"); s.innerHTML = '<option value="">—</option>';
        var ld = dataIndex[lang] || {}; Object.keys(ld).forEach(function (k) { s.innerHTML += '<option value="' + esc(k) + '">' + esc(k) + "</option>"; });
        selectedSubject = ""; selectedVariant = ""; popVar();
    }
    function popVar() {
        var s = $("#var-sel"); s.innerHTML = '<option value="">—</option>'; s.disabled = !selectedSubject;
        if (!selectedSubject) return; var sd = (dataIndex[lang] || {})[selectedSubject]; if (!sd) return;
        sd.variants.forEach(function (v, i) { s.innerHTML += '<option value="' + esc(v) + '">' + (T().variantLabel || "Вариант") + " " + (i + 1) + "</option>"; });
    }
    function hasA(qi) { var q = questions[qi], a = answers[qi]; if (!q) return false; if (q.type === "single" || q.type === "context") return a != null; if (q.type === "matching") return a && typeof a === "object" && Object.values(a).some(function (v) { return v !== -1 && v !== undefined; }); if (q.type === "multiple") return Array.isArray(a) && a.length > 0; return false; }
    function cntA() { var c = 0; for (var i = 0; i < questions.length; i++)if (hasA(i)) c++; return c; }
    function toO(qi, si) { var sm = shuffleMap[qi]; return sm ? sm.si[si] : si; }
    function toS(qi, oi) { var sm = shuffleMap[qi]; return sm ? sm.si.indexOf(oi) : oi; }
    function dO(qi) { var q = questions[qi], sm = shuffleMap[qi]; if (!q || !sm) return []; var src = sm.tp === "options" ? q.options : q.right_column; return sm.si.map(function (i) { return src[i]; }); }

    async function startTest() {
        var nm = $("#stu-in").value.trim(); if (!nm || !selectedSubject || !selectedVariant) return; studentName = nm;
        var sd = (dataIndex[lang] || {})[selectedSubject]; if (!sd) return;
        var raw = await loadVar(lang, sd.folder, selectedVariant); if (!raw || !raw.length) return;
        var s1 = shuf(raw.filter(function (q) { return q.type === "single"; }));
        var s2 = shuf(raw.filter(function (q) { return q.type === "context"; }));
        var s3 = shuf(raw.filter(function (q) { return q.type === "matching"; }));
        var s4 = shuf(raw.filter(function (q) { return q.type === "multiple"; }));
        questions = s1.concat(s2).concat(s3).concat(s4);
        shuffleMap = questions.map(function (q) {
            if (q.type === "single" || q.type === "context" || q.type === "multiple") return { si: shuf(q.options.map(function (_, i) { return i; })), tp: "options" };
            if (q.type === "matching") return { si: shuf(q.right_column.map(function (_, i) { return i; })), tp: "right_column" };
            return null;
        });
        answers = {}; currentQ = 0; timeLeft = 3600; phase = "test"; render();
        clearInterval(timerInterval);
        timerInterval = setInterval(function () { timeLeft--; if (timeLeft <= 0) { clearInterval(timerInterval); phase = "timeup"; render(); return; } var el = $("#timer"); if (el) { el.textContent = "⏱ " + fmt(timeLeft); el.className = "timer" + (timeLeft <= 300 ? " warning" : ""); } }, 1000);
    }
    function finish() { clearInterval(timerInterval); phase = "results"; render(); }
    function render() { var a = $("#app"); if (phase === "start") rStart(a); else if (phase === "test") rTest(a); else if (phase === "confirm") rConfirm(); else if (phase === "timeup") rTimeUp(a); else if (phase === "results") rResults(a); }

    function rStart(app) {
        var t = T();
        app.innerHTML =
            '<div class="top-bar"><button class="btn btn-ghost btn-sm" id="th-t">' + (theme === "dark" ? "☀️" : "🌙") + '</button><button class="btn btn-ghost btn-sm" id="ln-t">' + t.langBtn + '</button></div>' +
            '<div class="start-screen"><div class="start-box"><div class="start-icon">📝</div><h1 class="start-title">' + t.appTitle + '</h1><p class="start-sub">' + t.fillName + '</p>' +
            '<div class="form-group"><label class="form-label">' + t.studentName + '</label><input type="text" class="form-input" id="stu-in" placeholder="' + t.studentNamePlaceholder + '" maxlength="50" value="' + esc(studentName) + '"></div>' +
            '<div class="form-group"><label class="form-label">' + t.selectSubject + '</label><select class="form-select" id="subj-sel"><option value="">—</option></select></div>' +
            '<div class="form-group"><label class="form-label">' + t.selectVariant + '</label><select class="form-select" id="var-sel" disabled><option value="">—</option></select></div>' +
            '<button class="btn btn-primary btn-full" id="go-btn" disabled>' + t.startTest + '</button></div></div>';
        popSubj();
        if (selectedSubject) { $("#subj-sel").value = selectedSubject; popVar(); if (selectedVariant) $("#var-sel").value = selectedVariant; }
        $("#th-t").onclick = function () { setTh(theme === "dark" ? "light" : "dark"); render(); };
        $("#ln-t").onclick = function () { lang = lang === "ru" ? "kz" : "ru"; selectedSubject = ""; selectedVariant = ""; render(); };
        $("#stu-in").oninput = function (e) { studentName = e.target.value.slice(0, 50); uBtn(); };
        $("#subj-sel").onchange = function (e) { selectedSubject = e.target.value; selectedVariant = ""; popVar(); uBtn(); };
        $("#var-sel").onchange = function (e) { selectedVariant = e.target.value; uBtn(); };
        $("#go-btn").onclick = startTest; uBtn();
    }
    function uBtn() { var b = $("#go-btn"); if (b) b.disabled = !(studentName.trim() && selectedSubject && selectedVariant); }

    function rTest(app) {
        var t = T(), q = questions[currentQ]; if (!q) return;
        var qn = currentQ + 1, mp = qn <= 30 ? 1 : 2;
        var sl = "";
        if (currentQ < 25) sl = t.section + " 1: " + t.single + " (1-25)";
        else if (currentQ < 30) sl = t.section + " 2: " + t.contextType + " (26-30)";
        else if (currentQ < 35) sl = t.section + " 3: " + t.matching + " (31-35)";
        else sl = t.section + " 4: " + t.multiple + " (36-40)";
        var opts = dO(currentQ), ca = answers[currentQ];

        var dots = ""; for (var d = 0; d < questions.length; d++) { var dc = "nav-dot"; if (hasA(d)) dc += " answered"; if (d === currentQ) dc += " current"; dots += '<button class="' + dc + '" data-qi="' + d + '">' + (d + 1) + "</button>"; }

        var oh = "";
        if (q.type === "single" || q.type === "context") {
            oh = '<div class="options-list">';
            for (var i = 0; i < opts.length; i++) { var oi = toO(currentQ, i); oh += '<button class="option-btn' + (ca === oi ? " selected" : "") + '" data-si="' + i + '"><span class="option-letter">' + String.fromCharCode(65 + i) + '</span><span class="option-text">' + esc(opts[i]) + "</span></button>"; }
            oh += "</div>";
        } else if (q.type === "matching") {
            for (var li = 0; li < q.left_column.length; li++) {
                var uri = ca ? ca[li] : undefined, sv = (uri != null && uri !== -1) ? toS(currentQ, uri) : -1;
                var so = '<option value="">' + t.selectOption + "</option>";
                for (var mi = 0; mi < opts.length; mi++)so += '<option value="' + mi + '"' + (sv === mi ? " selected" : "") + ">" + String.fromCharCode(65 + mi) + ". " + esc(opts[mi]) + "</option>";
                oh += '<div class="match-card"><div class="match-term">' + (li + 1) + ". " + esc(q.left_column[li]) + '</div><select class="form-select match-select" data-li="' + li + '">' + so + "</select></div>";
            }
        } else if (q.type === "multiple") {
            oh = '<div class="options-list">';
            for (var mi2 = 0; mi2 < opts.length; mi2++) { var moi = toO(currentQ, mi2), ms = Array.isArray(ca) && ca.indexOf(moi) !== -1; oh += '<button class="option-btn checkbox' + (ms ? " selected" : "") + '" data-si="' + mi2 + '"><span class="option-letter">' + (ms ? "✓" : String.fromCharCode(65 + mi2)) + '</span><span class="option-text">' + esc(opts[mi2]) + "</span></button>"; }
            oh += "</div>";
        }

        var extraHTML = renderExtra(q.extra_content);
        var ctxHTML = renderCtx(q);

        var bh = '<button class="btn btn-ghost" id="pb" ' + (currentQ === 0 ? "disabled" : "") + ">" + t.prev + "</button>";
        if (currentQ < questions.length - 1) { bh += '<button class="btn btn-primary" id="nb" style="flex:1">' + t.next + '</button><button class="btn btn-ghost" id="fb" style="color:var(--red);border-color:var(--red)">' + t.finish + "</button>"; }
        else { bh += '<button class="btn btn-success" id="fb" style="flex:1;font-weight:700">' + t.finish + "</button>"; }

        app.innerHTML =
            '<div class="test-header"><div class="container test-header-inner"><div><span class="q-num">' + t.question + " " + qn + '</span><span class="q-total"> ' + t.of + " " + questions.length + "</span></div>" +
            '<div style="display:flex;align-items:center;gap:12px"><span class="timer" id="timer">⏱ ' + fmt(timeLeft) + '</span><button class="btn btn-ghost btn-sm" id="th-t2">' + (theme === "dark" ? "☀️" : "🌙") + "</button></div></div></div>" +
            '<div class="nav-dots-bar"><div class="container"><div class="nav-dots">' + dots + "</div></div></div>" +
            '<div class="container" style="padding:0 16px"><div class="section-bar"><span class="section-label">' + sl + '</span><span class="section-pts">' + mp + " " + t.pts + "</span></div>" +
            '<div class="question-area">' + extraHTML + ctxHTML + '<p class="question-text">' + esc(q.question) + "</p>" + oh + "</div></div>" +
            '<div class="bottom-nav"><div class="container bottom-nav-inner">' + bh + "</div></div>";

        var tb = $("#th-t2"); if (tb) tb.onclick = function () { setTh(theme === "dark" ? "light" : "dark"); rTest(app); };
        $$(".nav-dot").forEach(function (el) { el.onclick = function () { currentQ = parseInt(this.getAttribute("data-qi")); rTest(app); }; });

        if (q.type === "single" || q.type === "context") { $$(".option-btn").forEach(function (el) { el.onclick = function () { answers[currentQ] = toO(currentQ, parseInt(this.getAttribute("data-si"))); rTest(app); }; }); }
        else if (q.type === "matching") { $$(".match-select").forEach(function (el) { el.onchange = function () { var l = parseInt(this.getAttribute("data-li")), v = this.value; if (!answers[currentQ]) answers[currentQ] = {}; answers[currentQ][l] = v === "" ? -1 : toO(currentQ, parseInt(v)); }; }); }
        else if (q.type === "multiple") { $$(".option-btn").forEach(function (el) { el.onclick = function () { var si = parseInt(this.getAttribute("data-si")), oi = toO(currentQ, si); if (!answers[currentQ]) answers[currentQ] = []; var ar = answers[currentQ].slice(), ix = ar.indexOf(oi); if (ix > -1) ar.splice(ix, 1); else ar.push(oi); answers[currentQ] = ar; rTest(app); }; }); }

        var pb = $("#pb"); if (pb) pb.onclick = function () { currentQ = Math.max(0, currentQ - 1); rTest(app); };
        var nb = $("#nb"); if (nb) nb.onclick = function () { currentQ = Math.min(questions.length - 1, currentQ + 1); rTest(app); };
        var fb = $("#fb"); if (fb) fb.onclick = function () { phase = "confirm"; render(); };
    }

    function rConfirm() {
        var t = T(), ans = cntA(), un = questions.length - ans;
        var div = document.createElement("div"); div.id = "mc";
        div.innerHTML = '<div class="modal-overlay"><div class="modal-box"><h2 class="modal-title">' + t.confirmTitle + '</h2><p class="modal-text">' + t.confirmMsg.replace("{answered}", ans).replace("{total}", questions.length) + "</p>" +
            (un > 0 ? '<p class="modal-warn">⚠️ ' + t.unanswered.replace("{count}", un) + "</p>" : "") +
            '<div class="modal-actions"><button class="btn btn-ghost" id="cc" style="flex:1">' + t.cancel + '</button><button class="btn btn-danger" id="cf" style="flex:1">' + t.confirmBtn + "</button></div></div></div>";
        document.body.appendChild(div);
        $("#cc").onclick = function () { document.body.removeChild(div); phase = "test"; };
        $("#cf").onclick = function () { document.body.removeChild(div); finish(); };
    }

    function rTimeUp(app) {
        var t = T();
        app.innerHTML = '<div class="modal-overlay"><div class="modal-box" style="text-align:center"><div class="modal-icon">⏰</div><h2 class="modal-title" style="color:var(--red)">' + t.timeUp + '</h2><p class="modal-text">' + t.timeUpMsg + '</p><button class="btn btn-primary" id="tu" style="margin-top:16px;padding:12px 32px">' + t.ok + "</button></div></div>";
        $("#tu").onclick = finish;
    }

    function rResults(app) {
        var t = T(), te = 0, tm = 0, det = [];
        for (var i = 0; i < questions.length; i++) { var q = questions[i], ua = answers[i] != null ? answers[i] : null, sc = calcScore(q, i, ua); te += sc.e; tm += sc.m; det.push({ q: q, i: i, ua: ua, e: sc.e, m: sc.m }); }
        var pct = tm ? Math.round(te / tm * 100) : 0, cc = 0, sk = 0, errs = [];
        for (var di = 0; di < det.length; di++) { if (det[di].e === det[di].m) cc++; else errs.push(det[di]); if (!hasA(det[di].i)) sk++; }
        var ic = Math.max(0, errs.length - sk), sC = pct >= 70 ? "var(--green)" : pct >= 50 ? "var(--orange)" : "var(--red)";

        var rh = "";
        if (errs.length) {
            rh = '<h2 class="review-title">' + t.reviewErrors + "</h2>";
            for (var ei = 0; ei < errs.length; ei++) {
                var d = errs[ei], eq = d.q, en = d.i + 1;
                var tl = eq.type === "single" ? t.single : eq.type === "context" ? t.contextType : eq.type === "matching" ? t.matching : t.multiple;
                var pt = d.e > 0 ? " partial" : "", pc = d.e > 0 ? "var(--orange)" : "var(--red)", or = "";

                if (eq.type === "single" || eq.type === "context") {
                    for (var oi = 0; oi < eq.options.length; oi++) { var isc = oi === eq.correct, isu = d.ua === oi, cl = isc ? " correct-opt" : isu ? " wrong-opt" : "", lc = isc ? "var(--green)" : isu ? "var(--red)" : "var(--text-dim)", tg = ""; if (isu && !isc) tg = '<span class="review-tag" style="color:var(--red)">✗ ' + t.yourAnswer + "</span>"; if (isc) tg = '<span class="review-tag" style="color:var(--green)">✓ ' + t.correctAnswer + "</span>"; or += '<div class="review-option' + cl + '"><span class="review-letter" style="color:' + lc + '">' + String.fromCharCode(65 + oi) + '</span><span style="flex:1">' + esc(eq.options[oi]) + "</span>" + tg + "</div>"; }
                } else if (eq.type === "matching") {
                    for (var ml = 0; ml < eq.left_column.length; ml++) { var cri = -1; for (var cp = 0; cp < eq.correct.length; cp++)if (eq.correct[cp][0] === ml) { cri = eq.correct[cp][1]; break; } var mur = d.ua ? d.ua[ml] : undefined, wp = ""; if (mur !== cri && mur != null && mur !== -1) wp = '<span class="review-match-wrong">' + esc(eq.right_column[mur]) + "</span> → "; or += '<div class="review-match"><span class="review-match-term">' + esc(eq.left_column[ml]) + "</span>" + wp + '<span class="review-match-correct">' + esc(eq.right_column[cri]) + "</span></div>"; }
                } else if (eq.type === "multiple") {
                    for (var mo = 0; mo < eq.options.length; mo++) { var mic = eq.correct.indexOf(mo) !== -1, miu = Array.isArray(d.ua) && d.ua.indexOf(mo) !== -1, mc = mic ? " correct-opt" : miu ? " wrong-opt" : "", ml2 = mic ? "var(--green)" : miu ? "var(--red)" : "var(--text-dim)", mt = ""; if (miu && !mic) mt = '<span class="review-tag" style="color:var(--red)">✗</span>'; if (mic && !miu) mt = '<span class="review-tag" style="color:var(--orange)">⚠ ' + t.correctAnswer + "</span>"; if (mic && miu) mt = '<span class="review-tag" style="color:var(--green)">✓</span>'; or += '<div class="review-option' + mc + '"><span class="review-letter" style="color:' + ml2 + '">' + String.fromCharCode(65 + mo) + '</span><span style="flex:1">' + esc(eq.options[mo]) + "</span>" + mt + "</div>"; }
                }
                rh += '<div class="card review-card' + pt + '"><div class="review-head"><span class="review-meta">' + t.question + " " + en + " • " + tl + '</span><span class="review-pts" style="color:' + pc + '">' + d.e + "/" + d.m + " " + t.pts + "</span></div>" + renderExtra(eq.extra_content) + renderCtx(eq) + '<p class="review-question">' + esc(eq.question) + "</p>" + or + (eq.explanation ? '<div class="explanation-box">💡 ' + esc(eq.explanation) + "</div>" : "") + "</div>";
            }
        }

        app.innerHTML = '<div class="results-page"><div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px"><button class="btn btn-ghost btn-sm" id="th-t3">' + (theme === "dark" ? "☀️" : "🌙") + "</button></div>" +
            '<div class="container"><div class="card score-card"><p class="score-student">' + t.student + ": <strong>" + esc(studentName) + "</strong></p>" +
            '<h1 class="score-title">' + t.results + '</h1><div class="score-big" style="color:' + sC + '">' + te + '<span class="score-max">/' + tm + "</span></div>" +
            '<div class="score-pct">' + pct + "%</div>" +
            '<div class="score-stats"><div class="stat-box" style="background:var(--green-soft)"><div class="stat-value" style="color:var(--green)">' + cc + '</div><div class="stat-label">' + t.correct + "</div></div>" +
            '<div class="stat-box" style="background:var(--red-soft)"><div class="stat-value" style="color:var(--red)">' + ic + '</div><div class="stat-label">' + t.incorrect + "</div></div>" +
            '<div class="stat-box" style="background:var(--orange-soft)"><div class="stat-value" style="color:var(--orange)">' + sk + '</div><div class="stat-label">' + t.skipped + "</div></div></div></div>" +
            rh + '<button class="btn btn-primary btn-full" id="bk" style="margin-top:16px;margin-bottom:40px">' + t.backToStart + "</button></div></div>";

        var tb = $("#th-t3"); if (tb) tb.onclick = function () { setTh(theme === "dark" ? "light" : "dark"); rResults(app); };
        $("#bk").onclick = function () { phase = "start"; selectedVariant = ""; render(); };
    }

    async function init() { setTh("dark"); await loadIndex(); render(); }
    document.addEventListener("DOMContentLoaded", init);
})();