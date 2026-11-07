// 이름 · 전화번호 · 사번을 [이름] [전화번호] [사번] 으로 바꾼다.
// 분류는 이 결과(가린 문장)로 한다. 원문은 어디에도 보내거나 저장하지 않는다.
(function (root) {
  // 흔한 성 (이름 3글자 = 성 + 두 글자 일 때만 이름으로 본다)
  var SURNAME = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편';
  // 가짜 이름 표지 (연습 데이터에서 «누가 봐도 가짜인 값»으로 쓴 이름)
  var FAKE_NAMES = ['테스트이름'];

  var TITLE = '(?:선생님|사원|대리|과장|차장|부장|팀장|님|씨)';
  var COPULA = '(?:입니다|이에요|예요|이고요|인데요)';

  var RE_EMPNO = /사번(?:은|는|이|가)?\s*[:：]?\s*[A-Za-z]*\d+/g;
  var RE_PHONE = /(^|[^\d])(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})(?!\d)/g;
  // 홍길동 사원 · 김아무개 대리 · 홍길동님
  var RE_NAME_TITLE = new RegExp('(^|[^가-힣])([' + SURNAME + '][가-힣]{2,3})(?=\\s?' + TITLE + ')', 'g');
  // 문장 첫머리의 «성춘향입니다»
  var RE_NAME_INTRO = new RegExp('(^|[.!?,]\\s*)([' + SURNAME + '][가-힣]{2})(?=' + COPULA + ')', 'g');

  function mask(text) {
    var found = { 이름: 0, 전화번호: 0, 사번: 0 };
    var out = String(text);

    out = out.replace(RE_EMPNO, function () { found.사번++; return '[사번]'; });
    out = out.replace(RE_PHONE, function (m, pre) { found.전화번호++; return pre + '[전화번호]'; });
    out = out.replace(RE_NAME_TITLE, function (m, pre) { found.이름++; return pre + '[이름]'; });
    out = out.replace(RE_NAME_INTRO, function (m, pre) { found.이름++; return pre + '[이름]'; });
    FAKE_NAMES.forEach(function (n) {
      var parts = out.split(n);
      found.이름 += parts.length - 1;
      out = parts.join('[이름]');
    });

    return { text: out, found: found };
  }

  root.Mask = { mask: mask };
})(typeof window !== 'undefined' ? window : globalThis);
