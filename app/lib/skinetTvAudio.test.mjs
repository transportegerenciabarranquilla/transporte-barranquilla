import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

test("el control del TV reproduce MP3 sin acceder al micrófono ni a SpeechSynthesis", () => {
  const effects = [];
  const buttons = [];
  const statuses = [];
  let played = 0;
  const player = { src: "", pause() {}, load() {}, removeAttribute() {}, play() { played++; return Promise.resolve(); } };
  const jsx = (type, props) => ({ type, props });
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL("../admin/modo-tv/TvModulationAnnouncements.tsx", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mocks = {
    react: { useRef: value => ({ current: value }), useState: value => [value, next => statuses.push(next)], useCallback: fn => fn, useEffect: fn => effects.push(fn) },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "../../lib/skinetModulations": { createModulationTracker: () => () => [], modulationAnnouncement: () => "" },
  };
  new Function("require", "module", "exports", source)(name => mocks[name], loaded, loaded.exports);
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  let cleanups = [];
  try {
    const tree = loaded.exports.TvModulationAnnouncements({ records: [], ready: false });
    const walk = node => {
      if (!node?.props) return;
      if (node.type === "audio") node.props.ref.current = player;
      if (node.type === "button") buttons.push(node);
      const children = node.props.children;
      (Array.isArray(children) ? children : [children]).forEach(walk);
    };
    walk(tree);
    cleanups = effects.map(effect => effect()).filter(Boolean);
    assert.equal(played, 0);
    buttons[0].props.onClick();
    assert.equal(played, 1);
    assert.match(player.src, /^\/api\/admin\/skinet-audio\?/);
    assert.match(new URL(player.src, "https://example.test").searchParams.get("text"), /sonido del televisor/);
    player.onplaying();
    assert.ok(statuses.some(value => typeof value === "string" && value.includes("Audio del televisor activo")));
    player.onerror();
    assert.ok(statuses.some(value => typeof value === "string" && value.includes("No se pudo reproducir")));
    buttons[0].props.onClick();
    assert.equal(played, 2);
    buttons[1].props.onClick();
    assert.equal(statuses.at(-1), true);
  } finally {
    cleanups.forEach(fn => fn());
    globalThis.window = previousWindow;
    globalThis.localStorage = previousStorage;
  }
});
