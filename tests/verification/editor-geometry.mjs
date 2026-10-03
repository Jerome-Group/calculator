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
