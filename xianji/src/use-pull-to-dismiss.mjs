import {useEffect} from 'react';

// Content keeps native scrolling until a downward gesture reaches its boundary.
// Transforms go directly to the sheet, without React work per move.
export function usePullToDismiss(ref, closeRef, enabled, reduce) {
  useEffect(() => {
    const sheet = ref.current;
    if (!sheet || !enabled) return;
    let gesture = null, animation = null, disposed = false, closing = false, suppressUntil = 0;
    const reset = () => {
      const from = sheet.style.translate || '0 0';
      sheet.style.translate = '0 0';delete sheet.dataset.dragging;
      animation?.cancel();
      animation = sheet.animate([{translate: from}, {translate: '0 0'}], {
        duration: reduce ? 90 : 200, easing: 'cubic-bezier(.22,1,.36,1)',
      });
    };
    const start = (event, id, x, y, touch) => {
      suppressUntil = 0;
      if (gesture || closing || event.target.closest('input,select,textarea,[contenteditable]')) return;
      const header = !!event.target.closest('.modal-header');
      if (!touch && !header) return;
      const visible = getComputedStyle(sheet).translate.split(' ');
      const offset = parseFloat(visible[1]) || 0;
      animation?.cancel();sheet.style.translate = `0 ${offset}px`;
      const scrollers = [];
      if (!header) for (let el = event.target; el && el !== sheet; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) scrollers.push(el);
      }
      gesture = {id, x, y, origin: y, lastY: y, lastAt: performance.now(), velocity: 0,
        offset, baseOffset: offset, dragging: false, scrollers};
    };
    const move = (event, id, x, y) => {
      const g = gesture;
      if (!g || g.id !== id || closing) return;
      const now = performance.now(), dy = y - g.origin;
      g.velocity = (y - g.lastY) / Math.max(1, now - g.lastAt);g.lastY = y;g.lastAt = now;
      if (!g.dragging) {
        if (Math.abs(x - g.x) > 12 && Math.abs(x - g.x) > Math.abs(y - g.y) * 1.25) {gesture = null;if (g.baseOffset) reset();return;}
        // Safari may report a negative scrollTop during rubber-banding.
        if (g.scrollers.some(el => el.scrollTop > 1) || dy <= 0) {g.origin = y;return;}
        // Claim a downward pull before Safari begins its native rubber-band.
        // Once native scrolling has started, CSS contains the boundary while
        // the sheet can still follow the finger on non-cancelable moves.
        if (dy >= 3 && event.cancelable) event.preventDefault();
        if (dy < 7) return;
        g.dragging = true;sheet.dataset.dragging = 'true';
      }
      if (event.cancelable) event.preventDefault();
      g.offset = Math.max(0, g.baseOffset + (y - g.origin) * .9);
      sheet.style.translate = `0 ${g.offset}px`;
    };
    const end = (id, cancelled = false) => {
      const g = gesture;
      if (!g || g.id !== id) return;
      gesture = null;
      if (!g.dragging) {if (g.baseOffset) reset();return;}
      suppressUntil = performance.now() + 400;
      const threshold = Math.min(120, Math.max(72, sheet.clientHeight * .18));
      const recentVelocity = performance.now() - g.lastAt < 100 ? g.velocity : 0;
      if (cancelled || (g.offset < threshold && !(g.offset > 24 && recentVelocity > .55))) {reset();return;}
      closing = true;delete sheet.dataset.dragging;
      animation?.cancel();
      animation = sheet.animate([
        {translate: `0 ${g.offset}px`, opacity: 1},
        {translate: `0 ${window.innerHeight}px`, opacity: 0},
      ], {duration: reduce ? 100 : 220, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards'});
      animation.finished.then(() => {if (!disposed) closeRef.current();}).catch(() => {});
    };
    const touchStart = event => {
      if (event.touches.length !== 1) {if (gesture) {gesture = null;reset();}return;}
      const t = event.touches[0];start(event, t.identifier, t.clientX, t.clientY, true);
    };
    const touchMove = event => {
      if (event.touches.length !== 1) return;
      const t = event.touches[0];move(event, t.identifier, t.clientX, t.clientY);
    };
    const touchEnd = event => {for (const t of Array.from(event.changedTouches)) end(t.identifier, event.type === 'touchcancel');};
    const pointerDown = event => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      suppressUntil = 0;
      if (event.target.closest('button,a,[role=button]')) return;
      start(event, event.pointerId, event.clientX, event.clientY, false);
      if (gesture) sheet.setPointerCapture(event.pointerId);
    };
    const pointerMove = event => {if (event.pointerType !== 'touch') move(event, event.pointerId, event.clientX, event.clientY);};
    const pointerEnd = event => {if (event.pointerType !== 'touch') end(event.pointerId, event.type === 'pointercancel');};
    const click = event => {if (performance.now() < suppressUntil) {event.preventDefault();event.stopPropagation();}};
    const listeners = [
      ['touchstart', touchStart, {passive: true}], ['touchmove', touchMove, {passive: false}],
      ['touchend', touchEnd], ['touchcancel', touchEnd], ['pointerdown', pointerDown],
      ['pointermove', pointerMove], ['pointerup', pointerEnd], ['pointercancel', pointerEnd], ['click', click, true],
    ];
    listeners.forEach(([type, handler, options]) => sheet.addEventListener(type, handler, options));
    return () => {
      disposed = true;animation?.cancel();sheet.style.translate = '';delete sheet.dataset.dragging;
      listeners.forEach(([type, handler, options]) => sheet.removeEventListener(type, handler, options));
    };
  }, [ref, closeRef, enabled, reduce]);
}
