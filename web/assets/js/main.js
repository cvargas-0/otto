const CARD_SEL = "li[draggable]";
const ZONE_SEL = "ol[data-dropzone]";
const EMPTY_SEL = "li[data-empty-msg]";

const EMPTY_MESSAGES = {
  running: "No running containers",
  paused: "No paused containers",
  stopped: "No stopped containers",
};

/**
 * Valid direct Docker transitions per source state.
 *   running → paused, stopped
 *   paused  → running
 *   stopped → running
 */
const VALID_TARGETS = {
  running: ["paused", "stopped"],
  paused: ["running"],
  stopped: ["running"],
};

/** Menu actions per state — label + Docker action */
const MENU_ACTIONS = {
  running: [
    { label: "Pause", action: "pause" },
    { label: "Stop", action: "stop" },
  ],
  paused: [{ label: "Resume", action: "unpause" }],
  stopped: [{ label: "Start", action: "start" }],
};

let draggedEl = null;
let placeholder = null;

/** Check if a drag move is allowed */
function canDrop(targetZone, currentState) {
  if (targetZone === currentState) return false;
  return (VALID_TARGETS[currentState] || []).includes(targetZone);
}

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

/**
 * Map a dropzone move → Docker action.
 *   running → paused  = pause
 *   running → stopped = stop
 *   paused  → running = unpause
 *   stopped → running = start
 */
function actionFor(targetZone, currentState) {
  if (targetZone === "paused" && currentState === "running") return "pause";
  if (targetZone === "stopped" && currentState === "running") return "stop";
  if (targetZone === "running" && currentState === "paused") return "unpause";
  if (targetZone === "running" && currentState === "stopped") return "start";
  return null;
}

/** POST action, then reload to reflect real state */
async function sendActions(containerId, actions, cardEl) {
  if (cardEl) cardEl.classList.add("otto-loading");

  for (const action of actions) {
    try {
      const res = await fetch(`/containers/${containerId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error(
          `Action ${action} failed for ${containerId}:`,
          res.status,
        );
        break;
      }
    } catch (err) {
      console.error(`Network error for ${action}:`, err);
      break;
    }
  }

  window.location.reload();
}

/** Update badge counters and empty-state messages */
function refreshCounts() {
  document.querySelectorAll("section[aria-labelledby]").forEach((section) => {
    const zone = section.querySelector(ZONE_SEL);
    if (!zone) return;
    const name = zone.dataset.dropzone;
    const count = zone.querySelectorAll(`:scope > ${CARD_SEL}`).length;

    const badge = section.querySelector("span[aria-label]");
    if (badge) {
      badge.textContent = count;
      badge.setAttribute("aria-label", `${count} ${name} containers`);
    }

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

  // mark valid/invalid zones immediately
  const state = draggedEl.dataset.state;
  document.querySelectorAll(ZONE_SEL).forEach((z) => {
    const target = z.dataset.dropzone;
    if (target === state) return;
    if (!canDrop(target, state)) {
      z.classList.add("otto-zone-blocked");
    }
  });
}

function onDragEnd() {
  if (draggedEl) draggedEl.classList.remove("otto-dragging");
  if (placeholder && placeholder.parentNode) placeholder.remove();
  document
    .querySelectorAll(ZONE_SEL)
    .forEach((z) =>
      z.classList.remove("otto-zone-active", "otto-zone-blocked"),
    );
  draggedEl = null;
  placeholder = null;
}

function onDragOver(e) {
  const zone = e.target.closest(ZONE_SEL);
  if (!zone || !draggedEl) return;

  const targetZone = zone.dataset.dropzone;
  const currentState = draggedEl.dataset.state;

  if (!canDrop(targetZone, currentState)) {
    e.dataTransfer.dropEffect = "none";
    return;
  }

  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  // highlight only valid zone
  document
    .querySelectorAll(ZONE_SEL)
    .forEach((z) => z.classList.remove("otto-zone-active"));
  zone.classList.add("otto-zone-active");

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
  if (!zone.contains(e.relatedTarget)) {
    zone.classList.remove("otto-zone-active");
    if (placeholder && placeholder.parentNode === zone) placeholder.remove();
  }
}

function onDrop(e) {
  e.preventDefault();
  const zone = e.target.closest(ZONE_SEL);
  if (!zone || !draggedEl) return;

  const targetZone = zone.dataset.dropzone;
  const containerId = draggedEl.dataset.containerId;
  const currentState = draggedEl.dataset.state;

  if (!canDrop(targetZone, currentState)) return;

  // move card in the DOM
  if (placeholder && placeholder.parentNode === zone) {
    zone.insertBefore(draggedEl, placeholder);
  } else {
    zone.appendChild(draggedEl);
  }

  // update dot color
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
  document
    .querySelectorAll(ZONE_SEL)
    .forEach((z) => z.classList.remove("otto-zone-blocked"));

  refreshCounts();

  const action = actionFor(targetZone, currentState);
  if (action && containerId) {
    draggedEl.dataset.state = targetZone;
    sendActions(containerId, [action], draggedEl);
  }

  draggedEl = null;
  placeholder = null;
}

function closeAllDropdowns() {
  document
    .querySelectorAll(".otto-dropdown.open")
    .forEach((d) => d.classList.remove("open"));
}

/** Build dropdown items based on current state */
function populateDropdown(dropdown, state) {
  dropdown.innerHTML = "";
  const items = MENU_ACTIONS[state] || [];

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "menuitem";
    btn.dataset.action = item.action;
    btn.textContent = item.label;
    dropdown.appendChild(btn);
  });

  const divider = document.createElement("div");
  divider.className = "otto-dropdown-divider";
  dropdown.appendChild(divider);

  const logsBtn = document.createElement("button");
  logsBtn.type = "button";
  logsBtn.role = "menuitem";
  logsBtn.disabled = true;
  logsBtn.textContent = "View Logs";
  dropdown.appendChild(logsBtn);
}

function onMenuToggle(e) {
  const btn = e.target.closest("[data-menu-toggle]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const wrap = btn.closest(".otto-menu-wrap");
  const dropdown = wrap.querySelector(".otto-dropdown");
  const isOpen = dropdown.classList.contains("open");

  closeAllDropdowns();

  if (!isOpen) {
    const card = btn.closest(CARD_SEL);
    const state = card?.dataset.state;
    populateDropdown(dropdown, state);
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
    sendActions(containerId, [action], card);
  }
}

function init() {
  document.addEventListener("dragstart", onDragStart);
  document.addEventListener("dragend", onDragEnd);

  document.querySelectorAll(ZONE_SEL).forEach((zone) => {
    zone.addEventListener("dragover", onDragOver);
    zone.addEventListener("dragleave", onDragLeave);
    zone.addEventListener("drop", onDrop);
  });

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
