import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../schemas/board-v1.schema.json"), "utf8")
);
// Schema declares $schema: draft/2020-12, so the Ajv2020 build is required
// (the default "ajv" export only understands draft-07 meta-schemas).
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

export function validateBoard(board) {
  const valid = validate(board);
  return { valid, errors: valid ? [] : validate.errors };
}
