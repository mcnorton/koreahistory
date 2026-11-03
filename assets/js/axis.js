// 읽은 만큼 연표 축을 금색으로 채운다. 스크립트가 없어도 내용은 모두 보인다.
(function () {
  var box = document.querySelector('.chronicle');
  if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var fill = document.createElement('div');
  fill.className = 'axis-fill';
  fill.setAttribute('aria-hidden', 'true');
  box.appendChild(fill);
  var home = document.querySelector('.entry--home .mark');
  var queued = false;
  function update() {
    queued = false;
    var r = box.getBoundingClientRect();
    var end = home ? home.getBoundingClientRect().top - r.top + home.offsetHeight / 2 : r.height;
    fill.style.setProperty('--end', end + 'px');
    var read = (window.innerHeight * 0.6 - r.top) / end;
    fill.style.setProperty('--read', Math.max(0, Math.min(1, read)).toFixed(4));
  }
  function ask() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', ask, { passive: true });
  window.addEventListener('resize', ask);
  update();
})();
