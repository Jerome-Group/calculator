import type { Operation } from "./types";

// Each operation retains its complete editable problem in history.
export const operations: Operation[] = [
  {
    id: "simplify",
    name: "Simplify",
    category: "Algebra",
    description:
      "Combine terms and simplify while retaining the original input.",
    keywords: "simplify algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2-5*x+6",
      },
    ],
  },
  {
    id: "expand",
    name: "Expand",
    category: "Algebra",
    description: "Expand products and powers.",
    keywords: "expand algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "(x+1)^3",
      },
    ],
  },
  {
    id: "factor",
    name: "Factor",
    category: "Algebra",
    description: "Factor an expression over its coefficient field.",
    keywords: "factor algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2-5*x+6",
      },
    ],
  },
  {
    id: "apart",
    name: "Partial fractions",
    category: "Algebra",
    description: "Decompose a rational expression.",
    keywords: "apart algebra",
    fields: [
      {
        key: "variable",
        label: "Variable",
        value: "x",
        hint: "The variable whose denominator is decomposed.",
      },
      {
        key: "expression",
        label: "Expression",
        value: "(2*x+3)/(x^2+3*x+2)",
      },
    ],
  },
  {
    id: "cancel",
    name: "Cancel common factors",
    category: "Algebra",
    description:
      "Simplify a rational expression while retaining excluded points.",
    keywords: "cancel algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "(x^2-1)/(x-1)",
      },
    ],
  },
  {
    id: "trigsimp",
    name: "Trigonometric simplification",
    category: "Algebra",
    description: "Apply trigonometric identities.",
    keywords: "trigsimp algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "sin(x)^2+cos(x)^2",
      },
    ],
  },
  {
    id: "approx",
    name: "Numerical value",
    category: "Algebra",
    description: "Evaluate using the selected decimal precision.",
    keywords: "approx algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2-5*x+6",
      },
    ],
  },
  {
    id: "substitute",
    name: "Substitute values",
    category: "Algebra",
    description:
      "Replace variables simultaneously; saved definitions work here too.",
    keywords: "substitute algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2+y",
      },
      {
        key: "substitutions",
        label: "Replacements",
        value: "{x:2,y:3}",
      },
    ],
  },
  {
    id: "solve",
    name: "Solve for a variable",
    category: "Algebra",
    description: "Find a solution set in the selected real or complex domain.",
    keywords: "equation roots zeros chosen variable",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2-5*x+6",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
    ],
  },
  {
    id: "system",
    name: "Solve a system",
    category: "Algebra",
    description:
      "Enter equations or expressions equal to zero; choose the system type.",
    keywords: "system algebra",
    fields: [
      {
        key: "equations",
        label: "Equations",
        value: "[x+y-3,x-y-1]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
      {
        key: "kind",
        label: "System type",
        value: "linear",
        choices: ["linear", "nonlinear"],
      },
    ],
  },
  {
    id: "inequality",
    name: "Solve inequalities",
    category: "Algebra",
    description: "Reduce simultaneous real inequalities in a chosen variable.",
    keywords: "inequality algebra",
    fields: [
      {
        key: "inequalities",
        label: "Inequalities",
        value: "[x^2<4,x>0]",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
    ],
  },
  {
    id: "differentiate",
    name: "Differentiate",
    category: "Calculus",
    description:
      "Ordinary or partial derivatives; repeat for mixed derivatives.",
    keywords: "derivative partial slope rate",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "sin(x)*exp(x)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "order",
        label: "Derivative order",
        value: "1",
      },
    ],
  },
  {
    id: "integrate",
    name: "Integrate",
    category: "Calculus",
    description: "Leave both bounds blank for an antiderivative with C.",
    keywords: "antiderivative area improper special functions erf",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "exp(-x^2)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "lower",
        label: "Lower bound",
        value: "",
        hint: "Leave both bounds empty for an antiderivative. Use oo or -oo for infinite bounds.",
      },
      {
        key: "upper",
        label: "Upper bound",
        value: "",
      },
    ],
  },
  {
    id: "multiple_integral",
    name: "Double / triple integral",
    category: "Calculus",
    description: "Editable dependent bounds, applied innermost first.",
    keywords: "double triple volume dependent integration order",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x+y",
      },
      {
        key: "bounds",
        label: "Bounds, innermost first",
        value: "[(y,0,x),(x,0,1)]",
        hint: "Triple example: [(z,0,y),(y,0,x),(x,0,1)]. Each inner bound may depend on outer variables.",
      },
    ],
  },
  {
    id: "limit",
    name: "Limit",
    category: "Calculus",
    description: "Choose the approach point and side; oo denotes infinity.",
    keywords: "limit calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "sin(x)/x",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "point",
        label: "Approach point",
        value: "0",
      },
      {
        key: "direction",
        label: "Approach direction",
        value: "+-",
        choices: ["+-", "+", "-"],
        hint: "+- means both sides; + approaches from the right, - from the left.",
      },
    ],
  },
  {
    id: "series",
    name: "Taylor / Laurent series",
    category: "Analysis",
    description: "Expand through the term before the specified order.",
    keywords: "Taylor Laurent Maclaurin power asymptotic",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "exp(x)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "point",
        label: "Expansion point",
        value: "0",
      },
      {
        key: "order",
        label: "Expansion order",
        value: "6",
      },
      {
        key: "direction",
        label: "Approach direction",
        value: "+",
        choices: ["+", "-"],
      },
    ],
  },
  {
    id: "sum",
    name: "Summation",
    category: "Calculus",
    description:
      "Finite or infinite exact sum where the engine can resolve it.",
    keywords: "sum calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "1/n^2",
      },
      {
        key: "variable",
        label: "Variable",
        value: "n",
      },
      {
        key: "lower",
        label: "Lower bound",
        value: "1",
      },
      {
        key: "upper",
        label: "Upper bound",
        value: "oo",
      },
    ],
  },
  {
    id: "product",
    name: "Product",
    category: "Calculus",
    description: "Finite or infinite product.",
    keywords: "product calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "n",
      },
      {
        key: "variable",
        label: "Variable",
        value: "n",
      },
      {
        key: "lower",
        label: "Lower bound",
        value: "1",
      },
      {
        key: "upper",
        label: "Upper bound",
        value: "10",
      },
    ],
  },
  {
    id: "convergence",
    name: "Series convergence",
    category: "Analysis",
    description:
      "Supported convergence tests; undecided cases remain unresolved.",
    keywords: "convergence analysis",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "1/n^2",
      },
      {
        key: "variable",
        label: "Variable",
        value: "n",
      },
      {
        key: "lower",
        label: "Lower bound",
        value: "1",
      },
    ],
  },
  {
    id: "sequence_limit",
    name: "Sequence limit",
    category: "Analysis",
    description: "Limit as the index tends to positive infinity.",
    keywords: "sequence limit analysis",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "(1+1/n)^n",
      },
      {
        key: "variable",
        label: "Variable",
        value: "n",
      },
    ],
  },
  {
    id: "multilimit",
    name: "Compare multivariable limit paths",
    category: "Analysis",
    description: "Disagreement disproves a limit; agreement is only evidence.",
    keywords: "multilimit analysis",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x*y/(x^2+y^2)",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
      {
        key: "paths",
        label: "Paths in the listed coordinates",
        value: "[[t,0],[0,t],[t,t]]",
      },
      {
        key: "parameter",
        label: "Path parameter",
        value: "t",
      },
      {
        key: "point",
        label: "Parameter approach point",
        value: "0",
      },
    ],
  },
  {
    id: "residue",
    name: "Complex residue",
    category: "Analysis",
    description: "Coefficient of the simple-pole term at the chosen point.",
    keywords: "complex poles contour",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "exp(z)/z^2",
      },
      {
        key: "variable",
        label: "Variable",
        value: "z",
      },
      {
        key: "point",
        label: "Point",
        value: "0",
      },
    ],
  },
  {
    id: "singularities",
    name: "Find singularities",
    category: "Analysis",
    description:
      "Find supported isolated singularities in the selected domain.",
    keywords: "singularities analysis",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "1/(x^2-1)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
    ],
  },
  {
    id: "domain",
    name: "Continuous real domain",
    category: "Analysis",
    description: "Compute supported continuity restrictions.",
    keywords: "excluded points continuity undefined",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "sqrt(x)/(x-1)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
    ],
  },
  {
    id: "matrix_det",
    name: "Determinant",
    category: "Matrices",
    description: "Signed volume scale; zero means a square matrix is singular.",
    keywords: "matrix det matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_inverse",
    name: "Inverse",
    category: "Matrices",
    description:
      "Find A\u207b\u00b9 so AA\u207b\u00b9 = I. Requires a square, nonsingular matrix.",
    keywords: "matrix inverse matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_transpose",
    name: "Transpose",
    category: "Matrices",
    description:
      "Exact or symbolic matrix operation; review any exceptional parameter conditions.",
    keywords: "matrix transpose matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_adjoint",
    name: "Hermitian adjoint",
    category: "Matrices",
    description:
      "Conjugate transpose Aᴴ, distinct from the classical adjugate.",
    keywords: "Hermitian conjugate transpose",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_adjugate",
    name: "Classical adjugate",
    category: "Matrices",
    description:
      "Transpose of the cofactor matrix, including singular square matrices.",
    keywords: "classical cofactor transpose",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_cofactors",
    name: "Cofactor matrix",
    category: "Matrices",
    description:
      "Exact or symbolic matrix operation; review any exceptional parameter conditions.",
    keywords: "matrix cofactors matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_rref",
    name: "Row reduction (RREF)",
    category: "Matrices",
    description:
      "Reduce a matrix using row operations to expose pivots and solutions.",
    keywords: "Gaussian elimination row operations",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_rank",
    name: "Rank",
    category: "Matrices",
    description: "Count linearly independent columns (or rows).",
    keywords: "matrix rank matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_null",
    name: "Null space",
    category: "Matrices",
    description: "Find a basis for vectors v satisfying Av = 0.",
    keywords: "kernel basis nullspace",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_row",
    name: "Row space",
    category: "Matrices",
    description:
      "Exact or symbolic matrix operation; review any exceptional parameter conditions.",
    keywords: "matrix row matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_column",
    name: "Column space",
    category: "Matrices",
    description:
      "Exact or symbolic matrix operation; review any exceptional parameter conditions.",
    keywords: "image range basis",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_eigenvalues",
    name: "Eigenvalues",
    category: "Matrices",
    description:
      "Find scalars \u03bb for which Av = \u03bbv has a nonzero solution.",
    keywords: "matrix eigenvalues matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_eigenvectors",
    name: "Eigenvectors",
    category: "Matrices",
    description: "Find a basis of eigenvectors for each eigenvalue.",
    keywords: "matrix eigenvectors matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_lu",
    name: "LU decomposition",
    category: "Matrices",
    description:
      "Factor a row-permuted matrix into lower and upper triangular factors.",
    keywords: "matrix lu matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_qr",
    name: "QR decomposition",
    category: "Matrices",
    description: "Factor A = QR with orthonormal columns in Q.",
    keywords: "matrix qr matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_svd",
    name: "Singular value decomposition",
    category: "Matrices",
    description: "Factor A = U\u03a3V\u1d34 with nonnegative singular values.",
    keywords: "matrix svd matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_pinverse",
    name: "Pseudoinverse",
    category: "Matrices",
    description:
      "Exact or symbolic matrix operation; review any exceptional parameter conditions.",
    keywords: "Moore Penrose least squares",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_trace",
    name: "Trace",
    category: "Matrices",
    description:
      "Exact or symbolic matrix operation; review any exceptional parameter conditions.",
    keywords: "matrix trace matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_condition",
    name: "Condition number",
    category: "Matrices",
    description:
      "Numerical 2-norm condition number with singularity diagnostics.",
    keywords: "matrix condition matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
    ],
  },
  {
    id: "matrix_characteristic",
    name: "Characteristic polynomial",
    category: "Matrices",
    description: "Compute det(λI−A).",
    keywords: "matrix characteristic matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
      {
        key: "variable",
        label: "Characteristic variable",
        value: "x",
      },
    ],
  },
  {
    id: "matrix_solve",
    name: "Solve Ax = b",
    category: "Matrices",
    description:
      "A right-hand column with one entry per matrix row; parametric solutions are retained.",
    keywords: "matrix solve matrices",
    fields: [
      {
        key: "expression",
        label: "Matrix",
        value: "[[1,2],[3,4]]",
        hint: "Use a saved matrix name, nested rows [[1,2],[3,4]], or Matrix([[1,2],[3,4]]).",
      },
      {
        key: "rhs",
        label: "Right-hand column",
        value: "[[5],[11]]",
      },
    ],
  },
  {
    id: "gradient",
    name: "Gradient",
    category: "Vector calculus",
    description:
      "Differentiate a scalar expression in the listed coordinate order.",
    keywords: "gradient vector calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2+y^2",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
    ],
  },
  {
    id: "jacobian",
    name: "Jacobian matrix",
    category: "Vector calculus",
    description:
      "Differentiate a vector expression in the listed coordinate order.",
    keywords: "jacobian vector calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[x*y,sin(x)]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
    ],
  },
  {
    id: "hessian",
    name: "Hessian",
    category: "Vector calculus",
    description: "Matrix of second partial derivatives.",
    keywords: "hessian vector calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2+y^2",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
    ],
  },
  {
    id: "divergence",
    name: "Divergence",
    category: "Vector calculus",
    description: "Cartesian divergence of a vector field.",
    keywords: "divergence vector calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[x,y,z]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y,z]",
      },
    ],
  },
  {
    id: "curl",
    name: "Curl",
    category: "Vector calculus",
    description: "Three-dimensional curl in a right-handed coordinate system.",
    keywords: "curl vector calculus",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[-y,x,0]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y,z]",
      },
    ],
  },
  {
    id: "jacobian_factor",
    name: "Coordinate-change factor",
    category: "Vector calculus",
    description: "Absolute Jacobian determinant for a coordinate change.",
    keywords: "coordinate transformation polar cylindrical spherical",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[r*cos(t),r*sin(t)]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[r,t]",
      },
    ],
  },
  {
    id: "dot",
    name: "Dot product",
    category: "Vectors",
    description:
      "Operate on compatible vectors; apply conjugation explicitly for complex inner products.",
    keywords: "dot vectors",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[1,2,3]",
      },
      {
        key: "other",
        label: "Second expression / data",
        value: "[3,2,1]",
      },
    ],
  },
  {
    id: "cross",
    name: "Cross product",
    category: "Vectors",
    description: "Three-dimensional vector cross product.",
    keywords: "cross vectors",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[1,2,3]",
      },
      {
        key: "other",
        label: "Second expression / data",
        value: "[3,2,1]",
      },
    ],
  },
  {
    id: "line_integral",
    name: "Line integral",
    category: "Vector calculus",
    description: "Vector fields use F·r′; scalar fields use f times the speed.",
    keywords: "circulation work arc length",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[-y,x,0]",
      },
      {
        key: "position",
        label: "Path r(t)",
        value: "[cos(t),sin(t),0]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y,z]",
      },
      {
        key: "bounds",
        label: "Parameter bounds",
        value: "[(t,0,2*pi)]",
      },
    ],
  },
  {
    id: "surface_integral",
    name: "Surface integral / flux",
    category: "Vector calculus",
    description: "Vector flux uses r_u×r_v; scalar area uses its magnitude.",
    keywords: "flux area surface normal",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[0,0,1]",
      },
      {
        key: "position",
        label: "Surface r(u,v)",
        value: "[u,v,0]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y,z]",
      },
      {
        key: "bounds",
        label: "Parameter bounds",
        value: "[(u,0,1),(v,0,1)]",
      },
    ],
  },
  {
    id: "contour",
    name: "Complex contour integral",
    category: "Analysis",
    description: "Integrate f(z(t))z′(t) along an explicit oriented path.",
    keywords: "contour analysis",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "1/z",
      },
      {
        key: "variable",
        label: "Variable",
        value: "z",
      },
      {
        key: "path",
        label: "Path z(t)",
        value: "exp(I*t)",
      },
      {
        key: "bounds",
        label: "Parameter bounds",
        value: "[(t,0,2*pi)]",
      },
    ],
  },
  {
    id: "ode",
    name: "Symbolic ODE",
    category: "Differential equations",
    description:
      "Supported first- and higher-order equations with optional initial or boundary conditions.",
    keywords: "ode differential equations",
    fields: [
      {
        key: "equation",
        label: "Equation, equal to zero",
        value: "diff(y(x),x)-y(x)",
      },
      {
        key: "function",
        label: "Unknown function",
        value: "y(x)",
      },
      {
        key: "conditions",
        label: "Conditions",
        value: "{y(0):1}",
        hint: "Example: {y(0):0,Subs(diff(y(x),x),x,0):1}. Use {} for the general solution.",
      },
    ],
  },
  {
    id: "ivp",
    name: "Numerical ODE / system",
    category: "Differential equations",
    description: "Adaptive initial-value integration with explicit tolerance.",
    keywords: "trajectory dynamics initial value",
    fields: [
      {
        key: "rhs",
        label: "Right-hand sides",
        value: "[v,-y]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[y,v]",
      },
      {
        key: "variable",
        label: "Variable",
        value: "t",
      },
      {
        key: "initial",
        label: "Initial state / guess",
        value: "[1,0]",
      },
      {
        key: "lower",
        label: "Start time",
        value: "0",
      },
      {
        key: "upper",
        label: "End time",
        value: "10",
      },
      {
        key: "tolerance",
        label: "Relative tolerance",
        value: "1e-8",
      },
    ],
  },
  {
    id: "bvp",
    name: "Numerical boundary-value problem",
    category: "Differential equations",
    description: "First-order system with one boundary condition per state.",
    keywords: "boundary value shooting",
    fields: [
      {
        key: "rhs",
        label: "Right-hand sides",
        value: "[v,0]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[y,v]",
      },
      {
        key: "variable",
        label: "Variable",
        value: "t",
      },
      {
        key: "lower",
        label: "Left boundary",
        value: "0",
      },
      {
        key: "upper",
        label: "Right boundary",
        value: "1",
      },
      {
        key: "conditions",
        label: "Conditions",
        value: "[[0,0,0],[0,1,1]]",
        hint: "One condition per state: [zero-based state index, endpoint 0 or 1, value].",
      },
    ],
  },
  {
    id: "stability",
    name: "Equilibrium linearisation",
    category: "Differential equations",
    description:
      "Check the field and Jacobian eigenvalues at a supplied point.",
    keywords: "equilibrium eigenvalues phase plane",
    fields: [
      {
        key: "rhs",
        label: "Right-hand sides",
        value: "[y,-x-y]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
      {
        key: "point",
        label: "Point",
        value: "{x:0,y:0}",
      },
    ],
  },
  {
    id: "pde",
    name: "Symbolic first-order PDE",
    category: "Differential equations",
    description: "Supported first-order linear PDE families.",
    keywords: "pde differential equations",
    fields: [
      {
        key: "equation",
        label: "Equation, equal to zero",
        value: "diff(u(x,y),x)+diff(u(x,y),y)",
      },
      {
        key: "function",
        label: "Unknown function",
        value: "u(x,y)",
      },
    ],
  },
  {
    id: "heat",
    name: "Heat equation: sine modes",
    category: "Differential equations",
    description: "Finite sine expansion on [0,L] with zero endpoint values.",
    keywords: "PDE diffusion separation modes",
    fields: [
      {
        key: "coefficients",
        label: "Initial displacement sine coefficients",
        value: "[1]",
        hint: "Coefficient of sin(n*pi*x/L), starting at n=1; up to 50 modes.",
      },
      {
        key: "length",
        label: "Length L",
        value: "pi",
      },
      {
        key: "coefficient",
        label: "Diffusivity",
        value: "1",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "time",
        label: "Time variable",
        value: "t",
      },
    ],
  },
  {
    id: "wave",
    name: "Wave equation: sine modes",
    category: "Differential equations",
    description: "Finite sine expansion on [0,L] with zero endpoint values.",
    keywords: "PDE oscillation separation modes",
    fields: [
      {
        key: "coefficients",
        label: "Initial displacement sine coefficients",
        value: "[1]",
      },
      {
        key: "velocity",
        label: "Initial velocity sine coefficients",
        value: "[0]",
        hint: "Sine coefficients of the initial time derivative; omitted modes have zero coefficient.",
      },
      {
        key: "length",
        label: "Length L",
        value: "pi",
      },
      {
        key: "coefficient",
        label: "Wave speed",
        value: "1",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "time",
        label: "Time variable",
        value: "t",
      },
    ],
  },
  {
    id: "poisson",
    name: "Poisson / Laplace on a square",
    category: "Differential equations",
    description: "Δu=f on the unit square, with zero boundary values.",
    keywords: "PDE elliptic finite difference",
    fields: [
      {
        key: "forcing",
        label: "Forcing f(x,y)",
        value: "-2*pi^2*sin(pi*x)*sin(pi*y)",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
      {
        key: "grid",
        label: "Interior grid points per side (3–35)",
        value: "12",
      },
    ],
  },
  {
    id: "laplace",
    name: "Laplace transform",
    category: "Transforms",
    description:
      "Compute the transform and retain returned convergence conditions.",
    keywords: "laplace transforms",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "exp(-t)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "t",
      },
      {
        key: "target",
        label: "Target variable",
        value: "s",
      },
    ],
  },
  {
    id: "inverse_laplace",
    name: "Inverse Laplace",
    category: "Transforms",
    description: "Recover a supported time-domain expression.",
    keywords: "inverse laplace transforms",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "1/(s^2+1)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "s",
      },
      {
        key: "target",
        label: "Target variable",
        value: "t",
      },
    ],
  },
  {
    id: "fourier",
    name: "Fourier transform",
    category: "Transforms",
    description: "Compute the transform with the engine’s stated convention.",
    keywords: "fourier transforms",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "exp(-x^2)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "target",
        label: "Target variable",
        value: "k",
      },
    ],
  },
  {
    id: "inverse_fourier",
    name: "Inverse Fourier",
    category: "Transforms",
    description: "Recover a supported inverse Fourier expression.",
    keywords: "inverse fourier transforms",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "exp(-pi*k^2)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "k",
      },
      {
        key: "target",
        label: "Target variable",
        value: "x",
      },
    ],
  },
  {
    id: "distribution",
    name: "Probability distributions",
    category: "Probability",
    description:
      "Mass, density, cumulative, survival and inverse probabilities.",
    keywords: "normal binomial Poisson PDF PMF CDF SF quantile inverse tail",
    fields: [
      {
        key: "distribution",
        label: "Distribution",
        value: "normal",
        choices: [
          "normal",
          "student-t",
          "chi-square",
          "F",
          "binomial",
          "poisson",
          "geometric",
          "hypergeometric",
          "uniform",
          "exponential",
          "gamma",
          "beta",
          "negative-binomial",
        ],
      },
      {
        key: "parameters",
        label: "Parameters",
        value: "[0,1]",
        hint: "Normal [μ,σ]; t [df]; χ² [df]; F [df1,df2]; binomial [n,p]; Poisson [λ]; geometric [p] starts at 1; hypergeometric [population,successes,draws]; uniform [a,b]; exponential [rate]; gamma [shape,scale]; beta [a,b]; negative binomial [successes,p]. Update these when changing distribution.",
      },
      {
        key: "action",
        label: "Probability operation",
        value: "cdf",
        choices: ["pdf/pmf", "cdf", "sf", "ppf", "isf", "moments"],
      },
      {
        key: "value",
        label: "x, or probability for an inverse",
        value: "0",
        hint: "CDF=P(X≤x), SF=P(X>x). Use SF at k−1 for P(X≥k). PPF/ISF require a probability strictly between 0 and 1.",
      },
    ],
  },
  {
    id: "proportion",
    name: "Proportion intervals and z tests",
    category: "Statistics",
    description:
      "One or two independent Bernoulli samples with explicit tails.",
    keywords: "proportion Wilson z test confidence interval",
    fields: [
      {
        key: "counts",
        label: "Successes and trials",
        value: "[40,100]",
        hint: "One sample: [successes,trials]. Two samples: [successes1,trials1,successes2,trials2].",
      },
      {
        key: "action",
        label: "Operation",
        value: "one-sample interval",
        choices: [
          "one-sample interval",
          "one-sample test",
          "two-sample interval",
          "two-sample test",
        ],
      },
      {
        key: "level",
        label: "Confidence level",
        value: "0.95",
      },
      {
        key: "null",
        label: "Null proportion (one-sample test)",
        value: "0.5",
      },
      {
        key: "tail",
        label: "Alternative",
        value: "two-sided",
        choices: ["two-sided", "less", "greater"],
      },
    ],
  },
  {
    id: "two_mean_interval",
    name: "Two-mean confidence interval",
    category: "Statistics",
    description: "Welch or paired t interval for the difference in means.",
    keywords: "Welch paired difference confidence",
    fields: [
      {
        key: "data",
        label: "First sample",
        value: "[1,2,3,4,5]",
      },
      {
        key: "other",
        label: "Second sample",
        value: "[2,3,4,5,6]",
      },
      {
        key: "level",
        label: "Confidence level",
        value: "0.95",
      },
      {
        key: "kind",
        label: "Method",
        value: "Welch",
        choices: ["Welch", "paired"],
      },
    ],
  },
  {
    id: "expectation",
    name: "Expectation of a distribution",
    category: "Probability",
    description:
      "Check normalisation and compute expectation and variance of a function.",
    keywords: "expected value mean variance random variable",
    fields: [
      {
        key: "value",
        label: "Function of X",
        value: "x",
      },
      {
        key: "weight",
        label: "Density / mass",
        value: "2*x",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "lower",
        label: "Support lower bound",
        value: "0",
      },
      {
        key: "upper",
        label: "Support upper bound",
        value: "1",
      },
      {
        key: "kind",
        label: "Distribution kind",
        value: "continuous",
        choices: ["continuous", "discrete"],
      },
    ],
  },
  {
    id: "describe",
    name: "Descriptive statistics",
    category: "Statistics",
    description: "Sample and population conventions are reported together.",
    keywords: "mean median variance standard deviation quartiles summary",
    fields: [
      {
        key: "data",
        label: "Dataset",
        value: "[1,2,3,4,5]",
      },
    ],
  },
  {
    id: "regression",
    name: "Regression and correlation",
    category: "Statistics",
    description:
      "Editable models with residuals, R² and correlation diagnostics.",
    keywords:
      "least squares fit Pearson Spearman correlation sinusoidal logistic",
    fields: [
      {
        key: "x",
        label: "x data",
        value: "[1,2,3,4]",
      },
      {
        key: "y",
        label: "y data",
        value: "[3,5,7,9]",
      },
      {
        key: "model",
        label: "Model",
        value: "linear",
        choices: [
          "linear",
          "polynomial",
          "exponential",
          "logarithmic",
          "power",
          "sinusoidal",
          "logistic",
        ],
        hint: "Sinusoidal fitting requires at least 5 observations; logistic requires at least 4. Initial values can affect nonlinear fits.",
      },
      {
        key: "degree",
        label: "Polynomial degree",
        value: "2",
      },
      {
        key: "initial",
        label: "Nonlinear initial parameters (optional)",
        value: "[]",
        hint: "Sinusoidal [amplitude,frequency,phase,offset]; logistic [ceiling,rate,midpoint]. [] chooses an automatic initial guess.",
      },
    ],
  },
  {
    id: "confidence",
    name: "Mean confidence interval",
    category: "Statistics",
    description: "Student t interval for an unknown population variance.",
    keywords: "confidence interval mean estimation",
    fields: [
      {
        key: "data",
        label: "Dataset",
        value: "[1,2,3,4,5]",
      },
      {
        key: "level",
        label: "Confidence level",
        value: "0.95",
      },
    ],
  },
  {
    id: "test",
    name: "Hypothesis test",
    category: "Statistics",
    description: "Choose the model, null and alternative explicitly.",
    keywords: "t test chi square significance p value ANOVA exact binomial",
    fields: [
      {
        key: "test",
        label: "Test",
        value: "one-sample t",
        choices: [
          "one-sample t",
          "Welch t",
          "paired t",
          "equal-variance t",
          "chi-square goodness",
          "chi-square independence",
          "ANOVA",
          "binomial",
        ],
      },
      {
        key: "data",
        label: "Data / counts",
        value: "[1,2,3,4,5]",
        hint: "Chi-square independence: a count matrix. ANOVA: a list of groups. Binomial: [successes,trials]. Other tests use a numeric sample.",
      },
      {
        key: "other",
        label: "Comparison data / expected counts",
        value: "[2,3,4,5,6]",
      },
      {
        key: "null",
        label: "Null mean / binomial probability",
        value: "0",
        hint: "For an exact binomial test, provide a probability between 0 and 1, such as 0.5.",
      },
      {
        key: "tail",
        label: "Alternative",
        value: "two-sided",
        choices: ["two-sided", "less", "greater"],
      },
    ],
  },
  {
    id: "combinatorics",
    name: "Counting",
    category: "Discrete mathematics",
    description: "Exact factorials, permutations and combinations.",
    keywords: "nCr nPr choose factorial permutations combinations",
    fields: [
      {
        key: "n",
        label: "n",
        value: "10",
      },
      {
        key: "k",
        label: "k",
        value: "3",
      },
      {
        key: "kind",
        label: "Method",
        value: "combinations",
        choices: ["combinations", "permutations", "factorial"],
      },
    ],
  },
  {
    id: "recurrence",
    name: "Solve a recurrence",
    category: "Discrete mathematics",
    description: "Supported linear recurrences with editable initial values.",
    keywords: "Fibonacci sequence rsolve",
    fields: [
      {
        key: "equation",
        label: "Equation, equal to zero",
        value: "a(n+2)-a(n+1)-a(n)",
      },
      {
        key: "function",
        label: "Sequence",
        value: "a(n)",
      },
      {
        key: "conditions",
        label: "Initial values",
        value: "{a(0):0,a(1):1}",
      },
    ],
  },
  {
    id: "generating",
    name: "Generating function",
    category: "Discrete mathematics",
    description: "Sum aₙzⁿ, starting at n=0; retain convergence conditions.",
    keywords: "generating discrete mathematics",
    fields: [
      {
        key: "sequence",
        label: "Sequence term aₙ",
        value: "n",
      },
      {
        key: "variable",
        label: "Variable",
        value: "n",
      },
      {
        key: "target",
        label: "Generating variable",
        value: "z",
      },
    ],
  },
  {
    id: "sets",
    name: "Finite set operations",
    category: "Discrete mathematics",
    description: "Union, intersection, difference and Cartesian products.",
    keywords: "sets discrete mathematics",
    fields: [
      {
        key: "left",
        label: "First expression / object",
        value: "[1,2,3]",
      },
      {
        key: "right",
        label: "Second expression / object",
        value: "[2,3,4]",
      },
      {
        key: "operation",
        label: "Operation",
        value: "union",
        choices: [
          "union",
          "intersection",
          "difference",
          "product",
          "symmetric difference",
        ],
      },
    ],
  },
  {
    id: "logic",
    name: "Propositional logic / truth table",
    category: "Discrete mathematics",
    description:
      "Truth table, simplified form and satisfiability, up to 10 variables.",
    keywords: "Boolean truth table SAT and or not implication",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "Implies(p,q)",
      },
    ],
  },
  {
    id: "relation",
    name: "Finite relation",
    category: "Discrete mathematics",
    description: "Properties and reflexive, symmetric and transitive closures.",
    keywords: "equivalence partial order transitive closure",
    fields: [
      {
        key: "universe",
        label: "Universe",
        value: "[1,2,3]",
      },
      {
        key: "pairs",
        label: "Ordered pairs",
        value: "[(1,1),(2,2),(3,3),(1,2)]",
      },
    ],
  },
  {
    id: "graph_theory",
    name: "Graph and network analysis",
    category: "Discrete mathematics",
    description:
      "Weighted edges, connectivity, paths, spanning forests and flow.",
    keywords:
      "network shortest path spanning tree connectivity max flow adjacency Laplacian",
    fields: [
      {
        key: "nodes",
        label: "Additional isolated nodes",
        value: "[]",
      },
      {
        key: "edges",
        label: "Edges (from, to, optional weight)",
        value: "[(0,1,1),(1,2,2),(0,2,4)]",
      },
      {
        key: "directed",
        label: "Directed",
        value: "no",
        choices: ["no", "yes"],
      },
      {
        key: "action",
        label: "Operation",
        value: "summary",
        choices: [
          "summary",
          "path",
          "spanning tree",
          "flow",
          "adjacency",
          "laplacian",
        ],
      },
      {
        key: "start",
        label: "Start node",
        value: "0",
      },
      {
        key: "end",
        label: "End node",
        value: "2",
      },
    ],
  },
  {
    id: "number_theory",
    name: "Integer and modular arithmetic",
    category: "Number theory",
    description:
      "Exact integer methods; expensive computations can be cancelled.",
    keywords: "Bezout gcd lcm prime factorization modular inverse Euclid",
    fields: [
      {
        key: "a",
        label: "a",
        value: "84",
      },
      {
        key: "b",
        label: "b / modulus",
        value: "30",
      },
      {
        key: "action",
        label: "Operation",
        value: "gcd",
        choices: [
          "gcd",
          "lcm",
          "Bézout",
          "modular inverse",
          "modular power",
          "factor",
          "prime",
          "totient",
          "divisors",
          "continued fraction",
        ],
      },
      {
        key: "exponent",
        label: "Exponent",
        value: "13",
      },
    ],
  },
  {
    id: "crt",
    name: "Chinese remainder theorem",
    category: "Number theory",
    description:
      "Solve a system of integer congruences, including compatible noncoprime cases.",
    keywords: "congruence Chinese remainder",
    fields: [
      {
        key: "moduli",
        label: "Moduli",
        value: "[3,5]",
      },
      {
        key: "residues",
        label: "Residues",
        value: "[2,3]",
      },
    ],
  },
  {
    id: "diophantine",
    name: "Diophantine equation",
    category: "Number theory",
    description: "Integer solution families for supported equations.",
    keywords: "diophantine number theory",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "2*x+3*y-7",
      },
    ],
  },
  {
    id: "group",
    name: "Finite permutation group",
    category: "Abstract algebra",
    description:
      "Generated group, subgroup, cosets, classes and natural action.",
    keywords:
      "permutation conjugacy cosets stabilizer orbit finite group action",
    fields: [
      {
        key: "generators",
        label: "Generators, zero-based image arrays",
        value: "[[1,0,2],[1,2,0]]",
        hint: "Each row is a permutation of 0,...,n−1. Maximum group order 256; the result states its multiplication convention.",
      },
      {
        key: "subgroup",
        label: "Subgroup generators",
        value: "[[1,0,2]]",
      },
      {
        key: "point",
        label: "Action point",
        value: "0",
      },
    ],
  },
  {
    id: "quotient",
    name: "Finite field / quotient ring",
    category: "Abstract algebra",
    description:
      "Arithmetic in Fₚ[a]/(m), with primality and irreducibility checks.",
    keywords: "GF finite field extension polynomial quotient ring",
    fields: [
      {
        key: "prime",
        label: "Prime p",
        value: "2",
      },
      {
        key: "variable",
        label: "Variable",
        value: "a",
      },
      {
        key: "modulus",
        label: "Modulus polynomial m(a)",
        value: "a^2+a+1",
      },
      {
        key: "structure",
        label: "Structure",
        value: "field",
        choices: ["field", "ring"],
        hint: "A field requires an irreducible modulus; a quotient ring may contain nonzero elements without inverses.",
      },
      {
        key: "left",
        label: "Element",
        value: "a",
      },
      {
        key: "action",
        label: "Operation",
        value: "inverse",
        choices: [
          "reduce",
          "add",
          "subtract",
          "multiply",
          "divide",
          "inverse",
          "power",
        ],
      },
      {
        key: "right",
        label: "Second element",
        value: "a+1",
      },
      {
        key: "exponent",
        label: "Exponent",
        value: "2",
        hint: "Used only for power; integers are required.",
      },
    ],
  },
  {
    id: "polynomial",
    name: "Polynomial arithmetic",
    category: "Abstract algebra",
    description: "Characteristic-zero or prime-field coefficients.",
    keywords: "polynomial abstract algebra",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^4-1",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "modulus",
        label: "Prime modulus (0 for characteristic zero)",
        value: "0",
      },
      {
        key: "action",
        label: "Operation",
        value: "factor",
        choices: ["factor", "divide", "gcd", "resultant", "discriminant"],
      },
      {
        key: "other",
        label: "Second expression / data",
        value: "x^2+1",
      },
    ],
  },
  {
    id: "ideal",
    name: "Groebner basis / ideal membership",
    category: "Abstract algebra",
    description:
      "Polynomial reduction with explicit variable and monomial orders.",
    keywords: "Groebner ideal membership algebra",
    fields: [
      {
        key: "generators",
        label: "Ideal generators",
        value: "[x*y-1,y^2-1]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
      {
        key: "expression",
        label: "Expression",
        value: "x-y",
      },
      {
        key: "order",
        label: "Monomial order",
        value: "lex",
        choices: ["lex", "grlex", "grevlex"],
      },
    ],
  },
  {
    id: "homology",
    name: "Simplicial homology",
    category: "Topology",
    description:
      "Exact rational homology of a finite simplicial complex; no integral torsion.",
    keywords: "Betti Euler boundary simplicial topology",
    fields: [
      {
        key: "facets",
        label: "Maximal simplices",
        value: "[[0,1],[1,2],[0,2]]",
        hint: "Vertices are integer labels. A triangle boundary is [[0,1],[1,2],[0,2]]; a filled triangle is [[0,1,2]]. Rational homology does not detect integral torsion.",
      },
    ],
  },
  {
    id: "topology",
    name: "Finite topological space",
    category: "Topology",
    description:
      "Validate axioms, separation, components, closure and interior (≤10 points).",
    keywords: "topology topology",
    fields: [
      {
        key: "universe",
        label: "Universe",
        value: "[0,1]",
      },
      {
        key: "open_sets",
        label: "Open sets",
        value: "[[],[1],[0,1]]",
        hint: "List the entire open-set family, including [] and the full universe.",
      },
      {
        key: "subset",
        label: "Subset",
        value: "[1]",
      },
    ],
  },
  {
    id: "topology_map",
    name: "Continuity of a finite map",
    category: "Topology",
    description: "Check continuity and homeomorphism with concrete witnesses.",
    keywords: "topology map topology",
    fields: [
      {
        key: "source",
        label: "Source points",
        value: "[0,1]",
      },
      {
        key: "source_opens",
        label: "Source open sets",
        value: "[[],[1],[0,1]]",
      },
      {
        key: "target",
        label: "Target points",
        value: "[0,1]",
      },
      {
        key: "target_opens",
        label: "Target open sets",
        value: "[[],[1],[0,1]]",
      },
      {
        key: "images",
        label: "Images, in source order",
        value: "[0,1]",
      },
    ],
  },
  {
    id: "surface_geometry",
    name: "Surface geometry",
    category: "Geometry",
    description:
      "Metric, fundamental forms, curvature and Christoffel symbols of a regular real chart.",
    keywords:
      "differential geometry metric curvature Christoffel fundamental form",
    fields: [
      {
        key: "position",
        label: "Parametrisation",
        value: "[sin(u)*cos(v),sin(u)*sin(v),cos(u)]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[u,v]",
      },
      {
        key: "point",
        label: "Optional point",
        value: "{}",
        hint: "{} leaves the coordinates symbolic. Real coordinates are used; singular chart points are excluded.",
      },
    ],
  },
  {
    id: "curve_geometry",
    name: "Curve curvature and torsion",
    category: "Geometry",
    description:
      "Three-dimensional real curve; speed and binormal restrictions apply.",
    keywords: "helix curvature torsion",
    fields: [
      {
        key: "position",
        label: "Parametrisation",
        value: "[cos(t),sin(t),t]",
        hint: "Three real components. Additional symbolic parameters may need real or positive assumptions.",
      },
      {
        key: "variable",
        label: "Variable",
        value: "t",
      },
    ],
  },
  {
    id: "geometry",
    name: "Coordinate geometry",
    category: "Geometry",
    description: "Intersections and distances between geometric objects.",
    keywords: "geometry geometry",
    fields: [
      {
        key: "left",
        label: "First expression / object",
        value: "Circle(Point(0,0),1)",
      },
      {
        key: "right",
        label: "Second expression / object",
        value: "Line(Point(-2,0),Point(2,0))",
      },
      {
        key: "action",
        label: "Operation",
        value: "intersection",
        choices: ["intersection", "distance"],
      },
    ],
  },
  {
    id: "root",
    name: "Numerical root in a bracket",
    category: "Numerical methods",
    description:
      "Brent root search on a verified continuous interval; one root, not an exhaustive list.",
    keywords: "zero Brent root finding",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "x^2-2",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "lower",
        label: "Lower bound",
        value: "0",
      },
      {
        key: "upper",
        label: "Upper bound",
        value: "2",
      },
    ],
  },
  {
    id: "numeric_integral",
    name: "Numerical quadrature",
    category: "Numerical methods",
    description:
      "Adaptive integration with an error estimate; split known singularities.",
    keywords: "approximate integral quadrature",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "exp(-x^2)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "lower",
        label: "Lower bound",
        value: "0",
      },
      {
        key: "upper",
        label: "Upper bound",
        value: "oo",
      },
    ],
  },
  {
    id: "numeric_derivative",
    name: "Numerical derivative",
    category: "Numerical methods",
    description: "Central differences with sensitivity to halving the step.",
    keywords: "numeric derivative numerical methods",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "sin(x)",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
      {
        key: "point",
        label: "Point",
        value: "1",
      },
      {
        key: "step",
        label: "Step",
        value: "1e-4",
      },
    ],
  },
  {
    id: "numeric_system",
    name: "Numerical nonlinear system",
    category: "Numerical methods",
    description: "Local root search from a chosen starting point.",
    keywords: "numeric system numerical methods",
    fields: [
      {
        key: "equations",
        label: "Equations",
        value: "[x^2+y^2-1,x-y]",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
      {
        key: "initial",
        label: "Initial state / guess",
        value: "[1,1]",
      },
    ],
  },
  {
    id: "minimize",
    name: "Constrained optimisation",
    category: "Numerical methods",
    description:
      "Local SLSQP minimisation with bounds and inequality constraints.",
    keywords: "optimize minimise maximize constrained local",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "(x-2)^2+(y+1)^2",
      },
      {
        key: "variables",
        label: "Coordinates / variables",
        value: "[x,y]",
      },
      {
        key: "initial",
        label: "Initial state / guess",
        value: "[0,0]",
      },
      {
        key: "bounds",
        label: "Bounds",
        value: "[(-10,10),(-10,10)]",
      },
      {
        key: "constraints",
        label: "Constraints g(x) ≥ 0",
        value: "[]",
        hint: "A list of expressions constrained to be ≥0; [] means no additional constraints.",
      },
    ],
  },
  {
    id: "linear_program",
    name: "Linear programming",
    category: "Numerical methods",
    description:
      "Minimise c·x subject to Ax≤b, equality constraints and variable bounds.",
    keywords: "LP simplex HiGHS optimisation",
    fields: [
      {
        key: "objective",
        label: "Objective coefficients c",
        value: "[-1,-1]",
      },
      {
        key: "A",
        label: "Inequality matrix A",
        value: "[[1,2],[3,1]]",
      },
      {
        key: "b",
        label: "Inequality right-hand side b",
        value: "[4,5]",
      },
      {
        key: "Aeq",
        label: "Equality matrix",
        value: "[]",
      },
      {
        key: "beq",
        label: "Equality right-hand side",
        value: "[]",
      },
      {
        key: "bounds",
        label: "Bounds",
        value: "[(0,oo),(0,oo)]",
        hint: "One (lower,upper) pair per variable; use -oo or oo for an unbounded side.",
      },
    ],
  },
  {
    id: "interpolate",
    name: "Exact polynomial interpolation",
    category: "Numerical methods",
    description: "Polynomial through the supplied coordinate pairs.",
    keywords: "interpolate numerical methods",
    fields: [
      {
        key: "points",
        label: "Points",
        value: "[(0,1),(1,2),(2,5)]",
      },
      {
        key: "variable",
        label: "Variable",
        value: "x",
      },
    ],
  },
  {
    id: "spline",
    name: "Spline interpolation",
    category: "Numerical methods",
    description:
      "Evaluate PCHIP or a cubic spline inside the supplied data range.",
    keywords: "spline numerical methods",
    fields: [
      {
        key: "x",
        label: "x data",
        value: "[0,1,2,3]",
      },
      {
        key: "y",
        label: "y data",
        value: "[0,1,0,1]",
      },
      {
        key: "points",
        label: "Evaluation points",
        value: "[0.5,1.5,2.5]",
      },
      {
        key: "kind",
        label: "Spline",
        value: "PCHIP",
        choices: ["PCHIP", "cubic"],
      },
    ],
  },
  {
    id: "fft",
    name: "Discrete Fourier transform",
    category: "Transforms",
    description: "FFT or inverse FFT with explicit normalisation.",
    keywords: "frequency signal DFT discrete Fourier",
    fields: [
      {
        key: "data",
        label: "Samples",
        value: "[1,0,-1,0]",
      },
      {
        key: "action",
        label: "Operation",
        value: "FFT",
        choices: ["FFT", "inverse FFT"],
      },
    ],
  },
  {
    id: "convolution",
    name: "Discrete convolution",
    category: "Transforms",
    description: "Linear convolution of two finite sequences.",
    keywords: "convolution transforms",
    fields: [
      {
        key: "left",
        label: "First expression / object",
        value: "[1,2,1]",
      },
      {
        key: "right",
        label: "Second expression / object",
        value: "[1,-1]",
      },
      {
        key: "mode",
        label: "Output mode",
        value: "full",
        choices: ["full", "same", "valid"],
      },
    ],
  },
  {
    id: "markov",
    name: "Markov chain",
    category: "Probability",
    description:
      "Stationary distributions and powers of a row-stochastic transition matrix.",
    keywords: "stochastic stationary transition probability",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "[[3/4,1/4],[1/4,3/4]]",
      },
      {
        key: "steps",
        label: "Steps",
        value: "5",
      },
    ],
  },
  {
    id: "units",
    name: "Unit conversion",
    category: "Scientific",
    description: "Convert compatible multiplicative scientific units.",
    keywords: "dimensions physical scientific SI",
    fields: [
      {
        key: "expression",
        label: "Expression",
        value: "3*meter/second",
      },
      {
        key: "target",
        label: "Target unit",
        value: "kilometer/hour",
      },
    ],
  },
  {
    id: "finance",
    name: "Time value of money",
    category: "Scientific",
    description: "Compound growth or level end-of-period payment arithmetic.",
    keywords: "TVM compound interest annuity",
    fields: [
      {
        key: "principal",
        label: "Principal",
        value: "1000",
      },
      {
        key: "rate",
        label: "Rate per period",
        value: "0.05",
        hint: "Rate per period: 0.05 means 5%. Payment uses end-of-period payments.",
      },
      {
        key: "periods",
        label: "Number of periods",
        value: "12",
      },
      {
        key: "action",
        label: "Operation",
        value: "future value",
        choices: ["future value", "payment"],
      },
    ],
  },
];
operations.push(
  ...[
    {
      id: "together",
      name: "Combine fractions",
      category: "Algebra",
      description: "Write a sum of fractions over a common denominator.",
      keywords: " Combine fractions",
      fields: [
        {
          key: "expression",
          label: "Expression",
          value: "1/x+1/(x+1)",
        },
      ],
    },
    {
      id: "radsimp",
      name: "Rationalize radicals",
      category: "Algebra",
      description:
        "Remove square roots from a denominator while preserving restrictions.",
      keywords: " Rationalize radicals",
      fields: [
        {
          key: "expression",
          label: "Expression",
          value: "1/(1+sqrt(2))",
        },
      ],
    },
    {
      id: "compose",
      name: "Compose functions",
      category: "Algebra",
      description:
        "Substitute an inner function into an outer function: f(g(x)).",
      keywords: " Compose functions",
      fields: [
        {
          key: "expression",
          label: "Outer function f(x)",
          value: "x^2+1",
        },
        {
          key: "variable",
          label: "Input variable",
          value: "x",
        },
        {
          key: "inner",
          label: "Inner function g(t)",
          value: "sin(t)",
        },
      ],
    },
    {
      id: "piecewise",
      name: "Piecewise function",
      category: "Algebra",
      description:
        "Define different formulas on different parts of the domain.",
      keywords: " Piecewise function",
      fields: [
        {
          key: "cases",
          label: "Formula and condition pairs",
          value: "[(x^2,x<0),(x,True)]",
        },
      ],
    },
    {
      id: "matrix_cholesky",
      name: "Cholesky decomposition",
      category: "Linear algebra",
      description: "Factor a positive definite Hermitian matrix as A = LLᴴ.",
      keywords: " Cholesky decomposition",
      fields: [
        {
          key: "expression",
          label: "Matrix A",
          value: "[[4,2],[2,3]]",
        },
      ],
    },
    {
      id: "least_squares",
      name: "Least squares",
      category: "Linear algebra",
      description: "Fit Ax ≈ b by minimizing the squared residual norm.",
      keywords: " Least squares",
      fields: [
        {
          key: "matrix",
          label: "Design matrix A",
          value: "[[1,0],[1,1],[1,2]]",
        },
        {
          key: "data",
          label: "Observed values b",
          value: "[1,3,5]",
        },
      ],
    },
    {
      id: "numeric_svd",
      name: "Numerical SVD",
      category: "Linear algebra",
      description:
        "Numerically factor A = UΣVᴴ and report reconstruction error.",
      keywords: " Numerical SVD",
      fields: [
        {
          key: "expression",
          label: "Matrix A",
          value: "[[1,2],[3,4]]",
        },
      ],
    },
    {
      id: "ode_system",
      name: "System of differential equations",
      category: "Differential equations",
      description:
        "Find symbolic solutions of coupled ordinary differential equations.",
      keywords: " System of differential equations",
      fields: [
        {
          key: "equations",
          label: "Equations",
          value: "[diff(f(t),t)-g(t),diff(g(t),t)+f(t)]",
        },
        {
          key: "functions",
          label: "Unknown functions",
          value: "[f(t),g(t)]",
        },
      ],
    },
    {
      id: "divisor_count",
      name: "Divisor count",
      category: "Number theory",
      description: "Count the positive integer divisors of n.",
      keywords: " Divisor count",
      fields: [
        {
          key: "n",
          label: "Positive integer n",
          value: "360",
        },
      ],
    },
    {
      id: "mobius",
      name: "Möbius function",
      category: "Number theory",
      description:
        "Return 0 for a square factor; otherwise (−1) to the number of distinct prime factors.",
      keywords: " Möbius function",
      fields: [
        {
          key: "n",
          label: "Positive integer n",
          value: "30",
        },
      ],
    },
    {
      id: "metric",
      name: "Metric curvature",
      category: "Geometry",
      description:
        "Compute the Levi-Civita connection, Ricci tensor and scalar curvature of a metric.",
      keywords: " Metric curvature",
      fields: [
        {
          key: "metric",
          label: "Metric tensor g",
          value: "[[1,0],[0,sin(theta)^2]]",
        },
        {
          key: "variables",
          label: "Coordinates",
          value: "[theta,phi]",
        },
      ],
    },
    {
      id: "uncertainty",
      name: "Uncertainty propagation",
      category: "Numerical methods",
      description:
        "Propagate independent standard uncertainties through a differentiable formula.",
      keywords: " Uncertainty propagation",
      fields: [
        {
          key: "expression",
          label: "Measured formula",
          value: "x*y",
        },
        {
          key: "variables",
          label: "Measured variables",
          value: "[x,y]",
        },
        {
          key: "values",
          label: "Measured values",
          value: "[2,3]",
        },
        {
          key: "errors",
          label: "Standard uncertainties",
          value: "[0.1,0.2]",
        },
      ],
    },
    {
      id: "critical_points",
      name: "Stationary points and extrema",
      category: "Calculus",
      description:
        "Find stationary points in an interval and classify with the second derivative.",
      keywords: " Stationary points and extrema",
      fields: [
        {
          key: "expression",
          label: "Function",
          value: "x^3-3*x",
        },
        {
          key: "variable",
          label: "Variable",
          value: "x",
        },
        {
          key: "lower",
          label: "Interval start",
          value: "-2",
        },
        {
          key: "upper",
          label: "Interval end",
          value: "2",
        },
      ],
    },
    {
      id: "histogram",
      name: "Histogram",
      category: "Statistics",
      description: "Group observations into bins and count their frequencies.",
      keywords: " Histogram",
      fields: [
        {
          key: "data",
          label: "Observations",
          value: "[1,2,2,3,3,3,4,5]",
        },
        {
          key: "bins",
          label: "Number of bins",
          value: "5",
        },
      ],
    },
    {
      id: "boxplot",
      name: "Box plot",
      category: "Statistics",
      description: "Show median, quartiles, Tukey whiskers and outliers.",
      keywords: " Box plot",
      fields: [
        {
          key: "data",
          label: "Observations",
          value: "[1,2,3,4,5,9]",
        },
      ],
    },
    {
      id: "correlation",
      name: "Pearson correlation",
      category: "Statistics",
      description: "Measure linear association and test for zero correlation.",
      keywords: " Pearson correlation",
      fields: [
        {
          key: "x",
          label: "First sample",
          value: "[1,2,3]",
        },
        {
          key: "y",
          label: "Second sample",
          value: "[2,4,5]",
        },
      ],
    },
    {
      id: "finite_expectation",
      name: "Finite expectation and variance",
      category: "Probability",
      description:
        "Calculate mean and variance from outcomes and their probabilities.",
      keywords: " Finite expectation and variance",
      fields: [
        {
          key: "values",
          label: "Outcomes",
          value: "[1,2,3,4,5,6]",
        },
        {
          key: "probabilities",
          label: "Probabilities",
          value: "[1/6,1/6,1/6,1/6,1/6,1/6]",
        },
      ],
    },
    {
      id: "symbolic_expectation",
      name: "Symbolic random variable",
      category: "Probability",
      description:
        "Find exact expectation and variance of a function of a random variable.",
      keywords: " Symbolic random variable",
      fields: [
        {
          key: "distribution",
          label: "Distribution",
          value: "normal",
          choices: ["normal", "exponential", "poisson"],
        },
        {
          key: "parameters",
          label: "Distribution parameters",
          value: "[0,1]",
        },
        {
          key: "variable",
          label: "Random variable",
          value: "X",
        },
        {
          key: "expression",
          label: "Function of X",
          value: "X^2",
        },
      ],
    },
  ],
);
operations.push({
  id: "surface_area",
  name: "Parametric surface area",
  category: "Geometry",
  description: "Integrate the magnitude of rᵤ × rᵥ over a parameter region.",
  keywords: "area sphere surface geometry",
  fields: [
    {
      key: "position",
      label: "Surface coordinates",
      value: "[sin(u)*cos(v),sin(u)*sin(v),cos(u)]",
    },
    { key: "variables", label: "Spatial coordinates", value: "[x,y,z]" },
    {
      key: "bounds",
      label: "Parameter bounds",
      value: "[(u,0,pi),(v,0,2*pi)]",
    },
  ],
});
export const categories = Array.from(
  new Set(operations.map((operation) => operation.category)),
);
