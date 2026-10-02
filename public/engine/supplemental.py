"""Bounded exact undergraduate mathematical operations (research prototype).

Inputs are structured Python values and already-parsed SymPy expressions. The UI
must parse user notation before calling these functions and run work in its
cancellable worker. No string evaluation or parsing is done here.

Dependencies: SymPy 1.13.3+, NetworkX 3.4.2+. Returned matrices/expressions are
reusable mathematical objects; the integrating engine owns JSON/LaTeX rendering.
"""
from itertools import combinations
import sympy as s
import networkx as nx
from sympy.combinatorics import Permutation, PermutationGroup
from sympy.polys.matrices import DomainMatrix
from sympy.polys.polyerrors import CoercionFailed

MAX_VERTICES = 64
MAX_SIMPLICES = 512
MAX_SIMPLEX_SIZE = 7
MAX_BOUNDARY_CELLS = 150_000
MAX_RELATION_POINTS = 64
MAX_TOPOLOGY_POINTS = 10
MAX_OPEN_SETS = 1024
MAX_GROUP_DEGREE = 16
MAX_GROUP_ORDER = 256
MAX_FIELD_ORDER = 65536
MAX_FIELD_DEGREE = 12
MAX_EXPR_OPS = 600


def _unique(values, label, maximum):
    values = list(values)
    if len(values) > maximum:
        raise ValueError(f"{label}: at most {maximum} entries are supported.")
    try:
        if len(set(values)) != len(values):
            raise ValueError(f"{label}: entries must be distinct.")
    except TypeError as exc:
        raise ValueError(f"{label}: entries must be hashable labels.") from exc
    return values


def _expr(value):
    if isinstance(value, str):
        raise TypeError("Supply parsed mathematical expressions, not strings.")
    result = s.sympify(value)
    if not isinstance(result, s.Expr):
        raise TypeError("Expected a scalar expression.")
    if s.count_ops(result) > MAX_EXPR_OPS:
        raise ValueError(f"Expression exceeds {MAX_EXPR_OPS} operations.")
    return result


def simplicial_homology(facets):
    """Ordinary rational homology of a finite simplicial complex.

    facets: iterable of nonempty vertex-label iterables. All subfaces are added;
    redundant/duplicate facets are accepted. [] means the empty complex.
    Boundary matrices use vertices ordered by first appearance and the standard
    alternating orientation. Betti numbers over Q do not identify integral torsion.
    """
    raw = list(facets)
    if len(raw) > MAX_SIMPLICES:
        raise ValueError(f"At most {MAX_SIMPLICES} input facets are supported.")
    vertices, prepared = [], []
    for facet in raw:
        f = _unique(facet, "Simplex", MAX_SIMPLEX_SIZE)
        if not f:
            raise ValueError("Use [] for the empty complex; a simplex must have a vertex.")
        for vertex in f:
            if vertex not in vertices:
                vertices.append(vertex)
        if len(vertices) > MAX_VERTICES:
            raise ValueError(f"At most {MAX_VERTICES} vertices are supported.")
        prepared.append(f)
    index = {vertex: i for i, vertex in enumerate(vertices)}
    faces = set()
    for facet in prepared:
        ordered = sorted(index[v] for v in facet)
        for k in range(1, len(ordered) + 1):
            faces.update(combinations(ordered, k))
        if len(faces) > MAX_SIMPLICES:
            raise ValueError(f"Face closure exceeds {MAX_SIMPLICES} simplices.")
    dimension = max((len(f) - 1 for f in faces), default=-1)
    levels = [sorted(f for f in faces if len(f) == k + 1) for k in range(dimension + 1)]
    sizes = [len(level) for level in levels]
    if sum(a * b for a, b in zip(sizes, sizes[1:])) > MAX_BOUNDARY_CELLS:
        raise ValueError("Boundary matrix work exceeds the supported size.")
    boundaries, ranks = [], [0]
    for k in range(1, dimension + 1):
        rows = {face: i for i, face in enumerate(levels[k - 1])}
        entries = {}
        for j, simplex in enumerate(levels[k]):
            for i in range(k + 1):
                face = simplex[:i] + simplex[i + 1:]
                entries[rows[face], j] = (-1) ** i
        boundary = s.SparseMatrix(sizes[k - 1], sizes[k], entries)
        boundaries.append(boundary)
        ranks.append(DomainMatrix.from_Matrix(boundary).convert_to(s.QQ).rank())
    ranks.append(0)
    chain_verified = all(a * b == s.zeros(a.rows, b.cols)
                         for a, b in zip(boundaries, boundaries[1:]))
    if not chain_verified:
        raise ArithmeticError("Internal boundary-composition verification failed.")
    betti = [sizes[k] - ranks[k] - ranks[k + 1] for k in range(len(sizes))]
    euler = sum((-1) ** k * n for k, n in enumerate(sizes))
    if euler != sum((-1) ** k * n for k, n in enumerate(betti)):
        raise ArithmeticError("Internal Euler-characteristic verification failed.")
    return {"coefficient_field": "Q", "dimension": dimension, "vertices": vertices,
            "simplices": [[[vertices[i] for i in face] for face in level] for level in levels],
            "f_vector": sizes, "boundary_matrices": boundaries,
            "boundary_ranks": ranks[1:-1], "betti": betti, "euler_characteristic": euler,
            "boundary_squared_zero": chain_verified,
            "limitation": "Rational homology; integral torsion is not computed."}


