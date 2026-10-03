export function checkExternalMenuGeometry(observation) {
  const failures = [];
  const { context, field, menu, internalMenu, composer, hitTarget, viewport } =
    observation;
  if (
    !["composer", "standalone"].includes(context) ||
    (context === "composer" && !composer) ||
    ![
      field?.bottom,
      menu?.top,
      menu?.left,
      menu?.right,
      menu?.width,
      menu?.height,
      viewport?.width,
      internalMenu?.width,
      internalMenu?.height,
      ...(composer ? [composer.borderWidth] : []),
    ].every(Number.isFinite)
  )
    return ["Expression menu geometry observation is incomplete"];
  if (menu.width < 44 || menu.height < 44)
    failures.push("Expression menu target is smaller than 44px");
  if (menu.top < field.bottom + 8)
    failures.push("Expression menu must have an 8px gap outside the input box");
  if (menu.left < 0 || menu.right > viewport.width)
    failures.push("Expression menu extends outside the viewport");
  if (!hitTarget)
    failures.push("Another element intercepts the expression menu target");
  if (
    internalMenu.display !== "none" ||
    internalMenu.width !== 0 ||
    internalMenu.height !== 0
  )
    failures.push("The internal expression menu toggle is still visible");
  if (composer && (composer.borderWidth !== 0 || composer.boxShadow !== "none"))
    failures.push("Expression-box framing still encloses the menu action bar");
  return failures;
}

// Actual browser observations only; synthetic fixtures test this detector, not UI.
export function checkKeyboardActionRow(observation) {
  const { buttons, tools, keyboardPaintTop, caret, viewport } = observation;
  const names = [
    "Expression menu",
    "Structures & editing",
    "Math keyboard",
    "Calculate",
  ];
  const rectValid = (r) =>
    r &&
    [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.width > 0 &&
    r.height > 0;
  if (
    !names.every((name) => rectValid(buttons?.[name]?.rect)) ||
    !rectValid(tools) ||
    !rectValid(caret) ||
    !Number.isFinite(keyboardPaintTop) ||
    !Number.isFinite(viewport?.width) ||
    !Number.isFinite(viewport?.height)
  )
    return ["Keyboard action-row observation is incomplete"];
  const overlap = (a, b) =>
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
  const failures = [];
  for (const name of names) {
    const { rect, hits } = buttons[name];
    if (rect.height < 44 || (name === "Math keyboard" && rect.width < 44))
      failures.push(name + " target is smaller than44px");
    if (
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.width > viewport.width ||
      rect.y + rect.height > keyboardPaintTop
    )
      failures.push(name + " target is outside keyboard-free viewport");
    if (
      !Array.isArray(hits) ||
      hits.length !== 9 ||
      hits.some((hit) => hit !== true)
    )
      failures.push(
        name + " interior8px/edge-midpoint/center hits are not all correct",
      );
  }
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++)
      if (overlap(buttons[names[i]].rect, buttons[names[j]].rect))
        failures.push(names[i] + " overlaps " + names[j]);
  for (const name of ["Math keyboard", "Calculate"])
    if (overlap(tools, buttons[name].rect))
      failures.push("Editor tools container overlaps " + name);
  if (
    caret.x < 0 ||
    caret.y < 0 ||
    caret.x + caret.width > viewport.width ||
    caret.y + caret.height >
      Math.min(keyboardPaintTop, ...names.map((name) => buttons[name].rect.y))
  )
    failures.push("Tall expression caret is not visible above action row");
  return failures;
}
