/**
 * Undefined-name check.
 *
 * Two bugs shipped this week from the same mistake: a function used without
 * being imported. `rankAt` froze the game on every game-over, and
 * `JETPACK_ALTITUDE` silently killed the jetpack's coin trail. Both are one
 * word missing from an import list, and neither is visible to anything the
 * project runs — `vite build` treats an unknown identifier as a global it
 * cannot see and bundles it without a word.
 *
 * So this reads every module, works out what each scope has actually declared,
 * and reports any name that is neither declared, imported, nor a real global.
 *
 * Built on the parser Rollup already ships, so it costs no new dependency. It
 * deliberately over-declares — a name declared anywhere inside a function is
 * treated as visible throughout it — because the only unacceptable outcome is a
 * false alarm. A check that cries wolf gets ignored, and then it is worth less
 * than nothing.
 *
 *   node scripts/check-names.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseAst } from "rollup/parseAst";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["src", "convex", "scripts"];
const SKIP = new Set(["_generated", "data", "node_modules"]);

/** Names that exist without being declared anywhere in the project. */
const GLOBALS = new Set([
  // language
  "globalThis", "undefined", "NaN", "Infinity", "Object", "Array", "Function",
  "Boolean", "Number", "String", "Symbol", "BigInt", "Math", "JSON", "Date",
  "RegExp", "Error", "TypeError", "RangeError", "SyntaxError", "Map", "Set",
  "WeakMap", "WeakSet", "Promise", "Proxy", "Reflect", "Intl", "ArrayBuffer",
  "DataView", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array",
  "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array", "parseInt", "parseFloat", "isNaN",
  "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI",
  "decodeURI", "structuredClone", "queueMicrotask", "AggregateError",
  // browser
  "window", "document", "navigator", "location", "history", "screen",
  "localStorage", "sessionStorage", "console", "performance", "crypto",
  "fetch", "Headers", "Request", "Response", "URL", "URLSearchParams",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "getComputedStyle",
  "Element", "HTMLElement", "Node", "NodeFilter", "Event", "KeyboardEvent",
  "PointerEvent", "CustomEvent", "EventTarget", "Image", "Audio", "Blob",
  "FileReader", "FormData", "AbortController", "IntersectionObserver",
  "ResizeObserver", "MutationObserver", "TextEncoder", "TextDecoder",
  "AudioContext", "webkitAudioContext", "devicePixelRatio", "alert", "confirm", "prompt",
  "WebSocket", "Worker", "DOMParser",
  // node
  "process", "Buffer", "__dirname", "__filename", "require", "module", "exports",
]);

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkFiles(path, out);
    else if (/\.m?js$/.test(name)) out.push(path);
  }
  return out;
}

/** Every child node, without needing a table of node types. */
function* children(node) {
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") yield item;
    } else if (value && typeof value.type === "string") {
      yield value;
    }
  }
}

/** Names bound by a binding pattern: identifiers, objects, arrays, defaults. */
function bindingNames(node, out) {
  if (!node) return out;
  switch (node.type) {
    case "Identifier":
      out.add(node.name);
      break;
    case "ObjectPattern":
      for (const prop of node.properties) {
        bindingNames(prop.type === "RestElement" ? prop.argument : prop.value, out);
      }
      break;
    case "ArrayPattern":
      for (const element of node.elements) bindingNames(element, out);
      break;
    case "AssignmentPattern":
      bindingNames(node.left, out);
      break;
    case "RestElement":
      bindingNames(node.argument, out);
      break;
    default:
      break;
  }
  return out;
}

/** Everything declared anywhere inside `node`, not descending into nothing. */
function declaredWithin(node, out = new Set()) {
  for (const child of children(node)) {
    switch (child.type) {
      case "VariableDeclaration":
        for (const declarator of child.declarations) bindingNames(declarator.id, out);
        break;
      case "FunctionDeclaration":
      case "ClassDeclaration":
        if (child.id) out.add(child.id.name);
        break;
      case "ImportDeclaration":
        for (const specifier of child.specifiers) out.add(specifier.local.name);
        break;
      case "CatchClause":
        bindingNames(child.param, out);
        break;
      default:
        break;
    }
    declaredWithin(child, out);
  }
  return out;
}

const FUNCTIONS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function ownNames(node) {
  const names = new Set();
  if (FUNCTIONS.has(node.type)) {
    for (const param of node.params) bindingNames(param, names);
    if (node.id) names.add(node.id.name);
    names.add("arguments");
    names.add("this");
  }
  declaredWithin(node, names);
  return names;
}

/** References that are not bindings and not property names. */
function checkModule(path) {
  const source = readFileSync(path, "utf8");
  let ast;
  try {
    ast = parseAst(source, { allowReturnOutsideFunction: true });
  } catch (error) {
    return [{ name: "(파싱 실패)", line: 1, detail: error.message }];
  }

  const moduleScope = ownNames(ast);
  const problems = [];
  const lineOf = (index) => source.slice(0, index).split("\n").length;

  const visit = (node, scopes) => {
    const next = FUNCTIONS.has(node.type) || node.type === "ClassDeclaration"
      ? [...scopes, ownNames(node)]
      : scopes;

    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
      const value = node[key];
      const items = Array.isArray(value) ? value : [value];
      for (const child of items) {
        if (!child || typeof child.type !== "string") continue;

        // Places an identifier is a name rather than a reference.
        if (node.type === "MemberExpression" && key === "property" && !node.computed) continue;
        if (node.type === "Property" && key === "key" && !node.computed) continue;
        if (node.type === "PropertyDefinition" && key === "key" && !node.computed) continue;
        if (node.type === "MethodDefinition" && key === "key" && !node.computed) continue;
        if ((node.type === "LabeledStatement" || node.type === "BreakStatement" ||
             node.type === "ContinueStatement") && key === "label") continue;
        if (node.type === "ExportSpecifier" || node.type === "ImportSpecifier") continue;
        if (node.type === "MetaProperty") continue;

        if (child.type === "Identifier") {
          const name = child.name;
          const known =
            GLOBALS.has(name) ||
            moduleScope.has(name) ||
            next.some((scope) => scope.has(name));
          if (!known) problems.push({ name, line: lineOf(child.start) });
          continue;
        }
        visit(child, next);
      }
    }
  };

  visit(ast, [moduleScope]);

  // One report per name per file: the same missing import used ten times is one
  // thing to fix, not ten.
  const seen = new Map();
  for (const problem of problems) {
    if (!seen.has(problem.name)) seen.set(problem.name, problem);
  }
  return [...seen.values()];
}

const files = DIRS.flatMap((dir) => {
  try {
    return walkFiles(join(ROOT, dir));
  } catch {
    return [];
  }
});

let failed = 0;
for (const file of files) {
  const problems = checkModule(file);
  if (!problems.length) continue;
  failed += problems.length;
  console.log(`\n${relative(ROOT, file)}`);
  for (const problem of problems) {
    console.log(`  ${String(problem.line).padStart(4)}행  ${problem.name}${problem.detail ? " · " + problem.detail : ""}`);
  }
}

console.log(`\n${files.length}개 파일 검사`);
if (failed) {
  console.log(`정의되지 않은 이름 ${failed}건 — import 를 빠뜨렸을 가능성이 높습니다`);
  process.exit(1);
}
console.log("정의되지 않은 이름 없음");
