# Calculator computational coverage research

Research date: 2026-09-26. This is an implementation coverage map, not a claim that every operation below has been built. Use the app's actual command registry and tests to mark completion.

## Basis and scope

Official MIT mathematics catalog spans calculus, matrix methods, probability/statistics, ODE/PDE, scientific computing, algebra, logic, topology, differential geometry and engineering methods. NUS corroborates the pure/applied breadth and adds operations research, analytics and computing intersections. The resulting useful additions beyond the prompt are units/dimensional conversion, FFT/convolution, Markov chains, interpolation/conditioning, constrained optimisation, polynomial quotient arithmetic and finite simplicial homology.

TI-84 CE's practical baseline includes multiple Cartesian/parametric/polar plots, sequence graphs, tables/roots/extrema/integrals, matrix editing/RREF, descriptive statistics, many regression models, hypothesis tests/CIs, distributions, and financial mathematics. It therefore is not sufficient to provide only normal probability, mean, and linear regression.

## Operation map and meaningful checks

| Family | Concrete mature foundation and object representation | Verification target / practical boundary |
|---|---|---|
| Scientific and symbolic | SymPy Integer/Rational/Float, complex expressions, `simplify`, `expand`, `factor`, `apart`, `subs`, `Lambda`; mpmath precision | 1/3+1/6=1/2; sqrt(x²)=Abs(x) for real x, not x; principal sqrt(-1)=i; distinguish exact 0.1 from machine float |
| Equations and inequalities | `solveset(expr,var,domain)`, `linsolve`, `nonlinsolve`, `reduce_inequalities`; explicit chosen variables/domain | sin(x)=0 gives infinite integer family; x²+1=0 empty over R but ±i over C; ConditionSet is unresolved; (x²−1)/(x−1)=2 has no solutions |
| Linear algebra | SymPy Matrix exact/symbolic; SciPy/NumPy floating. det/inv/transpose/H/adjugate/cofactor_matrix/rref/rank/nullspace/rowspace/columnspace/eigenvects/charpoly/LU/QR/SVD/pinv | Singular [[1,2],[2,4]] has rank 1 and nullspace (-2,1); A adj(A)=det(A)I; A.H differs from adjugate; decomposition residuals and condition number |
| Calculus | `diff`, `limit`, `integrate`, `Integral`, `Sum`, `Product`, `series`; tuple bounds innermost first | Gaussian antiderivative sqrt(pi) erf(x)/2, derivative verifies it; integral x+y for 0≤y≤x≤1 = 1/2; retain C for indefinite results; detect unevaluated Integral |
| Vector calculus | Matrix derivatives, jacobian/hessian, dot/cross, vector divergence/curl; parametrised pullback integrands | ∇(x²+y²+z²)=(2x,2y,2z); div(x,y,z)=3; curl(-y,x,0)=(0,0,2); unit circle circulation 2pi; Jacobian factor r for polar area |
| ODE/dynamics | `dsolve`, `checkodesol`, `classify_ode`; SciPy `solve_ivp`, `solve_bvp`; expression vector for systems | y'=y,y(0)=1 → exp(t); harmonic oscillator invariant y²+v²; BVP y''=0,y(0)=0,y(1)=1 → y=x; always show solver success and tolerances |
| PDE/methods | `pdsolve` for supported first-order linear equations; finite sine modes for heat/wave; sparse Poisson/Laplace discretisation for rectangles; separation/solution residual check | u_x+u_y=0 → F(x−y); heat u_t=k u_xx with sin(pi x/L) initial data → exp(-k(pi/L)²t) sin(pi x/L); boundary values zero; mark finite mode truncation |
| Probability | SciPy frozen distribution objects with PMF/PDF/CDF/SF/PPF/ISF/moments; binomial, Poisson, geometric, hypergeometric, normal,t,F,chi²,uniform,exponential,gamma,beta | Binomial(5,1/2): P(X=2)=5/16; P(X≥2)=sf(1), not sf(2); normal inverse .975≈1.959964; require sigma>0, n integer, 0≤p≤1 |
| Statistics/inference | Dataset columns; NumPy mean/quantile/var(ddof); SciPy describe, linregress, pearsonr/spearmanr, ttest_1samp/ind/rel, chisquare/chi2_contingency, f_oneway, binomtest; polynomial fit and curve_fit | [1,2,3] mean=2, sample variance=1, population variance=2/3; exact y=2x+1 regression residual 0; editable one/two tails and Welch/equal variance; CIs require alpha/convention |
| Discrete/logic | `factorial`, `binomial`, `rsolve`, formal generating expressions, FiniteSet/Union/Intersection/ProductSet; logic truth_table/satisfiable/simplify_logic | Fibonacci recurrence a(n)=a(n−1)+a(n−2) with 0,1 initial data; De Morgan equivalence via satisfiable XOR false; relations reflexive/symmetric/transitive by finite enumeration |
| Graph theory | NetworkX Graph/DiGraph from explicit node/edge lists, optional weights; connected_components, shortest_path, minimum_spanning_tree, cycle_basis, bipartite, is_planar, max_flow, adjacency/laplacian matrices | Triangle has 3 spanning trees by Laplacian cofactor; disconnected path returns no path; directed graph weak/strong connectivity explicit; negative weights require suitable method |
| Number theory | Python int/SymPy gcd/gcdex/lcm/factorint/isprime/mod_inverse/pow/crt/diophantine/totient/divisors/continued_fraction | Bezout coefficients satisfy ax+by=gcd; x=2 mod3,x=3 mod5→8 mod15; inverse 3 mod7=5; inverse 2 mod4 undefined; probable-prime status for huge integers |
| Abstract algebra | SymPy Permutation/PermutationGroup; generators, `order`, `orbits`, `stabilizer`, `coset_transversal`, `conjugacy_classes`, `center`, `derived_subgroup`; polynomial `groebner`, `reduce`, `rem`, `invert`, `factor_list` | S3 order6, conjugacy sizes1,2,3, center1, derived subgroup3; ideal <xy−1,y²−1> contains x−y; F4=F2[a]/(a²+a+1), a^-1=a+1; distinguish subgroup generation vs enumeration |
| Real/complex analysis | SymPy limits/series/residue/singularities/continuous_domain; sequence limits and convergence tests; contour by parametrisation or explicitly specified residue poles | residue(exp(z)/z²,z,0)=1; ∮1/z on positive unit circle=2pi i; multivariate path disagreement disproves limit but agreeing sample paths do not prove it; preserve branch cuts |
| Numerical/optimisation | SciPy root_scalar(brentq), root, minimize, linprog, quad/nquad, CubicSpline/PchipInterpolator; numerical residual/error/conditioning | sqrt(2) root residual; brentq requires bracket sign change and continuity; minimise (x−2)²; LP status unbounded/infeasible distinct; quadrature error estimate is diagnostic not proof |
| Geometry/differential geometry | SymPy Point/Line/Circle/Plane/intersection/distance; coordinate vectors and exact derivatives for curvature/torsion/fundamental forms; diffgeom Christoffel/Riemann/Ricci | unit circle curvature1; helix(cos t,sin t,t) curvature=torsion=1/2; sphere metric diag(1,sin²u), Gaussian curvature1; identify singular parametrisations |
| Topology | Finite simplicial complex as list of maximal simplices; generate all faces; signed boundary matrices over Q or GF(2); exact ranks give Betti numbers/Euler characteristic. Finite topology as finite open-set family | triangle boundary β=(1,1), filled triangle β=(1,0), tetrahedral surface β=(1,0,1); verify boundary²=0. Q/GF(2) homology does not report integral torsion |
| Additional scientific methods | SymPy units/convert_to, transforms/laplace/inverse_laplace/fourier_series; SciPy fft and signal convolution; exact Markov transition matrices; finite dimensional inner products/projections | 1 metre=100 centimetres; Laplace(exp(-a*t))=1/(s+a) with condition; FFT inverse round trip; Markov rows sum1, stationary distribution [1/2,1/2] for symmetric 2-state |

