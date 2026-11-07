// 화면. 칸 · 긴급도의 이름과 순서는 criteria.json, 낱말은 keywords.json, 정답은 data/answer.json 에서 읽는다.
// AI 는 서버 함수(/api/classify)만 부른다. 열쇠는 이 화면에 없다.
(function () {
  var AI_URL = '/api/classify';
  var BATCH = 10;
  var AI_WAIT_MS = 75000; // 서버가 Gemini 를 최대 60초 기다린다

  var $ = function (id) { return document.getElementById(id); };
  var criteria = null;
  var keywords = null;
  var ctx = null;

  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function load(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ' (' + r.status + ')');
      return r.json();
    });
  }

  function showError(msg) {
    var e = $('error');
    e.textContent = msg;
    e.hidden = false;
  }

  // ---- AI 호출 (서버 함수) ----
  // items = [{id, text}] (가린 문장). 성공하면 {model, results}, 실패하면 이유가 담긴 Error.
  function callAI(items) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, AI_WAIT_MS);
    return fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items }),
      signal: ctl.signal
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = JSON.parse(t); } catch (e) { /* JSON 아님 */ }
        if (!r.ok || !data) {
          throw new Error((data && data.error) || ('AI 서버 함수가 답하지 않습니다 (HTTP ' + r.status + ')'));
        }
        return data;
      });
    }).catch(function (e) {
      if (e.name === 'AbortError') throw new Error('AI 의 답을 기다리다 멈췄습니다.');
      throw e;
    }).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  // ---- 탭 ----
  function selectTab(name) {
    ['classify', 'score'].forEach(function (n) {
      var on = n === name;
      $('t-' + n).setAttribute('aria-selected', on ? 'true' : 'false');
      $('tab-' + n).hidden = !on;
    });
  }
  $('t-classify').addEventListener('click', function () { selectTab('classify'); });
  $('t-score').addEventListener('click', function () { selectTab('score'); });

  // ---- 분류 ----
  function maskedNote(found) {
    var parts = [];
    Object.keys(found).forEach(function (k) { if (found[k] > 0) parts.push(k + ' ' + found[k]); });
    return parts.length ? '  (가린 것: ' + parts.join(', ') + ')' : '';
  }

  var latest = 0;

  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!ctx) return;
    var raw = $('text').value.trim();
    if (!raw) return;
    var me = ++latest;
    var m = Mask.mask(raw);

    function show(cat, urg, reason, how) {
      if (me !== latest) return; // 더 나중에 보낸 문장이 있으면 버린다
      $('r-masked').textContent = m.text + maskedNote(m.found);
      $('r-category').textContent = cat;
      $('r-urgency').textContent = urg;
      $('r-reason').textContent = reason;
      $('r-how').textContent = how;
      $('result').hidden = false;
    }

    show('…', '…', '', 'AI 로 가르는 중…');

    callAI([{ id: 'q', text: m.text }]).then(function (data) {
      var r = data.results && data.results[0];
      if (!r || r.error) throw new Error((r && r.error) || 'AI 가 답을 주지 않았습니다.');
      show(r.category, r.urgency, r.reason, 'AI (' + data.model + ')');
    }).catch(function (e) {
      var p = Rules.classify(m.text, ctx);
      show(p.category, p.urgency, p.reason, 'AI 없이 규칙으로 갈랐습니다 (이유: ' + e.message + ')');
    });
  });

  // Enter 로 보내고, Shift+Enter 는 줄바꿈
  $('text').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      $('form').requestSubmit();
    }
  });

  // ---- 낱말 보기 ----
  function renderWords() {
    load('data/practice.json').then(function (practice) {
      var byId = {};
      practice.forEach(function (s) { byId[s.id] = s.text; });
      var body = $('words-body');
      body.textContent = '';
      body.appendChild(el('p', '출처: ' + keywords.출처, 'sub'));

      function section(title, names, group) {
        body.appendChild(el('h2', title));
        names.forEach(function (name) {
          var g = group[name];
          var box = el('div', undefined, 'group');
          box.appendChild(el('h3', name));
          var chips = el('ul', undefined, 'chips');
          g.낱말.forEach(function (w) { chips.appendChild(el('li', w)); });
          box.appendChild(chips);
          var ex = el('ul', undefined, 'examples');
          g.예.forEach(function (id) { ex.appendChild(el('li', id + ' · ' + (byId[id] || '(연습 문장에 없음)'))); });
          box.appendChild(ex);
          body.appendChild(box);
        });
      }
      section('칸', ctx.categoryOrder, keywords.칸);
      section('긴급도', ctx.urgencyOrder, keywords.긴급도);
    }).catch(function (e) { showError('연습 문장을 읽지 못했습니다: ' + e.message); });
  }

  // ---- 채점: 규칙 ----
  function pct(n, total) { return Math.round((n / total) * 100) + '%'; }

  function renderScore(r, items) {
    var out = $('score-out');
    out.textContent = '';

    var box = el('div', undefined, 'summary');
    box.appendChild(el('p', '칸 정확도: ' + r.categoryOk + ' / ' + r.total + ' (' + pct(r.categoryOk, r.total) + ')'));
    box.appendChild(el('p', '긴급도 정확도: ' + r.urgencyOk + ' / ' + r.total + ' (' + pct(r.urgencyOk, r.total) + ')'));
    box.appendChild(el('p', '둘 다 맞은 수: ' + r.bothOk + ' / ' + r.total));

    // CLAUDE.md: 보안을 다른 칸으로 놓치는 것이 가장 나쁜 실수다
    var secTotal = items.filter(function (it) { return it.category === '보안'; }).length;
    var secMissed = r.wrong.filter(function (w) { return w.answerCategory === '보안' && !w.categoryOk; }).length;
    box.appendChild(el('p', '보안을 놓친 수: ' + secMissed + ' / ' + secTotal, secMissed ? 'bad' : 'ok'));

    box.appendChild(el('p', '조건: 규칙(keywords.json 의 낱말), 이름 · 전화번호 · 사번을 가린 문장, 채점용 data/answer.json ' + r.total + '개, AI 없음', 'cond'));
    out.appendChild(box);

    out.appendChild(el('h2', '틀린 문장 (' + r.wrong.length + ') — 정답 → 판정'));
    var list = el('ul', undefined, 'wrong-list');
    r.wrong.forEach(function (w) {
      var li = el('li');
      li.appendChild(el('div', w.id, 'id'));
      li.appendChild(el('div', w.masked));
      if (!w.categoryOk) li.appendChild(el('p', '칸: ' + w.answerCategory + ' → ' + w.predCategory, 'diff bad'));
      if (!w.urgencyOk) li.appendChild(el('p', '긴급도: ' + w.answerUrgency + ' → ' + w.predUrgency, 'diff bad'));
      list.appendChild(li);
    });
    out.appendChild(list);
  }

  $('score-btn').addEventListener('click', function () {
    if (!ctx) return;
    // answer.json 은 채점할 때만 연다
    load('data/answer.json').then(function (items) {
      renderScore(Rules.score(items, ctx, Mask.mask), items);
    }).catch(function (e) { showError('정답 파일을 읽지 못했습니다: ' + e.message); });
  });

  // ---- 채점: AI ----
  // preds[id] = {category, urgency, reason} 또는 없음(답을 못 받음 → 오답으로 센다)
  function tally(items, predOf) {
    var t = { total: items.length, categoryOk: 0, urgencyOk: 0, bothOk: 0, secTotal: 0, secMissed: 0, noAnswer: 0 };
    items.forEach(function (it) {
      var p = predOf(it);
      if (it.category === '보안') t.secTotal++;
      if (!p) { t.noAnswer++; if (it.category === '보안') t.secMissed++; return; }
      var c = p.category === it.category;
      var u = p.urgency === it.urgency;
      if (c) t.categoryOk++;
      if (u) t.urgencyOk++;
      if (c && u) t.bothOk++;
      if (it.category === '보안' && !c) t.secMissed++;
    });
    return t;
  }

  function row(label, a, b, cls) {
    var tr = el('tr');
    tr.appendChild(el('td', label));
    tr.appendChild(el('td', a));
    tr.appendChild(el('td', b, cls));
    return tr;
  }

  function renderCompare(items, rule, ai, model, detail) {
    var out = $('ai-out');
    out.textContent = '';
    var n = items.length;
    out.appendChild(el('h2', '규칙과 AI 나란히 (' + n + '개)'));

    var table = el('table', undefined, 'compare');
    var head = el('thead');
    var hr = el('tr');
    ['', '규칙', 'AI'].forEach(function (h) { hr.appendChild(el('th', h)); });
    head.appendChild(hr);
    table.appendChild(head);
    var tb = el('tbody');
    tb.appendChild(row('칸 정확도', rule.categoryOk + ' / ' + n + ' (' + pct(rule.categoryOk, n) + ')', ai.categoryOk + ' / ' + n + ' (' + pct(ai.categoryOk, n) + ')'));
    tb.appendChild(row('긴급도 정확도', rule.urgencyOk + ' / ' + n + ' (' + pct(rule.urgencyOk, n) + ')', ai.urgencyOk + ' / ' + n + ' (' + pct(ai.urgencyOk, n) + ')'));
    tb.appendChild(row('둘 다 맞은 수', rule.bothOk + ' / ' + n, ai.bothOk + ' / ' + n));
    tb.appendChild(row('보안을 놓친 수', rule.secMissed + ' / ' + rule.secTotal, ai.secMissed + ' / ' + ai.secTotal, ai.secMissed ? 'bad' : 'ok'));
    tb.appendChild(row('답을 못 받은 수', '—', ai.noAnswer + ' / ' + n, ai.noAnswer ? 'bad' : 'ok'));
    table.appendChild(tb);
    out.appendChild(table);

    if (ai.noAnswer) {
      out.appendChild(el('p', 'AI 가 답을 주지 않은 문장 ' + ai.noAnswer + '개는 오답으로 셌습니다.', 'bad'));
    }
    out.appendChild(el('p', '조건: 모델 ' + (model || '(응답 없음)') + ', 이름 · 전화번호 · 사번을 가린 문장, ' + BATCH + '개씩 보냄, 정답 data/answer.json ' + n + '개. 규칙은 keywords.json 의 낱말.', 'sub'));

    var btn = el('button', 'AI 채점 결과 내려받기', 'dl-btn');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      var file = {
        만든때: new Date().toISOString(),
        조건: { 모델: model || null, 문장수: n, 한번에보낸수: BATCH, 보낸것: '이름 · 전화번호 · 사번을 가린 문장', 정답: 'data/answer.json' },
        요약: { 규칙: rule, AI: ai },
        문장별: detail
      };
      var blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ai_채점결과.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    out.appendChild(btn);
  }

  $('ai-score-btn').addEventListener('click', function () {
    if (!ctx) return;
    var btns = [$('score-btn'), $('ai-score-btn')];
    var prog = $('ai-progress');
    btns.forEach(function (b) { b.disabled = true; });
    $('ai-out').textContent = '';

    // answer.json 은 채점할 때만 연다
    load('data/answer.json').then(function (items) {
      var total = items.length;
      var masked = items.map(function (it) { return { id: it.id, text: Mask.mask(it.text).text }; });
      var preds = {};
      var errors = {};
      var model = null;
      var done = 0;
      prog.hidden = false;
      prog.textContent = 'AI 채점 중… 0/' + total;

      var chain = Promise.resolve();
      for (var i = 0; i < total; i += BATCH) {
        (function (batch) {
          chain = chain.then(function () {
            return callAI(batch).then(function (data) {
              model = model || data.model;
              (data.results || []).forEach(function (r) {
                if (r && !r.error && r.id) preds[r.id] = r;
                else if (r && r.id) errors[r.id] = r.error;
              });
            }).catch(function (e) {
              batch.forEach(function (b) { errors[b.id] = e.message; });
            }).then(function () {
              done += batch.length;
              prog.textContent = 'AI 채점 중… ' + done + '/' + total;
            });
          });
        })(masked.slice(i, i + BATCH));
      }

      return chain.then(function () {
        var rule = tally(items, function (it) { return Rules.classify(Mask.mask(it.text).text, ctx); });
        var ai = tally(items, function (it) { return preds[it.id]; });
        var detail = items.map(function (it) {
          var p = preds[it.id];
          return {
            id: it.id,
            정답: { 칸: it.category, 긴급도: it.urgency },
            AI: p ? { 칸: p.category, 긴급도: p.urgency, 이유: p.reason } : null,
            오류: p ? null : (errors[it.id] || '답을 받지 못함')
          };
        });
        prog.textContent = 'AI 채점 끝 ' + total + '/' + total;
        renderCompare(items, rule, ai, model, detail);
      });
    }).catch(function (e) {
      showError('AI 채점을 끝내지 못했습니다: ' + e.message);
      prog.hidden = true;
    }).then(function () {
      btns.forEach(function (b) { b.disabled = false; });
    });
  });

  // ---- 시작 ----
  Promise.all([load('criteria.json'), load('keywords.json')]).then(function (res) {
    criteria = res[0];
    keywords = res[1];
    ctx = {
      categoryOrder: criteria.칸.slice().sort(function (a, b) { return a.순서 - b.순서; }).map(function (c) { return c.이름; }),
      urgencyOrder: criteria.긴급도.map(function (u) { return u.이름; }),
      keywords: keywords
    };
    renderWords();
  }).catch(function (e) {
    showError('기준 파일을 읽지 못했습니다: ' + e.message + '. 파일을 더블클릭해 열면 읽히지 않습니다. 이 폴더에서 로컬 서버(예: python -m http.server)를 켜고 주소로 여세요.');
  });
})();
