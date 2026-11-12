// Local replacement for the old iframe's shared tooltip runtime.
export function installTooltips(root) {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.role = "tooltip";
  tip.hidden = true;
  root.appendChild(tip);
  function hide() {
    tip.hidden = true;
  }
  root.addEventListener("pointermove", (event) => {
    const target = event.target.closest("[data-tooltip]");
    if (!target) {
      hide();
      return;
    }
    tip.textContent = target.dataset.tooltip;
    tip.hidden = false;
    const rect = tip.getBoundingClientRect();
    const x = Math.max(
      5,
      Math.min(
        event.clientX - rect.width / 2,
        window.innerWidth - rect.width - 5,
      ),
    );
    const y = Math.max(
      5,
      Math.min(event.clientY + 16, window.innerHeight - rect.height - 5),
    );
    tip.style.transform = `translate(${x}px, ${y}px)`;
  });
  root.addEventListener("pointerleave", hide);
  root.addEventListener("input", hide);
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
}