## Trust decisions

- Preserve original parsed expression and assumptions separately from its simplified result. Automatic simplification can erase excluded denominators; collect denominator restrictions before simplification.
- Use `solveset` for univariate solving. Official documentation warns `solve` can return an empty list ambiguously and can omit some roots. Keep ConditionSet, ImageSet and EmptySet distinct.
- Check for unevaluated Integral, Derivative, Sum, Product, Limit and transforms before claiming completion. Returning a SymPy expression is not automatically success.
- SymPy `pdsolve` implements first-order linear families only. It does not provide an unrestricted heat/wave/elliptic solver; add declared bounded numerical/spectral operations.
- SymPy `GF(p**n)` is not a prime-power field: GF(9) is integers modulo9 with zero divisors. Use prime p plus irreducible polynomial quotient, or label the ring accurately.
- Finite field representation: modulus prime p, irreducible polynomial m(a), reduced polynomial element a of degree <deg(m); all arithmetic reduces both coefficients mod p and polynomial mod m. Validate primality and irreducibility.
- Homology representation and algorithm follow standard boundary-matrix linear algebra. Do not infer topological equivalence from equal Betti numbers; no general fundamental-group or homeomorphism decision promise.
- General multivariate limits, convergence, symbolic zero tests, non-linear systems, and parameterised algebra may be undecided. Never infer nonexistence from a timeout or unsupported method.
- For finite algebra enumeration, enforce an output bound (for example group order≤256 for full tables/cosets/classes, ≤5000 simplices for topology). Basic group order via Schreier-Sims need not enumerate the group.

