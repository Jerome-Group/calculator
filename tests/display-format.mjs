import assert from "node:assert/strict";
import {
  formatDisplayMath,
  formatDisplayApprox,
  formatNumericAssignmentMath,
} from "../lib/calculator/display-format.ts";
import { DEFAULT_SETTINGS, newNotebook } from "../lib/calculator/types.ts";
import { validateState } from "../lib/calculator/storage.ts";

assert.equal(formatDisplayMath("1.1234567895"), "1.12345679");
assert.equal(formatDisplayMath("-1.1234567895"), "-1.12345679");
assert.equal(formatDisplayMath("99.9999999995"), "100");
assert.equal(formatDisplayMath("-0.0000000000"), "0");
assert.equal(
  formatDisplayMath("0.00000000000123456789123"),
  "1.234567891 \\times 10^{-12}",
);
assert.equal(formatDisplayMath("1.9999999999e-20"), "2 \\times 10^{-20}");
assert.equal(formatDisplayMath("9.9999999999e-20"), "1 \\times 10^{-19}");
assert.equal(
  formatDisplayMath("1.1234567891234567891234567891235", 30),
  "1.123456789123456789123456789124",
);
assert.equal(
  formatDisplayMath("12345678901234567890.1234567899"),
  "12345678901234567890.12345679",
);
assert.equal(formatDisplayMath("2.5", 0), "3");
assert.equal(formatDisplayMath("0.0001", 0), "1 \\times 10^{-4}");
for (const source of [
  "\\frac{1}{3}",
  "123456789012345678901234567890",
  "\\sqrt{2}",
  "\\pi",
  "x + 1.123456789123",
  "\\text{1.123456789123}",
]) {
  assert.equal(formatDisplayMath(source), source);
}
assert.equal(
  formatDisplayMath("1.123456789123 + 2.987654321987 i"),
  "1.123456789 + 2.987654322 i",
);
assert.equal(
  formatDisplayMath(
    "\\left[\\begin{matrix}1.123456789123 & 2\\\\0.000000000001 & -0.0\\end{matrix}\\right]",
  ),
  "\\left[\\begin{matrix}1.123456789 & 2\\\\1 \\times 10^{-12} & 0\\end{matrix}\\right]",
);
assert.equal(
  formatDisplayApprox("Matrix([[1.123456789123, -0.0], [1.0e-50, 2]])"),
  "Matrix([[1.123456789, 0], [1e-50, 2]])",
);
assert.equal(
  formatDisplayApprox("1.123456789123 + 2.987654321987*I"),
  "1.123456789 + 2.987654322*I",
);
assert.equal(formatDisplayApprox("1/3"), "1/3");
assert.equal(formatDisplayApprox("x + 1.123456789123"), "x + 1.123456789123");

assert.equal(
  formatNumericAssignmentMath("x = -1.123456789123"),
  "x = -1.123456789",
);
assert.equal(
  formatNumericAssignmentMath("x_{1} = 0.000000000000123456789123"),
  "x_{1} = 1.234567891 \\times 10^{-13}",
);
assert.equal(
  formatNumericAssignmentMath("y = 1.1234567891234567891234567891235", 30),
  "y = 1.123456789123456789123456789124",
);
for (const source of [
  "x = 1.123456789123*y",
  "x + 1.123456789123",
  "f(x) = 1.123456789123",
  "x = \\frac{1}{3}",
]) {
  assert.equal(formatNumericAssignmentMath(source), source);
}
assert.equal(formatDisplayMath("x = 1.123456789123"), "x = 1.123456789123");
assert.equal(formatDisplayApprox("1.123456789123"), "1.123456789");
assert.equal(
  formatDisplayApprox("Slope: 1.123456789123"),
  "Slope: 1.123456789123",
);

assert.equal(DEFAULT_SETTINGS.precision, 30);
assert.equal(DEFAULT_SETTINGS.displayDecimals, 9);
const notebook = newNotebook();
const state = {
  version: 1,
  notebooks: [notebook],
  active: notebook.id,
  settings: { ...DEFAULT_SETTINGS },
};
for (const precision of [5, 30, 100, 200]) {
  for (const displayDecimals of [undefined, 0, 9, 30]) {
    const saved = JSON.parse(
      JSON.stringify({
        ...state,
        settings: { ...state.settings, precision, displayDecimals },
      }),
    );
    assert.equal(validateState(saved).settings.precision, precision);
    assert.equal(
      validateState(saved).settings.displayDecimals,
      displayDecimals,
    );
  }
}
for (const displayDecimals of [-1, 31, 9.5, "9", null]) {
  assert.throws(() =>
    validateState({
      ...state,
      settings: { ...state.settings, displayDecimals },
    }),
  );
}
console.log("Display rounding and legacy precision persistence passed.");
