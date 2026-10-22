import type { InvestigationLab } from "./investigations";
export const investigationLabs: InvestigationLab[] = [
  {
    id: "singular-matrix",
    version: 1,
    title: "When a matrix becomes singular",
    summary:
      "Compare area, rank and solvability across a small coefficient change.",
    definitions: [
      { name: "a", expression: "2", kind: "expression" },
      { name: "A", expression: "Matrix([[1,1],[1,a]])", kind: "matrix" },
    ],
    settings: { domain: "real" },
    plan: {
      question:
        "How can a small coefficient change alter solvability and solution size?",
      guide:
        "The same right-hand side is used in every case. Compare determinant, rank and the actual solution. At a = 1 the two left sides agree but the right sides differ, so there is no solution. A mathematical error returned by the engine is evidence for that case; a worker interruption leaves a missing cell. Edit A in Objects to investigate another family.",
      parameters: ["a"],
      cases: [
        { id: "regular", label: "Regular", values: { a: "2" } },
        { id: "singular", label: "Singular", values: { a: "1" } },
        { id: "near", label: "Nearly singular", values: { a: "1001/1000" } },
      ],
      steps: [
        {
          id: "determinant",
          question: "How much area does A preserve?",
          request: {
            operation: "matrix_det",
            input: "A",
            mode: "text",
            params: { expression: "A" },
          },
        },
        {
          id: "rank",
          question: "How many independent rows remain?",
          request: {
            operation: "matrix_rank",
            input: "A",
            mode: "text",
            params: { expression: "A" },
          },
        },
        {
          id: "solve",
          question: "Solve the same right-hand side.",
          request: {
            operation: "matrix_solve",
            input: "A",
            mode: "text",
            params: { expression: "A", rhs: "[[2],[3]]" },
          },
        },
      ],
    },
  },
  {
    id: "derivative-approximations",
    version: 1,
    title: "Two derivative approximations",
    summary:
      "Compare shrinking steps, central differences and a forward difference.",
    definitions: [{ name: "h", expression: "1/10", kind: "expression" }],
    settings: { angle: "rad", precision: 30 },
    plan: {
      question:
        "What changes when the step shrinks, and what does an error estimate establish?",
      guide:
        "The reference is cos(1), the derivative of sin(x) at 1. If you edit the function, edit that reference too. The central-difference tool also compares halved steps; its central difference result uses h/2 while the step comparison measures the change from h. Compare its full details with the forward formula. For this smooth example central error is order h^2 and forward error order h. A numerical estimate supplies evidence, not a rigorous bound. Try an additional case with h = 0.",
      parameters: ["h"],
      cases: [
        { id: "tenth", label: "h = 1/10", values: { h: "1/10" } },
        { id: "hundredth", label: "h = 1/100", values: { h: "1/100" } },
        { id: "thousandth", label: "h = 1/1000", values: { h: "1/1000" } },
      ],
      steps: [
        {
          id: "reference",
          question: "Calculate the reference derivative.",
          request: {
            operation: "substitute",
            input: "cos(x)",
            mode: "text",
            params: { expression: "cos(x)", substitutions: "{x:1}" },
          },
        },
        {
          id: "central",
          question: "Estimate by a central difference with refinement.",
          request: {
            operation: "numeric_derivative",
            input: "sin(x)",
            mode: "text",
            params: {
              expression: "sin(x)",
              variable: "x",
              point: "1",
              step: "h",
            },
          },
        },
        {
          id: "forward",
          question: "Estimate by a forward difference.",
          request: {
            operation: "approx",
            input: "(sin(1+h)-sin(1))/h",
            mode: "text",
            params: { expression: "(sin(1+h)-sin(1))/h" },
          },
        },
      ],
    },
  },
  {
    id: "path-limits",
    version: 1,
    title: "Agreement along a few paths",
    summary:
      "Use paths to challenge a two-variable limit, and separate evidence from proof.",
    definitions: [
      { name: "f", expression: "x*y/(x^2+y^2)", kind: "function", args: "x,y" },
      { name: "m", expression: "0", kind: "expression" },
    ],
    settings: { domain: "real" },
    plan: {
      question:
        "Can several plausible approaches establish a two-variable limit?",
      guide:
        "Each case follows the straight line y = mx. Two unequal path limits disprove existence of the multivariable limit. Several equal samples, or several equal path limits, cannot prove existence. Change f in Objects or the slope cases to investigate another function.",
      parameters: ["m"],
      cases: [
        { id: "axis", label: "Along y = 0", values: { m: "0" } },
        { id: "diagonal", label: "Along y = x", values: { m: "1" } },
        { id: "steeper", label: "Along y = 2x", values: { m: "2" } },
      ],
      steps: [
        {
          id: "far",
          question: "Sample farther along y = mx.",
          request: {
            operation: "substitute",
            input: "f(x,y)",
            mode: "text",
            params: { expression: "f(x,y)", substitutions: "{x:1/10,y:m/10}" },
          },
        },
        {
          id: "near",
          question: "Sample closer along y = mx.",
          request: {
            operation: "substitute",
            input: "f(x,y)",
            mode: "text",
            params: {
              expression: "f(x,y)",
              substitutions: "{x:1/100,y:m/100}",
            },
          },
        },
        {
          id: "limit",
          question: "Calculate each path’s limit.",
          request: {
            operation: "limit",
            input: "f(t,m*t)",
            mode: "text",
            params: {
              expression: "f(t,m*t)",
              variable: "t",
              point: "0",
              direction: "+-",
            },
          },
        },
      ],
    },
  },
  {
    id: "probability-tails",
    version: 1,
    title: "Inclusive probability tails",
    summary:
      "Compare one-integer tail changes and a normal continuity correction.",
    definitions: [
      { name: "n", expression: "20", kind: "expression" },
      { name: "p", expression: "1/2", kind: "expression" },
      { name: "k", expression: "10", kind: "expression" },
    ],
    settings: { domain: "real" },
    plan: {
      question:
        "When does one integer or a continuity correction change a tail probability?",
      guide:
        "For a discrete variable, the survival function at k is P(X > k). An inclusive P(X ≥ k) uses k − 1. The difference is the probability mass at k. The normal comparison uses k − 1/2 as a continuity correction and can be poor in the far tail. Distribution tools report numerical results; that status is retained. Change n or p in Objects for another run.",
      parameters: ["k"],
      cases: [
        { id: "middle", label: "At the mean", values: { k: "10" } },
        { id: "tail", label: "Upper tail", values: { k: "15" } },
        { id: "far-tail", label: "Far tail", values: { k: "18" } },
      ],
      steps: [
        {
          id: "inclusive",
          question: "Calculate P(X ≥ k), X binomial.",
          request: {
            operation: "distribution",
            input: "",
            mode: "text",
            params: {
              distribution: "binomial",
              parameters: "[n,p]",
              action: "sf",
              value: "k-1",
            },
          },
        },
        {
          id: "strict",
          question: "Calculate the strict tail P(X > k).",
          request: {
            operation: "distribution",
            input: "",
            mode: "text",
            params: {
              distribution: "binomial",
              parameters: "[n,p]",
              action: "sf",
              value: "k",
            },
          },
        },
        {
          id: "normal",
          question: "Compare a normal approximation with correction.",
          request: {
            operation: "distribution",
            input: "",
            mode: "text",
            params: {
              distribution: "normal",
              parameters: "[n*p,sqrt(n*p*(1-p))]",
              action: "sf",
              value: "k-1/2",
            },
          },
        },
      ],
    },
  },
];
