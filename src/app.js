import { createCalculator } from "./calculate.js";
import { defaults, loadState, saveState, updateState } from "./state.js";
import { renderControls } from "./ui/controls.js";
import { renderDetails } from "./ui/details.js";
import { createResults } from "./ui/results.js";
import { renderDiagrams } from "./ui/diagrams.js";
import { installTooltips } from "./ui/tooltips.js";

const root = document.getElementById("phyto-beam-explorer");
const q = (id) => root.querySelector("#" + id);
const controls = Object.fromEntries(
  Object.keys(defaults).map((key) => [key, q("pbe-" + key)]),
);
let storage;
try {
  storage = window.localStorage;
} catch {
  /* Storage can be disabled. */
}
let state = loadState(storage, window.location);
const calculate = createCalculator();
const renderResults = createResults(q);

function render() {
  const scene = calculate(state);
  renderControls(q, controls, state, scene);
  renderDetails(q, state, scene);
  renderResults(state, scene);
  renderDiagrams(q, state, scene);
}

for (const [key, control] of Object.entries(controls)) {
  control.addEventListener("input", () => {
    state = updateState(state, key, control.value);
    render();
  });
  control.addEventListener("change", () =>
    saveState(storage, window.location, state),
  );
}
installTooltips(root);
new ResizeObserver(render).observe(root);
render();