def surface_geometry(position, coordinates, point=None):
    """Forms/curvature of r(u,v) in R3; orientation is r_u cross r_v.

    coordinates must be two distinct real SymPy Symbols. point optionally maps
    these symbols to real values for exact regularity checking. Returned formulas
    apply only where det(metric)>0 and the entered parametrisation is smooth.
    """
    coords = list(coordinates)
    if len(coords) != 2 or len(set(coords)) != 2 or any(
            not isinstance(x, s.Symbol) or x.is_real is not True for x in coords):
        raise ValueError("Supply two distinct real coordinate symbols.")
    position = list(position)
    if len(position) != 3:
        raise ValueError("A surface position must have three components.")
    r = s.Matrix([_expr(x) for x in position])
    if any(value.is_real is not True and s.simplify(s.im(value)) != 0 for value in r):
        raise ValueError("Real-valuedness of the surface is unproved. Supply real/positive symbol assumptions or use a real parametrisation.")
    u, v = coords
    tangents = [r.diff(u), r.diff(v)]
    cross = tangents[0].cross(tangents[1])
    q = s.simplify(cross.dot(cross))
    if q == 0:
        raise ValueError("This parametrisation is singular everywhere (zero area factor).")
    g = s.Matrix(2, 2, lambda i, j: s.simplify(tangents[i].dot(tangents[j])))
    area = s.sqrt(q)
    normal = cross / area
    b_raw = s.Matrix(2, 2, lambda i, j: s.simplify(cross.dot(r.diff(coords[i], coords[j]))))
    b = b_raw.applyfunc(lambda value: s.simplify(value / area))
    g_inv = g.inv().applyfunc(s.simplify)
    shape = (g_inv * b).applyfunc(s.simplify)
    gaussian = s.simplify(b_raw.det() / q ** 2)
    mean = s.simplify((g[1, 1] * b_raw[0, 0] - 2 * g[0, 1] * b_raw[0, 1]
                       + g[0, 0] * b_raw[1, 1]) / (2 * q ** s.Rational(3, 2)))
    christoffel = [[[s.simplify(sum(g_inv[k, l] * (
        s.diff(g[l, j], coords[i]) + s.diff(g[l, i], coords[j]) - s.diff(g[i, j], coords[l]))
        for l in range(2)) / 2) for j in range(2)] for i in range(2)] for k in range(2)]
    result = {"position": r, "coordinates": coords, "metric": g,
              "metric_determinant": q, "area_factor": area, "unit_normal": normal,
              "second_fundamental_form": b, "shape_operator": shape,
              "gaussian_curvature": gaussian, "mean_curvature": mean,
              "scalar_curvature": 2 * gaussian, "christoffel": christoffel,
              "regular_when": s.Gt(q, 0),
              "convention": "normal = r_u cross r_v / norm; b_ij = normal dot r_ij; H = trace(shape)/2",
              "limitation": "Formulas require a smooth real parametrisation and positive metric determinant. Charts whose real domain cannot be established from symbol assumptions are rejected."}
    if point is not None:
        if set(point) != set(coords):
            raise ValueError("A point must give a value for both coordinates and no others.")
        point = {key: _expr(value) for key, value in point.items()}
        if any(value.is_real is not True for value in point.values()):
            raise ValueError("Point coordinates must be real.")
        at_q = s.simplify(q.subs(point))
        if at_q.is_positive is not True:
            raise ValueError("The parametrisation is singular or regularity is undecided at this point.")
        result["at_point"] = {"metric": g.subs(point), "gaussian_curvature": s.simplify(gaussian.subs(point)),
                              "mean_curvature": s.simplify(mean.subs(point)), "metric_determinant": at_q}
    return result


