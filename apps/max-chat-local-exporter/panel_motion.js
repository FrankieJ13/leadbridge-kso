(function initMaxExporterPanelMotion(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterPanelMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMaxExporterPanelMotion() {
  'use strict';

  function clampPosition(left, top, panelWidth, panelHeight, viewportWidth, viewportHeight, margin = 8) {
    const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
    return {
      left: Math.min(Math.max(margin, left), maxLeft),
      top: Math.min(Math.max(margin, top), maxTop)
    };
  }

  function renderedScale(panel) {
    const rect = panel.getBoundingClientRect();
    const logicalWidth = Number(panel.offsetWidth || 0);
    if (!logicalWidth || !Number.isFinite(rect.width)) return 1;
    return Math.max(0.1, rect.width / logicalWidth);
  }

  function install(panel) {
    if (!panel || panel.dataset.motionReady === 'true') return;
    const header = panel.querySelector('.maxle-header');
    const collapseButton = panel.querySelector('#maxle-collapse');
    if (!header || !collapseButton) return;

    panel.dataset.motionReady = 'true';
    let drag = null;

    function applyRenderedPosition(left, top) {
      const scale = renderedScale(panel);
      panel.style.left = `${left / scale}px`;
      panel.style.top = `${top / scale}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }

    function keepInsideViewport() {
      if (panel.dataset.moved !== 'true') return;
      const rect = panel.getBoundingClientRect();
      const position = clampPosition(rect.left, rect.top, rect.width, rect.height, window.innerWidth, window.innerHeight);
      applyRenderedPosition(position.left, position.top);
    }

    function movePanel(clientX, clientY) {
      if (!drag) return;
      const rect = panel.getBoundingClientRect();
      const position = clampPosition(
        clientX - drag.offsetX,
        clientY - drag.offsetY,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight
      );
      applyRenderedPosition(position.left, position.top);
      panel.dataset.moved = 'true';
    }

    function finishDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      panel.dataset.dragging = 'false';
      try { header.releasePointerCapture(event.pointerId); } catch (_) {}
    }

    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button, input, label, a')) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      panel.dataset.dragging = 'true';
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    header.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      movePanel(event.clientX, event.clientY);
    });
    header.addEventListener('pointerup', finishDrag);
    header.addEventListener('pointercancel', finishDrag);

    collapseButton.addEventListener('click', () => {
      const collapsed = panel.dataset.collapsed !== 'true';
      panel.dataset.collapsed = String(collapsed);
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
      collapseButton.setAttribute('aria-label', collapsed ? 'Развернуть панель' : 'Свернуть панель');
      collapseButton.title = collapsed ? 'Развернуть' : 'Свернуть';
      window.requestAnimationFrame(keepInsideViewport);
    });

    window.addEventListener('resize', keepInsideViewport);
  }

  return { clampPosition, renderedScale, install };
});
