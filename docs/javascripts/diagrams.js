/* ════════════════════════════════════════════════════════════
   Diagram interactivity
   1. Click-to-fullscreen with pan/zoom for Mermaid diagrams
   2. Clickable node labels via per-page link maps
   3. Reading time under H1
   Works with Material's instant navigation via document$.
   ════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ─── Fullscreen overlay (created once) ─────────────────── */

  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "sd-diagram-overlay";
    overlay.innerHTML =
      '<div class="sd-diagram-toolbar">' +
      '  <span class="sd-diagram-hint">scroll to zoom · drag to pan · double-click to reset</span>' +
      '  <button class="sd-diagram-btn" data-action="zoom-out" title="Zoom out">−</button>' +
      '  <button class="sd-diagram-btn" data-action="zoom-in" title="Zoom in">+</button>' +
      '  <button class="sd-diagram-btn" data-action="reset" title="Reset">⤾</button>' +
      '  <button class="sd-diagram-btn" data-action="close" title="Close (Esc)">✕</button>' +
      "</div>" +
      '<div class="sd-diagram-stage"></div>';
    document.body.appendChild(overlay);

    const stage = overlay.querySelector(".sd-diagram-stage");

    /* pan/zoom state */
    let scale = 1, tx = 0, ty = 0;
    let dragging = false, lastX = 0, lastY = 0;

    function apply() {
      const svg = stage.querySelector("svg");
      if (svg) svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function reset() {
      scale = 1; tx = 0; ty = 0;
      apply();
    }

    function zoomAt(clientX, clientY, factor) {
      const rect = stage.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;
      const newScale = Math.min(8, Math.max(0.25, scale * factor));
      const ratio = newScale / scale;
      tx = cx - (cx - tx) * ratio;
      ty = cy - (cy - ty) * ratio;
      scale = newScale;
      apply();
    }

    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    stage.addEventListener("pointerdown", function (e) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
      stage.style.cursor = "grabbing";
    });

    stage.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      apply();
    });

    stage.addEventListener("pointerup", function () {
      dragging = false;
      stage.style.cursor = "grab";
    });

    stage.addEventListener("dblclick", reset);

    overlay.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-action]");
      if (!btn) {
        /* click on the dark backdrop (not the svg, not toolbar) closes */
        if (e.target === overlay || e.target === stage) close();
        return;
      }
      const action = btn.getAttribute("data-action");
      const rect = stage.getBoundingClientRect();
      if (action === "close") close();
      if (action === "reset") reset();
      if (action === "zoom-in") zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
      if (action === "zoom-out") zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("open")) close();
    });

    function close() {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      stage.innerHTML = "";
    }

    overlay._open = function (svgEl) {
      stage.innerHTML = "";
      const clone = svgEl.cloneNode(true);
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      clone.style.maxWidth = "none";
      /* size the clone to ~90% viewport while keeping aspect ratio */
      clone.style.width = "min(92vw, 1600px)";
      clone.style.height = "auto";
      stage.appendChild(clone);
      reset();
      overlay.classList.add("open");
      document.body.style.overflow = "hidden";
      stage.style.cursor = "grab";
    };

    return overlay;
  }

  /* ─── Attach expand affordance to each rendered diagram ──── */

  function enhanceDiagram(container) {
    if (container.dataset.sdEnhanced) return;
    const svg = container.querySelector("svg");
    if (!svg) return;
    container.dataset.sdEnhanced = "1";

    const btn = document.createElement("button");
    btn.className = "sd-diagram-expand";
    btn.title = "Expand diagram";
    btn.innerHTML = "⛶";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      ensureOverlay()._open(container.querySelector("svg"));
    });
    container.style.position = "relative";
    container.appendChild(btn);

    /* whole-diagram click also expands (but not on links inside) */
    container.addEventListener("click", function (e) {
      if (e.target.closest("a") || e.target.closest(".sd-diagram-expand")) return;
      if (e.target.closest("[data-sd-link]")) return;
      ensureOverlay()._open(container.querySelector("svg"));
    });
  }

  /* ─── Clickable node labels via link maps ─────────────────
     Usage in markdown, anywhere on the page:
       <div class="sd-mermaid-links" data-links='{"Label text": "relative/url/"}'></div>
     Any rendered mermaid node whose label exactly matches a key
     becomes a clickable link to the mapped URL.                 */

  /* canonical form: lowercase alphanumerics only — survives <br/> joins,
     punctuation differences, and emoji in labels */
  function canon(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function applyLinkMaps(root) {
    const maps = root.querySelectorAll(".sd-mermaid-links");
    if (!maps.length) return;

    const combined = {};
    maps.forEach(function (el) {
      try {
        const parsed = JSON.parse(el.getAttribute("data-links") || "{}");
        Object.keys(parsed).forEach(function (k) {
          combined[canon(k)] = parsed[k];
        });
      } catch (err) {
        console.warn("sd-mermaid-links: bad JSON", err);
      }
    });
    if (!Object.keys(combined).length) return;

    root.querySelectorAll(".mermaid svg").forEach(function (svg) {
      svg.querySelectorAll("g.node").forEach(function (node) {
        if (node.dataset.sdLink) return;
        const url = combined[canon(node.textContent)];
        if (!url) return;
        node.dataset.sdLink = url;
        node.classList.add("sd-node-link");
        node.addEventListener("click", function (e) {
          e.stopPropagation();
          window.location.href = url;
        });
      });
    });
  }

  /* ─── Reading time ────────────────────────────────────────── */

  function injectReadingTime(root) {
    const article = root.querySelector("article.md-content__inner") ||
                    document.querySelector("article.md-content__inner");
    if (!article || article.querySelector(".sd-reading-time")) return;
    /* skip landing pages (homepage hero) — reading time is noise there */
    if (article.querySelector(".home-hero")) return;
    const h1 = article.querySelector("h1");
    if (!h1) return;

    const text = article.textContent || "";
    const words = text.split(/\s+/).filter(Boolean).length;
    const codeBlocks = article.querySelectorAll("pre").length;
    const diagrams = article.querySelectorAll(".mermaid").length;
    /* 220 wpm prose + flat cost per code block/diagram */
    const minutes = Math.max(1, Math.round(words / 220 + (codeBlocks + diagrams) * 0.35));

    const el = document.createElement("p");
    el.className = "sd-reading-time";
    el.textContent = "~" + minutes + " min read · " + words.toLocaleString() + " words";
    h1.insertAdjacentElement("afterend", el);
  }

  /* ─── Wire-up: re-run after instant navigation + mermaid render ── */

  function scan() {
    const root = document;
    root.querySelectorAll(".mermaid").forEach(enhanceDiagram);
    applyLinkMaps(root);
    injectReadingTime(root);
  }

  /* Mermaid renders async — watch for SVGs appearing */
  const mo = new MutationObserver(function (muts) {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches?.(".mermaid, svg") || n.querySelector?.(".mermaid svg"))) {
          scan();
          return;
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* Material instant navigation hook (document$ is an RxJS observable) */
  if (window.document$ && window.document$.subscribe) {
    window.document$.subscribe(function () {
      scan();
      /* mermaid may render after this tick */
      setTimeout(scan, 400);
      setTimeout(scan, 1200);
    });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      scan();
      setTimeout(scan, 400);
      setTimeout(scan, 1200);
    });
  }
})();