def quotient_arithmetic(prime, modulus, variable, left, operation="reduce", right=None, exponent=None,
                        require_field=True):
    """Arithmetic in F_p[a]/(m); validates the distinction between field and ring.

    Polynomial coefficients must be integers. Operations: reduce, add, subtract,
    multiply, divide, inverse, power. Power exponent is an integer |n|<=1000000.
    All polynomial elements returned have degree below the modulus degree.
    """
    if (isinstance(prime, bool) or not isinstance(prime, (int, s.Integer))
            or not 2 <= prime <= MAX_FIELD_ORDER or not s.isprime(prime)):
        raise ValueError("The coefficient modulus must be a prime integer.")
    p = int(prime)
    if not isinstance(variable, s.Symbol):
        raise ValueError("Supply a polynomial variable symbol.")
    def poly(value, max_degree=4096):
        expression = _expr(value)
        if expression.free_symbols - {variable}:
            raise ValueError("Polynomial elements may contain only the chosen generator.")
        def degree_bound(term):
            if not term.has(variable): return 0
            if term == variable: return 1
            if term.is_Add: bound = max(degree_bound(arg) for arg in term.args)
            elif term.is_Mul: bound = sum(degree_bound(arg) for arg in term.args)
            elif term.is_Pow and term.exp.is_Integer and term.exp >= 0:
                bound = degree_bound(term.base) * int(term.exp)
            else: raise ValueError("Supply a polynomial with integer coefficients.")
            if bound > max_degree:
                raise ValueError(f"Polynomial degree is bounded to {max_degree} before reduction.")
            return bound
        degree_bound(expression)
        try:
            return s.Poly(expression, variable, modulus=p)
        except (s.PolynomialError, CoercionFailed) as exc:
            raise ValueError("Supply a polynomial with integer coefficients.") from exc
    m = poly(modulus, MAX_FIELD_DEGREE)
    degree = m.degree()
    if degree < 1 or degree > MAX_FIELD_DEGREE:
        raise ValueError(f"Modulus degree must lie between 1 and {MAX_FIELD_DEGREE}.")
    if p ** degree > MAX_FIELD_ORDER:
        raise ValueError(f"The quotient may have at most {MAX_FIELD_ORDER} elements.")
    m = m.monic()
    is_field = bool(m.is_irreducible)
    if require_field and not is_field:
        raise ValueError("The modulus polynomial is reducible; this quotient is a ring, not a field.")
    a = poly(left).rem(m)
    b = poly(right).rem(m) if right is not None else None
    if operation in {"add", "subtract", "multiply", "divide"} and b is None:
        raise ValueError("This operation requires a right operand.")
    def inverse(value):
        if value.is_zero or value.gcd(m).degree() != 0:
            raise ValueError("This element has no inverse in the quotient.")
        return value.invert(m)
    if operation == "reduce": result = a
    elif operation == "add": result = (a + b).rem(m)
    elif operation == "subtract": result = (a - b).rem(m)
    elif operation == "multiply": result = (a * b).rem(m)
    elif operation == "divide": result = (a * inverse(b)).rem(m)
    elif operation == "inverse": result = inverse(a).rem(m)
    elif operation == "power":
        if isinstance(exponent, bool) or not isinstance(exponent, (int, s.Integer)) or abs(exponent) > 1_000_000:
            raise ValueError("Power requires an integer exponent with absolute value at most 1000000.")
        power = int(exponent)
        base = inverse(a) if power < 0 else a
        power = abs(power)
        result = s.Poly(1, variable, modulus=p)
        while power:
            if power & 1: result = (result * base).rem(m)
            base = (base * base).rem(m)
            power //= 2
    else:
        raise ValueError("Unknown quotient arithmetic operation.")
    coefficients = [int(result.nth(i)) % p for i in range(degree)]
    canonical = s.Add(*(s.Integer(c) * variable ** i for i, c in enumerate(coefficients)))
    return {"characteristic": p, "degree": int(degree), "order": p ** degree,
            "modulus": m.as_expr(), "is_field": is_field,
            "kind": "finite field" if is_field else "finite quotient ring",
            "result": canonical, "coefficients_ascending": coefficients,
            "is_unit": not result.is_zero and result.gcd(m).degree() == 0,
            "convention": "Coefficients reduced modulo p, polynomials reduced modulo the stated monic modulus."}


