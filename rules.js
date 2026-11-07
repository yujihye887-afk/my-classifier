// 규칙으로 가른다. 낱말은 keywords.json 에서, 칸 · 긴급도의 순서는 criteria.json 에서 받는다.
// 이 파일에는 낱말도 정답도 적지 않는다.
(function (root) {
  function hitsOf(text, words) {
    return words.filter(function (w) { return text.indexOf(w) !== -1; });
  }

  // 낱말이 가장 많이 나온 이름을 고른다. 같으면 order 에서 앞선 것. 하나도 없으면 fallback.
  function best(group, text, order, fallback) {
    var top = null;
    order.forEach(function (name) {
      var hits = hitsOf(text, (group[name] && group[name].낱말) || []);
      if (hits.length > 0 && (top === null || hits.length > top.hits.length)) {
        top = { name: name, hits: hits };
      }
    });
    return top || { name: fallback, hits: [] };
  }

  function why(label, r) {
    if (r.hits.length === 0) return label + ' ' + r.name + ': 맞는 낱말이 없어 기본값으로 둠';
    return label + ' ' + r.name + ': ' + r.hits.map(function (h) { return '‘' + h + '’'; }).join(' ') + ' 낱말이 나와서';
  }

  // ctx = { categoryOrder: [...], urgencyOrder: [...], keywords: keywords.json }
  function classify(text, ctx) {
    var kw = ctx.keywords;
    var c = best(kw.칸, text, ctx.categoryOrder, kw.기본값.칸);
    var u = best(kw.긴급도, text, ctx.urgencyOrder, kw.기본값.긴급도);
    return {
      category: c.name,
      urgency: u.name,
      categoryHits: c.hits,
      urgencyHits: u.hits,
      reason: why('칸', c) + ' / ' + why('긴급도', u)
    };
  }

  // items = answer.json 같은 [{id, text, category, urgency}]. 가린 문장으로 분류해 정답과 맞춘다.
  function score(items, ctx, maskFn) {
    var r = { total: items.length, categoryOk: 0, urgencyOk: 0, bothOk: 0, wrong: [] };
    items.forEach(function (it) {
      var masked = maskFn(it.text).text;
      var p = classify(masked, ctx);
      var cOk = p.category === it.category;
      var uOk = p.urgency === it.urgency;
      if (cOk) r.categoryOk++;
      if (uOk) r.urgencyOk++;
      if (cOk && uOk) r.bothOk++;
      if (!cOk || !uOk) {
        r.wrong.push({
          id: it.id, masked: masked,
          answerCategory: it.category, predCategory: p.category, categoryOk: cOk,
          answerUrgency: it.urgency, predUrgency: p.urgency, urgencyOk: uOk
        });
      }
    });
    return r;
  }

  root.Rules = { classify: classify, score: score };
})(typeof window !== 'undefined' ? window : globalThis);
