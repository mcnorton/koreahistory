// 사용설명서 목차에 지금 읽는 탭을 표시한다. 스크립트가 없어도 목차 링크는 동작한다.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  var secs = Array.prototype.slice.call(document.querySelectorAll('.g-sec'));
  if (!links.length || !secs.length) return;
  var queued = false;
  function update() {
    queued = false;
    var line = window.innerHeight * 0.3;
    var current = secs[0];
    secs.forEach(function (s) { if (s.getBoundingClientRect().top <= line) current = s; });
    var doc = document.documentElement;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) current = secs[secs.length - 1];
    links.forEach(function (a) {
      if (a.getAttribute('href') === '#' + current.id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  function ask() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', ask, { passive: true });
  window.addEventListener('resize', ask);
  update();
})();