def permutation_group_summary(generators, subgroup_generators=None, action_point=0):
    """Finite permutation group from full zero-based image lists.

    E.g. [[1,0,2],[1,2,0]] generates S3. Multiplication follows SymPy:
    (p*q)(i)=q(p(i)), so p acts first. Both algebraic left/right cosets
    are returned with that explicit convention. A subgroup has a quotient GROUP
    only if normal. The action summarised is the natural action on 0..degree-1.
    """
    generators = list(generators)
    if not generators or len(generators) > 16:
        raise ValueError("Supply between 1 and 16 generators.")
    degree = len(generators[0])
    if not 1 <= degree <= MAX_GROUP_DEGREE:
        raise ValueError(f"Permutation degree must lie between 1 and {MAX_GROUP_DEGREE}.")
    def perm(images):
        images = list(images)
        if len(images) != degree or set(images) != set(range(degree)) or any(
                isinstance(i, bool) or not isinstance(i, (int, s.Integer)) for i in images):
            raise ValueError("Each generator must be a full permutation of zero-based labels.")
        return Permutation([int(i) for i in images])
    group = PermutationGroup([perm(g) for g in generators])
    order = int(group.order())
    if order > MAX_GROUP_ORDER:
        raise ValueError(f"Enumeration requires group order at most {MAX_GROUP_ORDER}; this order is {order}.")
    if isinstance(action_point, bool) or not isinstance(action_point, (int, s.Integer)) or not 0 <= action_point < degree:
        raise ValueError("The action point must be one of the zero-based labels.")
    identity = Permutation(list(range(degree)))
    subgroup_input = list(subgroup_generators) if subgroup_generators is not None else [list(range(degree))]
    if not 1 <= len(subgroup_input) <= 16:
        raise ValueError("Supply between 1 and 16 subgroup generators.")
    h_generators = [perm(g) for g in subgroup_input]
    if any(not group.contains(g) for g in h_generators):
        raise ValueError("A proposed subgroup generator is not an element of the group.")
    subgroup = PermutationGroup(h_generators)
    key = lambda p: tuple(p(i) for i in range(degree))
    elements = sorted(group.generate_schreier_sims(), key=key)
    h_elements = list(subgroup.generate_schreier_sims())
    def cosets(side):
        seen, result = set(), []
        for g in elements:
            c = frozenset(key(g*h if side == "left" else h*g) for h in h_elements)
            if c not in seen:
                seen.add(c)
                result.append([list(x) for x in sorted(c)])
        return result
    classes = sorted(group.conjugacy_classes(), key=lambda c: (len(c), sorted(map(key, c))))
    orbit = sorted(group.orbit(int(action_point)))
    stabilizer = group.stabilizer(int(action_point))
    stabilizer_order = int(stabilizer.order())
    if len(orbit) * stabilizer_order != order:
        raise ArithmeticError("Orbit-stabilizer verification failed.")
    return {"degree": degree, "order": order, "identity": list(key(identity)),
            "elements": [list(key(p)) for p in elements],
            "element_orders": [int(p.order()) for p in elements],
            "abelian": bool(group.is_abelian), "center_order": int(group.center().order()),
            "derived_subgroup_order": int(group.derived_subgroup().order()),
            "conjugacy_classes": [[list(x) for x in sorted(map(key, c))] for c in classes],
            "orbits": [sorted(o) for o in group.orbits()], "action_point": int(action_point),
            "orbit": orbit, "stabilizer_order": stabilizer_order,
            "subgroup_order": int(subgroup.order()), "subgroup_normal": bool(subgroup.is_normal(group)),
            "subgroup_index": order // int(subgroup.order()),
            "left_cosets": cosets("left"), "right_cosets": cosets("right"),
            "quotient_group_exists": bool(subgroup.is_normal(group)),
            "composition_convention": "Zero-based images; (p*q)(i)=q(p(i)). Left cosets g*H; right cosets H*g.",
            "limitation": "Natural permutation action; full group enumeration is bounded to order 256."}


