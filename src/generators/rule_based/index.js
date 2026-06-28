import { generate as sc_2_4_3 } from "./sc_2_4_3.js";
import { generate as sc_2_4_7 } from "./sc_2_4_7.js";
import { generate as sc_2_4_11 } from "./sc_2_4_11.js";
import { generate as sc_2_4_12 } from "./sc_2_4_12.js";
import { generate as sc_2_4_13 } from "./sc_2_4_13.js";

const SC_GENERATORS = {
  "2.4.3": sc_2_4_3,
  "2.4.7": sc_2_4_7,
  "2.4.11": sc_2_4_11,
  "2.4.12": sc_2_4_12,
  "2.4.13": sc_2_4_13,
};

export function generate(args) {
  const sc = args?.violation?.sc;
  const fn = SC_GENERATORS[sc];
  if (!fn) return null;
  return fn(args);
}

/**
 * Drop-in async generator for repairLoop({ generator: ... }).
 */
export const ruleBasedGenerator = {
  generate: async (args) => generate(args),
};

export { generate as sc_2_4_3 } from "./sc_2_4_3.js";
export {
  generate as sc_2_4_7,
} from "./sc_2_4_7.js";
export { generate as sc_2_4_11 } from "./sc_2_4_11.js";
export { generate as sc_2_4_12 } from "./sc_2_4_12.js";
export { generate as sc_2_4_13 } from "./sc_2_4_13.js";