## Proofs actually run in SymPy 1.13.3

Local Python using unpacked engine packages confirmed: Gaussian special-function integral; dependent double integral=1/2; parameterised quintic returns ConditionSet; excluded x=1 equation returns EmptySet; S3 order/conjugacy/center/derived subgroup; F4 quotient product and inverse; Groebner ideal membership remainder0; transport PDE F(x−y); sphere first fundamental form diag(1,sin(u)^2). Browser and deployed runtime verification remains the implementation owner's separate gate.

## Official sources (accessed 2026-09-26)

- MIT mathematics, science and engineering methods curriculum: https://catalog.mit.edu/subjects/18/
- MIT computing/electrical engineering curriculum: https://catalog.mit.edu/subjects/6/
- NUS undergraduate mathematical breadth: https://www.math.nus.edu.sg/ug/majmin/primajors/
- TI-84 CE practical baseline: https://education.ti.com/en/products/calculators/graphing-calculators/ti-84-plus-ce-python
- SymPy solveset trust and output distinctions: https://docs.sympy.org/latest/modules/solvers/solveset.html
- SymPy matrix operations: https://docs.sympy.org/latest/modules/matrices/matrices.html
- SymPy PDE documented method scope: https://docs.sympy.org/latest/modules/solvers/pde.html
- SymPy permutation groups: https://docs.sympy.org/latest/modules/combinatorics/perm_groups.html
- SymPy finite domain limitation: https://docs.sympy.org/latest/modules/polys/domainsref.html
- SymPy polynomial/Groebner operations: https://docs.sympy.org/latest/modules/polys/reference.html
- SymPy differential geometry: https://docs.sympy.org/latest/modules/diffgeom.html
- SymPy number theory: https://docs.sympy.org/latest/modules/ntheory.html
- SymPy logic: https://docs.sympy.org/latest/modules/logic.html
- SymPy units: https://docs.sympy.org/latest/modules/physics/units/index.html
- SciPy statistics: https://docs.scipy.org/doc/scipy/reference/stats.html
- SciPy optimisation: https://docs.scipy.org/doc/scipy/reference/optimize.html
- SciPy numerical IVP/BVP: https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html ; https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_bvp.html
- NetworkX algorithms: https://networkx.org/documentation/stable/reference/algorithms/index.html
- Sage mature finite topology reference: https://doc.sagemath.org/html/en/reference/topology/sage/topology/simplicial_complex.html

The implementation mappings and recommended limits in the table are engineering decisions inferred from these foundations, not guarantees made by the curriculum sources.
