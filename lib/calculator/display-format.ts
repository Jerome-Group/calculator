export const DEFAULT_DISPLAY_DECIMALS = 9;
export const MAX_DISPLAY_DECIMALS = 30;

function displayDecimals(value: number): number {
  return Number.isInteger(value) && value >= 0 && value <= MAX_DISPLAY_DECIMALS
    ? value
    : DEFAULT_DISPLAY_DECIMALS;
}

function incrementDigits(digits: string): string {
  return (BigInt(digits || "0") + BigInt(1)).toString();
}

function roundFixed(digits: string, point: number, decimals: number): string {
  const keep = point + decimals;
  let retained = keep > 0 ? digits.slice(0, keep).padEnd(keep, "0") : "0";
  const next = keep >= 0 ? digits[keep] : "0";
  if (next && next >= "5") retained = incrementDigits(retained);
  retained = retained.padStart(decimals + 1, "0");
  const integer = retained.slice(0, retained.length - decimals) || "0";
  const fraction = decimals ? retained.slice(-decimals).replace(/0+$/, "") : "";
  return fraction ? `${integer}.${fraction}` : integer;
}

function roundDecimal(token: string, decimals: number, latex: boolean): string {
  const match = /^([+-]?)(\d*)\.(\d+)(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return token;
  const [, sign, integer, fraction, exponentText] = match;
  const exponent = Number(exponentText || 0);
  if (!Number.isSafeInteger(exponent)) return token;
  const raw = integer + fraction;
  const first = raw.search(/[1-9]/);
  if (first < 0) return "0";
  const digits = raw.slice(first);
  const point = integer.length + exponent - first;
  const scientific = exponentText !== undefined || point <= -decimals;
  if (!scientific) {
    const rounded = roundFixed(digits, point, decimals);
    return (sign === "-" && rounded !== "0" ? "-" : "") + rounded;
  }
  let coefficient = roundFixed(digits, 1, decimals);
  let power = point - 1;
  if (coefficient === "10") {
    coefficient = "1";
    power += 1;
  }
  const prefix = sign === "-" ? "-" : "";
  if (power === 0) return prefix + coefficient;
  return latex
    ? `${prefix}${coefficient} \\times 10^{${power}}`
    : `${prefix}${coefficient}e${power}`;
}

function removeNegativeZero(text: string): string {
  return text.replace(
    /(^|[\[({,=;&\\])(\s*)-0(?=$|[\s),}\]\\&])/g,
    (_, prefix: string, spacing: string) => prefix + spacing + "0",
  );
}

const DECIMAL = /(?<![\w.])(?:\d+\.\d+|\.\d+)(?:[eE][+-]?\d+)?(?![\w.])/g;

function numericMath(latex: string): boolean {
  const remainder = latex
    .replace(/\\(?:begin|end)\{(?:[pbvBV]?matrix|array)\}/g, "")
    .replace(
      /\\(?:left|right|cdot|times|frac|sqrt|mathrm|operatorname|,|;|!|\\)/g,
      "",
    )
    .replace(DECIMAL, "0")
    .replace(/[iI]/g, "");
  return !/[A-Za-z\\]/.test(remainder);
}

export function formatDisplayMath(
  latex: string,
  decimals = DEFAULT_DISPLAY_DECIMALS,
): string {
  if (!numericMath(latex)) return latex;
  const places = displayDecimals(decimals);
  return removeNegativeZero(
    latex.replace(DECIMAL, (token) => roundDecimal(token, places, true)),
  );
}

export function formatDisplayApprox(
  source: string,
  decimals = DEFAULT_DISPLAY_DECIMALS,
): string {
  const remainder = source
    .replace(/\bMatrix\b/g, "")
    .replace(DECIMAL, "0")
    .replace(/[iI]/g, "");
  if (/[A-Za-z\\]/.test(remainder)) return source;
  const places = displayDecimals(decimals);
  return removeNegativeZero(
    source.replace(DECIMAL, (token) => roundDecimal(token, places, false)),
  );
}

export function formatNumericAssignmentMath(
  latex: string,
  decimals = DEFAULT_DISPLAY_DECIMALS,
): string {
  const assignment =
    /^(\s*(?:[A-Za-z][A-Za-z0-9]*|\\[A-Za-z]+)(?:_\{[A-Za-z0-9]+\}|_[A-Za-z0-9])?\s*=\s*)([^=]+)$/.exec(
      latex,
    );
  return assignment && numericMath(assignment[2])
    ? assignment[1] + formatDisplayMath(assignment[2], decimals)
    : formatDisplayMath(latex, decimals);
}
