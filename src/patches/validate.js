import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ApplierError } from "./errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "..", "schemas", "patch.schema.json");

let validator;

function getValidator() {
  if (!validator) {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv({ strict: false });
    validator = ajv.compile(schema);
  }
  return validator;
}

export function validatePatch(patch) {
  const validate = getValidator();
  if (!validate(patch)) {
    throw new ApplierError(
      `Patch failed schema validation: ${JSON.stringify(validate.errors)}`,
      { errors: validate.errors, patch },
    );
  }
  return true;
}