def relation_summary(universe, pairs):
    """Finite relation properties and closures, retaining isolated points."""
    points = _unique(universe, "Relation universe", MAX_RELATION_POINTS)
    allowed = set(points)
    pairs = list(pairs)
    if len(pairs) > MAX_RELATION_POINTS ** 2:
        raise ValueError("Too many relation pairs.")
    relation = set()
    for pair in pairs:
        pair = tuple(pair)
        if len(pair) != 2 or any(x not in allowed for x in pair):
            raise ValueError("Every relation pair must contain two members of the universe.")
        relation.add(pair)
    graph = nx.DiGraph()
    graph.add_nodes_from(points)
    graph.add_edges_from(relation)
    closure = nx.transitive_closure(graph, reflexive=False)
    transitive = set(closure.edges()).issubset(relation)
    reflexive = all((x, x) in relation for x in points)
    symmetric = all((b, a) in relation for a, b in relation)
    antisymmetric = all(a == b or (b, a) not in relation for a, b in relation)
    irreflexive = all((x, x) not in relation for x in points)
    asymmetric = all((b, a) not in relation for a, b in relation)
    index = {x: i for i, x in enumerate(points)}
    ordered = lambda edges: [list(e) for e in sorted(edges, key=lambda p: (index[p[0]], index[p[1]]))]
    equivalence_components = [sorted(c, key=index.get) for c in nx.connected_components(graph.to_undirected())]
    return {"universe": points, "pairs": ordered(relation), "reflexive": reflexive,
            "irreflexive": irreflexive, "symmetric": symmetric, "antisymmetric": antisymmetric,
            "asymmetric": asymmetric, "transitive": transitive,
            "equivalence_relation": reflexive and symmetric and transitive,
            "partial_order": reflexive and antisymmetric and transitive,
            "strict_partial_order": irreflexive and transitive,
            "total_order": reflexive and antisymmetric and transitive and all(
                a == b or (a, b) in relation or (b, a) in relation for a in points for b in points),
            "reflexive_closure": ordered(relation | {(x, x) for x in points}),
            "symmetric_closure": ordered(relation | {(b, a) for a, b in relation}),
            "transitive_closure": ordered(closure.edges()),
            "equivalence_closure_classes": equivalence_components}


