const CARD_SEL = "li[draggable]";
const ZONE_SEL = "ol[data-dropzone]";
const EMPTY_SEL = "li[data-empty-msg]";

const EMPTY_MESSAGES = {
  running: "No running containers",
  paused: "No paused containers",
  stopped: "No stopped containers",
};

let draggedEl = null;
let placeholder = null;

/** Build a visual placeholder bar */
function createPlaceholder() {
  const el = document.createElement("li");
  el.className = "otto-drop-indicator";
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** Nearest <li draggable> above the cursor inside a zone */
function getInsertBefore(zone, y) {
  const cards = [
    ...zone.querySelectorAll(`:scope > ${CARD_SEL}:not(.otto-dragging)`),
  ];
  for (const card of cards) {
    const box = card.getBoundingClientRect();
    if (y < box.top + box.height / 2) return card;
  }
  return null;
}

/** Map a dropzone name → Docker action verb */
function actionFor(targetZone, sourceZone) {
  if (targetZone === sourceZone) return null;
  const map = { running: "start", paused: "pause", stopped: "stop" };
  return map[targetZone] || null;
}

/** POST to trigger the Docker action, then reload to reflect real state */
function sendAction(containerId, action, cardEl) {
  // Add a loading indicator on the card
  if (cardEl) cardEl.classList.add("otto-loading");

  fetch(`/containers/${containerId}/${action}`, { method: "POST" })
    .then((res) => {
      if (!res.ok) {
        console.error(
          `Action ${action} failed for ${containerId}:`,
          res.status,
        );
        // Reload anyway to revert the optimistic UI move
      }
      // Reload page to get the real Docker state
      window.location.reload();
    })
    .catch((err) => {
      console.error(`Network error for ${action}:`, err);
      window.location.reload();
    });
}

/** Update badge counters and empty-state messages */
function refreshCounts() {
  document.querySelectorAll("section[aria-labelledby]").forEach((section) => {
    const zone = section.querySelector(ZONE_SEL);
    if (!zone) return;
    const name = zone.dataset.dropzone;
    const count = zone.querySelectorAll(`:scope > ${CARD_SEL}`).length;

    // badge
    const badge = section.querySelector("span[aria-label]");
    if (badge) {
      badge.textContent = count;
      badge.setAttribute("aria-label", `${count} ${name} containers`);
    }

    // empty-state message
    const existing = zone.querySelector(EMPTY_SEL);
    if (count === 0 && !existing) {
      const li = document.createElement("li");
      li.setAttribute("data-empty-msg", "");
      const p = document.createElement("p");
      p.className = "text-xs text-text-muted px-2";
      p.textContent = EMPTY_MESSAGES[name] || "No containers";
      li.appendChild(p);
      zone.appendChild(li);
    } else if (count > 0 && existing) {
      existing.remove();
    }
  });

  // header pills
  const zones = { running: 0, paused: 0, stopped: 0 };
  document.querySelectorAll(ZONE_SEL).forEach((z) => {
    zones[z.dataset.dropzone] = z.querySelectorAll(
      `:scope > ${CARD_SEL}`,
    ).length;
  });
  const pills = document.querySelectorAll("nav[aria-label] [role='status']");
  if (pills[0]) pills[0].lastChild.textContent = ` ${zones.running} Running`;
  if (pills[1]) pills[1].lastChild.textContent = ` ${zones.paused} Paused`;
  if (pills[2]) pills[2].lastChild.textContent = ` ${zones.stopped} Stopped`;
}

function onDragStart(e) {
  draggedEl = e.target.closest(CARD_SEL);
  if (!draggedEl) return;
  draggedEl.classList.add("otto-dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedEl.dataset.containerId);
  placeholder = createPlaceholder();
}

function onDragEnd() {
  if (draggedEl) draggedEl.classList.remove("otto-dragging");
  if (placeholder && placeholder.parentNode) placeholder.remove();
  document
    .querySelectorAll(ZONE_SEL)
    .forEach((z) => z.classList.remove("otto-zone-active"));
  draggedEl = null;
  placeholder = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const zone = e.target.closest(ZONE_SEL);
  if (!zone || !draggedEl) return;

  // highlight active zone
  document
    .querySelectorAll(ZONE_SEL)
    .forEach((z) => z.classList.remove("otto-zone-active"));
  zone.classList.add("otto-zone-active");

  // position placeholder
  const ref = getInsertBefore(zone, e.clientY);
  if (ref) {
    zone.insertBefore(placeholder, ref);
  } else {
    zone.appendChild(placeholder);
  }
}

function onDragLeave(e) {
  const zone = e.target.closest(ZONE_SEL);
  if (!zone) return;
  // only remove if we truly left the zone
  if (!zone.contains(e.relatedTarget)) {
    zone.classList.remove("otto-zone-active");
    if (placeholder && placeholder.parentNode === zone) placeholder.remove();
  }
}

function onDrop(e) {
  e.preventDefault();
  const zone = e.target.closest(ZONE_SEL);
  if (!zone || !draggedEl) return;

  const sourceZone = draggedEl.closest(ZONE_SEL)?.dataset.dropzone;
  const targetZone = zone.dataset.dropzone;
  const containerId = draggedEl.dataset.containerId;

  // move card in the DOM
  if (placeholder && placeholder.parentNode === zone) {
    zone.insertBefore(draggedEl, placeholder);
  } else {
    zone.appendChild(draggedEl);
  }

  // update dot color to match target column
  const dot = draggedEl.querySelector("span[aria-hidden='true']");
  if (dot) {
    dot.className = "w-2 h-2 rounded-full";
    if (targetZone === "running") dot.classList.add("bg-primary/60");
    else if (targetZone === "paused") dot.classList.add("bg-[#D4A017]/70");
    else dot.classList.add("bg-text-muted");
  }

  // cleanup
  if (placeholder) placeholder.remove();
  zone.classList.remove("otto-zone-active");
  draggedEl.classList.remove("otto-dragging");

  refreshCounts();

  // call backend and reload on completion
  const action = actionFor(targetZone, sourceZone);
  if (action && containerId) {
    sendAction(containerId, action, draggedEl);
  }

  draggedEl = null;
  placeholder = null;
}

function closeAllDropdowns() {
  document
    .querySelectorAll(".otto-dropdown.open")
    .forEach((d) => d.classList.remove("open"));
}

function onMenuToggle(e) {
  const btn = e.target.closest("[data-menu-toggle]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const dropdown = btn
    .closest(".otto-menu-wrap")
    .querySelector(".otto-dropdown");
  const isOpen = dropdown.classList.contains("open");

  closeAllDropdowns();

  if (!isOpen) {
    dropdown.classList.add("open");
  }
}

function onMenuAction(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const action = btn.dataset.action;
  const card = btn.closest(CARD_SEL);
  const containerId = card?.dataset.containerId;

  closeAllDropdowns();

  if (action && containerId) {
    sendAction(containerId, action, card);
  }
}

function init() {
  // drag & drop
  document.addEventListener("dragstart", onDragStart);
  document.addEventListener("dragend", onDragEnd);

  document.querySelectorAll(ZONE_SEL).forEach((zone) => {
    zone.addEventListener("dragover", onDragOver);
    zone.addEventListener("dragleave", onDragLeave);
    zone.addEventListener("drop", onDrop);
  });

  // dropdown menus
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-menu-toggle]")) {
      onMenuToggle(e);
    } else if (e.target.closest("[data-action]")) {
      onMenuAction(e);
    } else {
      closeAllDropdowns();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
