import { ApplierError } from "./errors.js";
import { validatePatch } from "./validate.js";

/**
 * Apply a typed patch to a Playwright page and return an undo handle.
 *
 * @param {import("playwright").Page} page
 * @param {object} patch  Typed patch object (validated against patch.schema.json)
 * @returns {Promise<{ ok: true, applied: object, undo: () => Promise<void> }>}
 *
 * Each patch_type has a dedicated handler that:
 *   1. Captures the pre-state needed to reverse the change.
 *   2. Applies the change.
 *   3. Returns an async undo() function.
 *
 * Throws ApplierError on:
 *   - schema validation failure
 *   - selector resolving to 0 elements (unless patch type tolerates it)
 *   - browser-side exceptions
 */
export async function applyPatch(page, patch) {
  validatePatch(patch);
  const handler = HANDLERS[patch.patch_type];
  if (!handler) {
    throw new ApplierError(`No handler for patch_type '${patch.patch_type}'`);
  }
  return handler(page, patch);
}

async function applyCssInject(page, patch) {
  const styleId = `repaira11y-patch-${Math.random().toString(36).slice(2, 10)}`;
  const rule = patch.payload.rule;

  await page.evaluate(
    ({ id, rule }) => {
      const style = document.createElement("style");
      style.id = id;
      style.setAttribute("data-repaira11y", "1");
      style.textContent = rule;
      document.head.appendChild(style);
    },
    { id: styleId, rule },
  );

  return {
    ok: true,
    applied: { type: "css_inject", styleId, rule },
    async undo() {
      await page.evaluate((id) => {
        const node = document.getElementById(id);
        if (node) node.remove();
      }, styleId);
    },
  };
}

async function applyAttrSet(page, patch) {
  const { target_selector, payload } = patch;
  const { attribute, value } = payload;

  const handle = await page.$(target_selector);
  if (!handle) {
    throw new ApplierError(
      `attr_set: selector '${target_selector}' matched no element`,
      { selector: target_selector },
    );
  }

  const prior = await handle.evaluate(
    (el, attr) => ({
      had: el.hasAttribute(attr),
      previous: el.getAttribute(attr),
    }),
    attribute,
  );

  await handle.evaluate(
    (el, { attr, val }) => {
      if (val === null || val === undefined) el.removeAttribute(attr);
      else el.setAttribute(attr, val);
    },
    { attr: attribute, val: value },
  );

  return {
    ok: true,
    applied: { type: "attr_set", selector: target_selector, attribute, value },
    async undo() {
      // Element handle survives attribute changes — safe to reuse.
      await handle.evaluate(
        (el, { attr, had, previous }) => {
          if (!had) el.removeAttribute(attr);
          else el.setAttribute(attr, previous);
        },
        { attr: attribute, had: prior.had, previous: prior.previous },
      );
      await handle.dispose();
    },
  };
}

async function applyAttrSetAll(page, patch) {
  const { target_selector, payload } = patch;
  const { attribute, value } = payload;

  const handles = await page.$$(target_selector);
  if (handles.length === 0) {
    throw new ApplierError(
      `attr_set_all: selector '${target_selector}' matched no elements`,
      { selector: target_selector },
    );
  }

  // Capture each element's pre-state so undo can restore them individually.
  const priors = await Promise.all(
    handles.map((h) =>
      h.evaluate(
        (el, attr) => ({
          had: el.hasAttribute(attr),
          previous: el.getAttribute(attr),
        }),
        attribute,
      ),
    ),
  );

  await Promise.all(
    handles.map((h) =>
      h.evaluate(
        (el, { attr, val }) => {
          if (val === null || val === undefined) el.removeAttribute(attr);
          else el.setAttribute(attr, val);
        },
        { attr: attribute, val: value },
      ),
    ),
  );

  return {
    ok: true,
    applied: {
      type: "attr_set_all",
      selector: target_selector,
      attribute,
      value,
      count: handles.length,
    },
    async undo() {
      await Promise.all(
        handles.map((h, i) =>
          h.evaluate(
            (el, { attr, had, previous }) => {
              if (!had) el.removeAttribute(attr);
              else el.setAttribute(attr, previous);
            },
            { attr: attribute, had: priors[i].had, previous: priors[i].previous },
          ),
        ),
      );
      await Promise.all(handles.map((h) => h.dispose()));
    },
  };
}

async function applyStyleOverride(page, patch) {
  const { target_selector, payload } = patch;
  const { property, value } = payload;

  const handle = await page.$(target_selector);
  if (!handle) {
    throw new ApplierError(
      `style_override: selector '${target_selector}' matched no element`,
      { selector: target_selector },
    );
  }

  const prior = await handle.evaluate((el, prop) => ({
    previous: el.style.getPropertyValue(prop),
    priority: el.style.getPropertyPriority(prop),
  }), property);

  await handle.evaluate(
    (el, { prop, val }) => el.style.setProperty(prop, val),
    { prop: property, val: value },
  );

  return {
    ok: true,
    applied: {
      type: "style_override",
      selector: target_selector,
      property,
      value,
    },
    async undo() {
      await handle.evaluate(
        (el, { prop, previous, priority }) => {
          if (previous === "") el.style.removeProperty(prop);
          else el.style.setProperty(prop, previous, priority);
        },
        { prop: property, previous: prior.previous, priority: prior.priority },
      );
      await handle.dispose();
    },
  };
}

async function applyDomReorder(page, patch) {
  const { target_selector, payload } = patch;
  const { parent_selector, insert_before_selector } = payload;

  const handle = await page.$(target_selector);
  if (!handle) {
    throw new ApplierError(
      `dom_reorder: selector '${target_selector}' matched no element`,
      { selector: target_selector },
    );
  }

  const [originalParentHandle, originalNextSiblingHandle] = await Promise.all([
    handle.evaluateHandle((el) => el.parentElement),
    handle.evaluateHandle((el) => el.nextElementSibling),
  ]);

  const newParentHandle = await page.$(parent_selector);
  if (!newParentHandle) {
    throw new ApplierError(
      `dom_reorder: parent_selector '${parent_selector}' matched no element`,
      { parent_selector },
    );
  }
  const newBeforeHandle = insert_before_selector
    ? await page.$(insert_before_selector)
    : null;

  await page.evaluate(
    ({ el, parent, before }) => {
      if (before) parent.insertBefore(el, before);
      else parent.appendChild(el);
    },
    {
      el: handle,
      parent: newParentHandle,
      before: newBeforeHandle,
    },
  );

  return {
    ok: true,
    applied: {
      type: "dom_reorder",
      selector: target_selector,
      parent: parent_selector,
      before: insert_before_selector,
    },
    async undo() {
      await page.evaluate(
        ({ el, parent, sibling }) => {
          if (!parent) return;
          if (sibling) parent.insertBefore(el, sibling);
          else parent.appendChild(el);
        },
        {
          el: handle,
          parent: originalParentHandle,
          sibling: originalNextSiblingHandle,
        },
      );
      await Promise.all([
        handle.dispose(),
        originalParentHandle.dispose(),
        originalNextSiblingHandle?.dispose(),
        newParentHandle?.dispose(),
        newBeforeHandle?.dispose(),
      ]);
    },
  };
}

const HANDLERS = {
  css_inject: applyCssInject,
  attr_set: applyAttrSet,
  attr_set_all: applyAttrSetAll,
  style_override: applyStyleOverride,
  dom_reorder: applyDomReorder,
};
