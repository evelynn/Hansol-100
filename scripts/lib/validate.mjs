import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../schemas/board-v1.schema.json"), "utf8")
);

// Schema declares $schema: draft/2020-12, so the Ajv2020 build is required
// (the default "ajv" export only understands draft-07 meta-schemas). Ajv is
// the only npm dependency of the whole product; when it is absent (a Skill
// checkout without `npm install`), the built-in validator below covers the
// same board-v1 contract so rendering, the CLI and the service keep working.
let ajvValidate = null;
try {
  const mod = require("ajv/dist/2020.js");
  const Ajv2020 = mod.default ?? mod;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajvValidate = ajv.compile(schema);
} catch {
  ajvValidate = null;
}

export const VALIDATOR = ajvValidate ? "ajv" : "builtin";

export function validateBoard(board) {
  if (ajvValidate) {
    const valid = ajvValidate(board);
    return { valid, errors: valid ? [] : ajvValidate.errors, validator: "ajv" };
  }
  const errors = validateBoardBuiltin(board);
  return { valid: errors.length === 0, errors, validator: "builtin" };
}

// Hand-written mirror of schemas/board-v1.schema.json. Produces ajv-shaped
// errors ({ instancePath, message, params }) so callers cannot tell the two
// validators apart.
const EMPHASIS = ["lead", "key", "bottleneck", "loop", "normal"];
const EDGE_TYPES = ["sequence", "message", "loop"];

export function validateBoardBuiltin(board) {
  const errors = [];
  const push = (instancePath, message, params = {}) => errors.push({ instancePath, message, params });
  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const nonEmptyString = (value, at) => {
    if (typeof value !== "string") return push(at, "must be string", { type: "string" });
    if (value.length < 1) return push(at, "must NOT have fewer than 1 characters", { limit: 1 });
    return true;
  };
  const optionalString = (value, at) => {
    if (value !== undefined && typeof value !== "string") push(at, "must be string", { type: "string" });
  };
  const stringList = (value, at) => {
    if (!Array.isArray(value)) return push(at, "must be array", { type: "array" });
    if (value.length < 1) push(at, "must NOT have fewer than 1 items", { limit: 1 });
    value.forEach((item, i) => nonEmptyString(item, `${at}/${i}`));
    return true;
  };

  if (!isObject(board)) {
    push("", "must be object", { type: "object" });
    return errors;
  }
  for (const key of ["schema_version", "title", "lanes", "stages", "nodes", "edges"]) {
    if (board[key] === undefined) push("", `must have required property '${key}'`, { missingProperty: key });
  }
  if (board.schema_version !== undefined && board.schema_version !== 1) push("/schema_version", "must be equal to constant", { allowedValue: 1 });
  if (board.title !== undefined) nonEmptyString(board.title, "/title");
  optionalString(board.subtitle, "/subtitle");
  if (board.profile !== undefined) nonEmptyString(board.profile, "/profile");
  if (board.lanes !== undefined) stringList(board.lanes, "/lanes");
  if (board.stages !== undefined) stringList(board.stages, "/stages");

  if (board.nodes !== undefined) {
    if (!Array.isArray(board.nodes)) push("/nodes", "must be array", { type: "array" });
    else board.nodes.forEach((node, i) => {
      const at = `/nodes/${i}`;
      if (!isObject(node)) return push(at, "must be object", { type: "object" });
      for (const key of ["id", "lane", "stage", "label"]) {
        if (node[key] === undefined) push(at, `must have required property '${key}'`, { missingProperty: key });
        else nonEmptyString(node[key], `${at}/${key}`);
      }
      if (node.emphasis !== undefined && !EMPHASIS.includes(node.emphasis)) push(`${at}/emphasis`, "must be equal to one of the allowed values", { allowedValues: EMPHASIS });
      optionalString(node.note, `${at}/note`);
      if (node.refs !== undefined) {
        if (!Array.isArray(node.refs)) push(`${at}/refs`, "must be array", { type: "array" });
        else node.refs.forEach((ref, r) => {
          const refAt = `${at}/refs/${r}`;
          if (!isObject(ref)) return push(refAt, "must be object", { type: "object" });
          if (ref.source === undefined) push(refAt, "must have required property 'source'", { missingProperty: "source" });
          else optionalString(ref.source, `${refAt}/source`);
          optionalString(ref.note, `${refAt}/note`);
        });
      }
    });
  }

  if (board.edges !== undefined) {
    if (!Array.isArray(board.edges)) push("/edges", "must be array", { type: "array" });
    else board.edges.forEach((edge, i) => {
      const at = `/edges/${i}`;
      if (!isObject(edge)) return push(at, "must be object", { type: "object" });
      for (const key of ["id", "source", "target"]) {
        if (edge[key] === undefined) push(at, `must have required property '${key}'`, { missingProperty: key });
        else nonEmptyString(edge[key], `${at}/${key}`);
      }
      if (edge.type !== undefined && !EDGE_TYPES.includes(edge.type)) push(`${at}/type`, "must be equal to one of the allowed values", { allowedValues: EDGE_TYPES });
      optionalString(edge.label, `${at}/label`);
    });
  }
  return errors;
}

// Checks the schema can't express: references between lanes/stages/nodes/edges.
// Returns an array of human-readable problems (empty = clean). Assumes the board
// already passed schema validation (arrays/fields present).
export function checkReferentialIntegrity(board) {
  const problems = [];
  const lanes = new Set(board.lanes);
  const stages = new Set(board.stages);

  const nodeIds = new Set();
  for (const node of board.nodes) {
    if (nodeIds.has(node.id)) problems.push(`duplicate node id "${node.id}"`);
    nodeIds.add(node.id);
    if (!lanes.has(node.lane)) {
      problems.push(`node "${node.id}" references lane "${node.lane}" which is not in lanes [${board.lanes.join(", ")}]`);
    }
    if (!stages.has(node.stage)) {
      problems.push(`node "${node.id}" references stage "${node.stage}" which is not in stages [${board.stages.join(", ")}]`);
    }
  }

  const edgeIds = new Set();
  for (const edge of board.edges) {
    if (edgeIds.has(edge.id)) problems.push(`duplicate edge id "${edge.id}"`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      problems.push(`edge "${edge.id}" source "${edge.source}" is not a node id`);
    }
    if (!nodeIds.has(edge.target)) {
      problems.push(`edge "${edge.id}" target "${edge.target}" is not a node id`);
    }
  }

  return problems;
}