def finite_topology(universe, open_sets, subset=None):
    """Validate and compute a finite topological space from its FULL open family.

    Returns a concrete closure witness when invalid. On a finite family, binary
    union/intersection closure plus empty/full sets gives the topology axioms.
    """
    points = _unique(universe, "Topological universe", MAX_TOPOLOGY_POINTS)
    all_points = frozenset(points)
    opened = list(open_sets)
    if len(opened) > MAX_OPEN_SETS:
        raise ValueError(f"At most {MAX_OPEN_SETS} open sets are supported.")
    family = set()
    for value in opened:
        value = frozenset(value)
        if not value <= all_points:
            raise ValueError("Open sets must be subsets of the universe.")
        family.add(value)
    index = {x: i for i, x in enumerate(points)}
    as_list = lambda value: sorted(value, key=index.get)
    ordered = lambda values: [as_list(v) for v in sorted(values, key=lambda v: (len(v), [index[x] for x in as_list(v)]))]
    def invalid(reason, **witness):
        return {"valid_topology": False, "universe": points, "reason": reason, "witness": witness}
    if frozenset() not in family:
        return invalid("The empty set is missing.")
    if all_points not in family:
        return invalid("The whole universe is missing.")
    listed = list(family)
    for a, b in combinations(listed, 2):
        if a | b not in family:
            return invalid("The family is not closed under unions.", first=as_list(a), second=as_list(b), missing=as_list(a|b))
        if a & b not in family:
            return invalid("The family is not closed under intersections.", first=as_list(a), second=as_list(b), missing=as_list(a&b))
    minimal = {x: frozenset.intersection(*(o for o in family if x in o)) for x in points}
    specialization = {(x, y) for x in points for y in minimal[x]}
    connected_graph = nx.Graph()
    connected_graph.add_nodes_from(points)
    connected_graph.add_edges_from(specialization)
    components = [sorted(c, key=index.get) for c in nx.connected_components(connected_graph)]
    closed = {all_points - o for o in family}
    t0 = all(minimal[a] != minimal[b] for a, b in combinations(points, 2))
    t1 = all(minimal[x] == {x} for x in points)
    hausdorff = all(not (minimal[a] & minimal[b]) for a, b in combinations(points, 2))
    result = {"valid_topology": True, "universe": points, "open_sets": ordered(family),
              "closed_sets": ordered(closed), "clopen_sets": ordered(family & closed),
              "T0": t0, "T1": t1, "hausdorff": hausdorff,
              "connected": not all_points or len(components) == 1,
              "connected_components": components, "compact": True,
              "minimal_neighborhoods": [{"point": x, "neighborhood": as_list(minimal[x])} for x in points],
              "specialization_pairs": [[x,y] for x in points for y in points if (x,y) in specialization],
              "specialization_convention": "x <= y iff every open neighborhood of x contains y.",
              "limitation": "Finite spaces only; the input must enumerate every open set."}
    if subset is not None:
        subset = frozenset(subset)
        if not subset <= all_points:
            raise ValueError("The inspected set must be a subset of the universe.")
        interior = frozenset.union(frozenset(), *(o for o in family if o <= subset))
        closure = frozenset.intersection(*(c for c in closed if subset <= c))
        result["subset"] = as_list(subset)
        result["interior"] = as_list(interior)
        result["closure"] = as_list(closure)
        result["boundary"] = as_list(closure - interior)
    return result


def topology_map(source_universe, source_opens, target_universe, target_opens, images):
    """Continuity and homeomorphism of a finite map; images align to source order."""
    source = finite_topology(source_universe, source_opens)
    target = finite_topology(target_universe, target_opens)
    if not source["valid_topology"] or not target["valid_topology"]:
        raise ValueError("Source and target must both be valid topologies.")
    domain, codomain = source["universe"], target["universe"]
    images = list(images)
    if len(images) != len(domain) or any(y not in codomain for y in images):
        raise ValueError("Supply exactly one target value per source point.")
    mapping = dict(zip(domain, images))
    source_family = {frozenset(o) for o in source["open_sets"]}
    target_family = {frozenset(o) for o in target["open_sets"]}
    failures = []
    for opened in target["open_sets"]:
        preimage = frozenset(x for x in domain if mapping[x] in opened)
        if preimage not in source_family:
            failures.append({"target_open": opened, "preimage": [x for x in domain if x in preimage]})
    bijective = len(set(images)) == len(domain) == len(codomain)
    open_map = all(frozenset(mapping[x] for x in opened) in target_family for opened in source_family)
    return {"continuous": not failures, "continuity_failures": failures,
            "bijective": bijective, "open_map": open_map,
            "homeomorphism": bijective and not failures and open_map,
            "mapping": [{"source": x, "target": mapping[x]} for x in domain]}
