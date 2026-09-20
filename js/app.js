/* ============================================================
   app.js — exam state, timer, storage, scoring and rendering.

   Classic script (no modules, no fetch) so index.html works when
   opened straight from disk. Question data comes from
   questions.js, which is generated from EXAM.md + ANSWER-KEY.md.
   ============================================================ */
(function () {
  'use strict';

  var DURATION_MS = 60 * 60 * 1000;

  /* Keys carry a version. Answers are stored against the global question
     number q.n, so a paper whose questions were renumbered must not resume
     a session saved against the old numbering — bump this when that happens. */
  var KEY_SESSION = 'webexam.session.v2';
  var KEY_ATTEMPTS = 'webexam.attempts.v2';

  /* NOTE: ?admin is a convenience switch for the instructor, NOT security.
     Anyone can type it into the address bar. If this needs to actually hold,
     replace this line with a passphrase prompt. */
  var IS_ADMIN = /(^|[?&])admin(=|&|$)/i.test(location.search);

  var GRADES = [
    { min: 90, emoji: '🏆', line: 'Outstanding. You can build with this.' },
    { min: 75, emoji: '🎉', line: 'Strong pass. The foundations are solid.' },
    { min: 60, emoji: '👍', line: 'You passed. A few gaps are worth closing.' },
    { min: 40, emoji: '📚', line: 'Not a pass yet. Go back over your weakest sections.' },
    { min: 0,  emoji: '💪', line: 'This is a starting point. Build one small page a day.' }
  ];

  /* ---------- the 40-requirement mini project ---------- */
  var PROJECT = [
    { title: 'Structure & HTML', hueOf: 2, items: [
      'Three pages that link to each other — Home, Services (or Products) and Contact — with the same working navigation on all three.',
      'Every page uses semantic landmarks: `<header>`, `<nav>`, `<main>` and `<footer>`, rather than a stack of `<div>` elements.',
      'Exactly one `<h1>` per page, with headings nested in order and no levels skipped.',
      'Every meaningful image has descriptive `alt` text; purely decorative images use `alt=""`.',
      'The Services or Products page lists at least six items, each with an image, a name, a short description and a price.',
      'The Contact page has a form with name, email, phone, a `<select>` for the subject and a `<textarea>` for the message.',
      'Every form control has a `<label>` joined by `for` and `id`, and a `name` attribute so its value would actually be submitted.',
      'Every page has a `<title>` and a `<meta name="description">` that describe **that page**, not the site as a whole.',
      'The navigation marks the page you are on — `aria-current="page"` or an equivalent class — so a visitor can tell where they are.'
    ]},
    { title: 'Styling & responsive CSS', hueOf: 3, items: [
      'All styling lives in one external stylesheet — no `<style>` blocks and no `style` attributes in the HTML.',
      'Written mobile-first: base rules target small screens, and `min-width` media queries add the larger layouts.',
      'The site works at 360px, 768px and 1280px wide with no horizontal scrollbar and no overlapping text.',
      'Repeated components are styled with reusable classes; `id` is never used as a styling hook.',
      'Colours, font sizes and spacing come from CSS custom properties defined once at the top of the stylesheet.',
      '`box-sizing: border-box` is applied, and no element has a fixed pixel height that cuts off its own text.',
      'Every link, button and form field has a visible focus style — if you remove the default outline, you replace it.',
      'Body text is at least 16px with a line height around 1.5, and no line of prose runs much wider than 75 characters.',
      'Text and background colours meet at least 4.5:1 contrast — check the pairs you invented yourself, not just the defaults.'
    ]},
    { title: 'Bootstrap 5', hueOf: 4, items: [
      'Bootstrap 5 is loaded from a CDN, and your own stylesheet is linked after it so your rules win.',
      'Page content sits inside a `.container`, or `.container-fluid` where a full-bleed band is intended.',
      'The item grid is responsive — one per row on mobile, two on tablet, three or more on desktop, e.g. `col-12 col-md-6 col-lg-4`.',
      'A `navbar` that collapses into a working toggler button below the `lg` breakpoint.',
      'At least three Bootstrap components used correctly — card, button, badge, alert, modal or accordion.',
      'Spacing uses Bootstrap utilities (`mt-*`, `py-*`, `g-*`) rather than a one-off margin rule for each element.',
      'Bootstrap\'s own files are never edited — every override lives in your stylesheet, and `!important` appears nowhere.',
      'The Bootstrap JavaScript bundle is loaded, not only the CSS, so the navbar toggler and any modal or accordion actually work.'
    ]},
    { title: 'JavaScript', hueOf: 7, items: [
      'The contact form is validated before it submits: required fields filled, email in a sensible format, message at least 20 characters.',
      'Validation errors appear as inline messages beside the field they belong to — no `alert()` boxes.',
      '`event.preventDefault()` is used on submit, so the page never reloads and wipes what the user typed.',
      'A successful submission shows a clear confirmation message and resets the form.',
      'One interactive feature beyond validation — filter or search the item list, an image gallery, a cart counter, or a light/dark toggle.',
      'Something the user chose is saved in `localStorage` and restored when they return to the page.',
      'All JavaScript lives in one external `.js` file — no `onclick=""` or other event attributes in the HTML.',
      'The script runs after the DOM exists (`defer`, or a `DOMContentLoaded` handler) and throws no errors on any page.'
    ]},
    { title: 'Git & delivery', hueOf: 5, items: [
      'A Git repository with at least six meaningful commits spread across the three days, each message describing what changed.',
      'Pushed to a public GitHub repository with a README saying what the site is, what you built, and how to open it.',
      'No errors in the browser console on any page, no broken links and no missing images.',
      'Consistent indentation, class names that describe purpose rather than appearance, and no commented-out code or placeholder text left in the final submission.',
      'A `.gitignore` that keeps editor and operating-system junk — `.DS_Store`, `Thumbs.db`, `.vscode/` — out of the repository.',
      'The site is published with GitHub Pages, and the README links to the live URL.'
    ]}
  ];

  /* ============================================================
     Pure helpers — exposed for testing, no DOM access
     ============================================================ */

  function score(answers) {
    var perSection = {};
    EXAM_SECTIONS.forEach(function (s) { perSection[s.id] = { correct: 0, total: 0, blank: 0 }; });

    var correct = 0;
    EXAM_QUESTIONS.forEach(function (q) {
      var slot = perSection[q.section];
      slot.total++;
      var given = answers[q.n];
      if (!given) slot.blank++;
      else if (given === q.answer) { correct++; slot.correct++; }
    });

    return {
      correct: correct,
      total: EXAM_QUESTIONS.length,
      percent: Math.round((correct / EXAM_QUESTIONS.length) * 100),
      perSection: perSection
    };
  }

  function grade(percent) {
    for (var i = 0; i < GRADES.length; i++) if (percent >= GRADES[i].min) return GRADES[i];
    return GRADES[GRADES.length - 1];
  }

  function fmtTime(ms) {
    if (ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60), s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function dueDate(from) {
    var d = new Date(from);
    d.setDate(d.getDate() + 3);
    d.setHours(23, 59, 0, 0);
    return d;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Markdown inline bits that survive in the extracted text. Escape first,
     so `<input type="email">` in a stem renders as characters, not markup. */
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  window.ExamCore = { score: score, grade: grade, fmtTime: fmtTime, dueDate: dueDate, inline: inline };

  /* ============================================================
     Storage — never let a blocked localStorage break the exam
     ============================================================ */
  var store = {
    get: function (k, fallback) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ============================================================
     State
     ============================================================ */
  var state = null;
  var ticker = null;
  var submitArmed = false;
  var wrongOnly = false;

  function sectionMeta(id) {
    return EXAM_SECTIONS.filter(function (s) { return s.id === id; })[0];
  }
  function questionsIn(id) {
    return EXAM_QUESTIONS.filter(function (q) { return q.section === id; });
  }
  /* Counts against the question bank, not the stored keys — an answer left
     behind for a question that no longer exists must not inflate the total. */
  function answeredCount() {
    return EXAM_QUESTIONS.filter(function (q) { return state.answers[q.n]; }).length;
  }
  function save() { store.set(KEY_SESSION, state); }

  /* ============================================================
     Screens
     ============================================================ */
  var el = {};
  ['screen-start','screen-exam','screen-results','screen-project','screen-admin',
   'chrome','tabs','chrome-name','answered-count','timer','questions','section-title',
   'section-sub','pager-status','btn-prev','btn-next','syllabus','resume','resume-name',
   'resume-detail','btn-resume','btn-discard','name-form','student-name','name-error',
   'verdict-emoji','verdict-got','verdict-pct','verdict-line','verdict-who','paper',
   'insight','btn-project','btn-review','btn-retake','requirements','project-due',
   'btn-back-results','btn-print','review','attempts','btn-admin-back','btn-wrong-only',
   'btn-clear'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function show(name) {
    ['start','exam','results','project','admin'].forEach(function (s) {
      el['screen-' + s].hidden = (s !== name);
    });
    var inExam = name === 'exam';
    el.chrome.hidden = !inExam;
    el.tabs.hidden = !inExam;
    window.scrollTo(0, 0);
  }

  /* ---------- start screen ---------- */
  function renderSyllabus() {
    el.syllabus.innerHTML = EXAM_SECTIONS.map(function (s) {
      return '<li style="--hue:' + s.hue + '">' +
        '<span class="dot"></span>' +
        '<span class="nm">' + esc(s.name) + '</span>' +
        '<span class="ct">' + questionsIn(s.id).length + ' questions</span></li>';
    }).join('');
  }

  /* ---------- tabs ---------- */
  function renderTabs() {
    el.tabs.setAttribute('role', 'tablist');
    el.tabs.innerHTML = EXAM_SECTIONS.map(function (s) {
      var qs = questionsIn(s.id);
      var done = qs.filter(function (q) { return state.answers[q.n]; }).length;
      var sel = s.id === state.section;
      return '<button class="tab' + (done === qs.length ? ' is-done' : '') + '"' +
        ' type="button" role="tab" data-section="' + s.id + '"' +
        ' aria-selected="' + sel + '" tabindex="' + (sel ? '0' : '-1') + '"' +
        ' style="--hue:' + s.hue + '">' +
        '<span class="tab__name">' + esc(s.short) + '</span>' +
        '<span class="tab__count">' + done + '/' + qs.length + '</span>' +
        '</button>';
    }).join('');
  }

  /* ---------- one section of questions ---------- */
  function stemHtml(q) {
    return q.stem.map(function (part) {
      if (part.t === 'code') {
        return '<pre class="code"><code>' + esc(part.v) + '</code></pre>';
      }
      return '<p class="q__text">' + inline(part.v) + '</p>';
    }).join('');
  }

  function renderSection() {
    var meta = sectionMeta(state.section);
    document.documentElement.style.setProperty('--hue', meta.hue);

    /* Read the range off the questions themselves — sections are not all
       the same length, so it cannot be worked out from the section id. */
    var qs = questionsIn(state.section);
    el['section-title'].textContent = meta.name;
    el['section-sub'].textContent =
      'Section ' + meta.id + ' of ' + EXAM_SECTIONS.length + ' — questions ' +
      qs[0].n + ' to ' + qs[qs.length - 1].n + '.';

    el.questions.innerHTML = qs.map(function (q) {
      var chosen = state.answers[q.n];
      var opts = ['A', 'B', 'C', 'D'].map(function (k) {
        var on = chosen === k;
        return '<label class="opt' + (on ? ' is-selected' : '') + '" data-q="' + q.n + '" data-opt="' + k + '">' +
          '<input class="opt__input" type="radio" name="q' + q.n + '" value="' + k + '"' +
          (on ? ' checked' : '') + '>' +
          '<span class="opt__key">' + k + '</span>' +
          '<span class="opt__text">' + inline(q.options[k]) + '</span>' +
          '</label>';
      }).join('');

      return '<article class="q" id="q-' + q.n + '">' +
        '<div class="q__num">' + q.n + '</div>' +
        '<div class="q__body">' +
          '<div class="q__stem" id="stem-' + q.n + '">' + stemHtml(q) + '</div>' +
          '<div class="opts" role="radiogroup" aria-labelledby="stem-' + q.n + '">' + opts + '</div>' +
        '</div></article>';
    }).join('');

    el['btn-prev'].disabled = state.section === 1;
    el['btn-next'].textContent = state.section === 7 ? 'Submit exam' : 'Next section';
    submitArmed = false;
    updateCounts();
  }

  function updateCounts() {
    var n = answeredCount();
    el['answered-count'].textContent = n;
    renderTabs();

    var qs = questionsIn(state.section);
    var left = qs.filter(function (q) { return !state.answers[q.n]; }).length;
    var status = el['pager-status'];
    status.classList.remove('is-warn');
    if (state.section === 7) {
      var blanks = EXAM_QUESTIONS.length - n;
      status.textContent = blanks
        ? blanks + ' question' + (blanks === 1 ? '' : 's') + ' still blank across the paper.'
        : 'All ' + EXAM_QUESTIONS.length + ' answered.';
      if (blanks) status.classList.add('is-warn');
    } else {
      status.textContent = left
        ? left + ' left in this section'
        : 'Section complete';
    }
  }

  /* ---------- results ---------- */
  function renderResults(result) {
    var g = grade(result.percent);
    el['verdict-emoji'].textContent = g.emoji;
    el['verdict-emoji'].setAttribute('aria-label', g.line);
    el['verdict-got'].textContent = result.correct;
    el['verdict-pct'].textContent = result.percent + '%';
    el['verdict-line'].textContent = g.line;
    el['verdict-who'].textContent = state.name + ' — Web Development Foundation, Final Assessment';

    var i = 0;
    el.paper.innerHTML = EXAM_SECTIONS.map(function (s) {
      var cells = questionsIn(s.id).map(function (q) {
        var given = state.answers[q.n];
        var cls = !given ? 'cell cell--blank' : (given === q.answer ? 'cell cell--right' : 'cell cell--wrong');
        var label = 'Question ' + q.n + ': ' + (!given ? 'blank' : given === q.answer ? 'correct' : 'incorrect');
        return '<span class="' + cls + '" style="--i:' + (i++) + '" title="' + label + '"></span>';
      }).join('');
      var sc = result.perSection[s.id];
      return '<div class="prow" style="--hue:' + s.hue + '">' +
        '<span class="prow__name">' + esc(s.short) + '</span>' + cells +
        '<span class="prow__score">' + sc.correct + '/' + sc.total + '</span></div>';
    }).join('');

    el.insight.innerHTML = insightFor(result);

    el['btn-review'].hidden = !IS_ADMIN;
    el['btn-retake'].hidden = !IS_ADMIN;
  }

  function insightFor(result) {
    if (result.correct === result.total) {
      return 'A clean sweep — every question correct. Take the project as your next stretch.';
    }
    /* Rank by share, not by raw count — sections are not all the same length,
       so 5 out of 5 has to outrank 6 out of 10. */
    var share = function (id) {
      var s = result.perSection[id];
      return s.total ? s.correct / s.total : 0;
    };
    var ranked = EXAM_SECTIONS.slice().sort(function (a, b) {
      var d = share(a.id) - share(b.id);
      return d !== 0 ? d : a.id - b.id;
    });
    var weak = ranked[0], strong = ranked[ranked.length - 1];
    return 'Your strongest section was <strong>' + esc(strong.name) + '</strong> at ' +
      result.perSection[strong.id].correct + ' of ' + result.perSection[strong.id].total +
      ', and your weakest was <strong>' + esc(weak.name) + '</strong> at ' +
      result.perSection[weak.id].correct + ' of ' + result.perSection[weak.id].total +
      '. That is the part of the project to give the most time to.';
  }

  /* ---------- mini project ---------- */
  function renderProject(finishedAt) {
    var d = dueDate(finishedAt || Date.now());
    el['project-due'].textContent =
      d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
      ', 23:59';

    var n = 0;
    el.requirements.innerHTML = PROJECT.map(function (group) {
      var hue = sectionMeta(group.hueOf).hue;   // each group wears its own subject's colour
      var first = n + 1;
      var items = group.items.map(function (text) {
        n++;
        return '<li><span class="rgroup__n">' + n + '</span><span>' + inline(text) + '</span></li>';
      }).join('');
      return '<section class="rgroup" style="--hue:' + hue + '">' +
        '<div class="rgroup__head"><h3 class="rgroup__title">' + esc(group.title) + '</h3>' +
        '<span class="rgroup__marks">' + first + '–' + n + ' · ' + group.items.length + ' marks</span></div>' +
        '<ol class="rgroup__list">' + items + '</ol></section>';
    }).join('');
  }

  /* ---------- admin review ---------- */
  function renderReview() {
    el.review.innerHTML = EXAM_QUESTIONS.map(function (q) {
      var given = state.answers[q.n];
      var right = given === q.answer;
      if (wrongOnly && right) return '';
      return '<article class="rv ' + (right ? 'is-right' : 'is-wrong') + '">' +
        '<div class="rv__head">' +
          '<span class="rv__n">Q' + q.n + '</span>' +
          '<span class="rv__tag">' + esc(sectionMeta(q.section).short) + ' · ' + esc(q.difficulty) + ' · ' + esc(q.type) + '</span>' +
          '<span class="rv__verdict">' + (right ? 'Correct' : given ? 'Incorrect' : 'Left blank') + '</span>' +
        '</div>' +
        '<div class="rv__stem">' + stemHtml(q) + '</div>' +
        '<div class="rv__lines">' +
          '<div class="rv__line"><span class="rv__lab">Chose</span><span>' +
            (given ? given + '. ' + inline(q.options[given]) : '—') + '</span></div>' +
          '<div class="rv__line"><span class="rv__lab">Answer</span><span>' +
            q.answer + '. ' + inline(q.options[q.answer]) + '</span></div>' +
        '</div>' +
        '<p class="rv__why">' + inline(q.why) + '</p>' +
        '</article>';
    }).join('');
  }

  function renderAttempts() {
    var list = store.get(KEY_ATTEMPTS, []);
    if (!list.length) { el.attempts.innerHTML = '<p class="empty">No attempts saved yet.</p>'; return; }
    el.attempts.innerHTML = list.slice().reverse().map(function (a) {
      return '<div class="attempt">' +
        '<span class="attempt__name">' + esc(a.name) + '</span>' +
        '<span class="attempt__score">' + a.score + '/' + (a.total || EXAM_QUESTIONS.length) +
          ' · ' + a.percent + '%</span>' +
        '<span class="attempt__when">' + new Date(a.finishedAt).toLocaleString() + '</span>' +
        '</div>';
    }).join('');
  }

  /* ============================================================
     Timer
     ============================================================ */
  function startTicker() {
    stopTicker();
    tick();
    ticker = setInterval(tick, 1000);
  }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  function tick() {
    if (!state || state.submitted) return stopTicker();
    var left = state.deadlineAt - Date.now();
    el.timer.textContent = fmtTime(left);
    el.timer.classList.toggle('is-low', left <= 5 * 60 * 1000);
    if (left <= 0) { stopTicker(); submit(true); }
  }

  /* ============================================================
     Flow
     ============================================================ */
  function begin(name) {
    /* Belt and braces: even if the form were forced back into view, an
       unfinished attempt resumes rather than being replaced by a new one. */
    var existing = store.get(KEY_SESSION, null);
    if (existing && !existing.submitted && !IS_ADMIN) {
      state = existing;
      enterExam();
      return;
    }

    var now = Date.now();
    state = {
      name: name, startedAt: now, deadlineAt: now + DURATION_MS,
      answers: {}, section: 1, submitted: false
    };
    save();
    enterExam();
  }

  function enterExam() {
    el['chrome-name'].textContent = state.name;
    renderSection();
    show('exam');
    startTicker();
  }

  function goToSection(id) {
    if (id < 1 || id > 7) return;
    state.section = id;
    save();
    renderSection();
    window.scrollTo(0, 0);
  }

  function submit(auto) {
    if (state.submitted) return;
    var blanks = EXAM_QUESTIONS.length - answeredCount();

    if (!auto && blanks > 0 && !submitArmed) {
      submitArmed = true;
      el['pager-status'].textContent =
        blanks + ' question' + (blanks === 1 ? ' is' : 's are') + ' still blank. Press Submit exam again to finish anyway.';
      el['pager-status'].classList.add('is-warn');
      return;
    }

    stopTicker();
    state.submitted = true;
    state.finishedAt = Date.now();
    save();

    var result = score(state.answers);
    var attempts = store.get(KEY_ATTEMPTS, []);
    attempts.push({
      name: state.name, score: result.correct, total: result.total, percent: result.percent,
      perSection: result.perSection, answers: state.answers, finishedAt: state.finishedAt
    });
    store.set(KEY_ATTEMPTS, attempts);

    renderResults(result);
    renderProject(state.finishedAt);
    show('results');
  }

  /* ============================================================
     Events
     ============================================================ */
  el['name-form'].addEventListener('submit', function (e) {
    e.preventDefault();
    var name = el['student-name'].value.trim().replace(/\s+/g, ' ');
    if (!name) {
      el['name-error'].hidden = false;
      el['student-name'].focus();
      return;
    }
    el['name-error'].hidden = true;
    begin(name);
  });
  el['student-name'].addEventListener('input', function () { el['name-error'].hidden = true; });

  el.questions.addEventListener('change', function (e) {
    var input = e.target.closest ? e.target.closest('.opt__input') : null;
    if (!input) return;
    var label = input.parentNode;
    var n = +label.getAttribute('data-q');
    state.answers[n] = label.getAttribute('data-opt');
    save();

    var group = label.parentNode;
    Array.prototype.forEach.call(group.children, function (l) { l.classList.remove('is-selected'); });
    label.classList.add('is-selected');
    updateCounts();
  });

  el.tabs.addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (tab) goToSection(+tab.getAttribute('data-section'));
  });
  el.tabs.addEventListener('keydown', function (e) {
    var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    var next = state.section + dir;
    if (next >= 1 && next <= 7) {
      goToSection(next);
      var t = el.tabs.querySelector('[aria-selected="true"]');
      if (t) t.focus();
    }
  });

  el['btn-prev'].addEventListener('click', function () { goToSection(state.section - 1); });
  el['btn-next'].addEventListener('click', function () {
    if (state.section === 7) submit(false); else goToSection(state.section + 1);
  });

  el['btn-project'].addEventListener('click', function () { show('project'); });
  el['btn-back-results'].addEventListener('click', function () { show('results'); });
  el['btn-print'].addEventListener('click', function () { window.print(); });

  el['btn-review'].addEventListener('click', function () {
    wrongOnly = false;
    el['btn-wrong-only'].textContent = 'Show incorrect only';
    renderReview();
    renderAttempts();
    show('admin');
  });
  el['btn-admin-back'].addEventListener('click', function () { show('results'); });
  el['btn-wrong-only'].addEventListener('click', function () {
    wrongOnly = !wrongOnly;
    el['btn-wrong-only'].textContent = wrongOnly ? 'Show all questions' : 'Show incorrect only';
    renderReview();
  });

  /* Clear the in-progress attempt and hand back a usable start screen.
     Only ever reached from an instructor control. */
  function resetToStart(focusName) {
    store.del(KEY_SESSION);
    state = null;
    el['student-name'].value = '';
    el.resume.hidden = true;
    el['name-form'].hidden = false;
    if (focusName) el['student-name'].focus(); else show('start');
  }

  el['btn-retake'].addEventListener('click', function () { resetToStart(false); });

  el['btn-clear'].addEventListener('click', function () {
    if (!window.confirm('Delete the saved session and every stored attempt in this browser?')) return;
    store.del(KEY_ATTEMPTS);
    resetToStart(false);
  });

  el['btn-resume'].addEventListener('click', function () {
    state = store.get(KEY_SESSION, null);
    if (state) enterExam();
  });
  el['btn-discard'].addEventListener('click', function () { resetToStart(true); });

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    renderSyllabus();
    if (IS_ADMIN) document.title = '[admin] ' + document.title;

    var saved = store.get(KEY_SESSION, null);
    if (!saved) { show('start'); return; }

    if (saved.submitted) {
      state = saved;
      renderResults(score(state.answers));
      renderProject(state.finishedAt);
      show('results');
      return;
    }

    if (Date.now() >= saved.deadlineAt) {   // ran out while the tab was closed
      state = saved;
      submit(true);
      return;
    }

    var left = saved.deadlineAt - Date.now();
    el['resume-name'].textContent = saved.name;
    el['resume-detail'].textContent =
      EXAM_QUESTIONS.filter(function (q) { return saved.answers[q.n]; }).length +
      ' of ' + EXAM_QUESTIONS.length + ' answered, ' +
      fmtTime(left) + ' left on the clock.' +
      (IS_ADMIN ? '' : ' The clock has not stopped, so carry on where you left off.');

    /* An attempt is one attempt. A student may only resume it — both ways of
       starting fresh (Start over, and entering a new name) are instructor-only. */
    el.resume.hidden = false;
    el['btn-discard'].hidden = !IS_ADMIN;
    el['name-form'].hidden = !IS_ADMIN;
    show('start');
  }

  init();
})();
