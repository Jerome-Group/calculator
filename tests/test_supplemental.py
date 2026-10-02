"""Meaningful exact mathematical verification; run with python -m unittest -v."""
import unittest
import sympy as s
from supplemental import (simplicial_homology, surface_geometry, quotient_arithmetic,
                          permutation_group_summary, relation_summary, finite_topology, topology_map)


class ExactSupplementalTests(unittest.TestCase):
    def test_homology_circle_disc_sphere_and_isolated_point(self):
        circle = simplicial_homology([[0, 1], [1, 2], [0, 2]])
        self.assertEqual(circle["betti"], [1, 1])
        self.assertEqual(circle["euler_characteristic"], 0)
        disc = simplicial_homology([[0, 1, 2]])
        self.assertEqual(disc["betti"], [1, 0, 0])
        sphere = simplicial_homology([[0,1,2], [0,1,3], [0,2,3], [1,2,3]])
        self.assertEqual(sphere["betti"], [1, 0, 1])
        self.assertEqual(sphere["euler_characteristic"], 2)
        self.assertTrue(sphere["boundary_squared_zero"])
        disconnected = simplicial_homology([[0,1], [1,2], [0,2], [3]])
        self.assertEqual(disconnected["betti"], [2, 1])
        self.assertEqual(disconnected["f_vector"], [4, 3])
        self.assertEqual(simplicial_homology([])["betti"], [])

    def test_homology_projective_plane_not_mod_two(self):
        rp2 = simplicial_homology([[1,2,3],[1,2,4],[1,3,5],[1,4,6],[1,5,6],
                                  [2,3,6],[2,4,5],[2,5,6],[3,4,5],[3,4,6]])
        self.assertEqual(rp2["f_vector"], [6,15,10])
        self.assertEqual(rp2["boundary_ranks"], [5,10])
        self.assertEqual(rp2["betti"], [1,0,0])
        self.assertIn("torsion", rp2["limitation"])

    def test_surface_plane_sphere_and_singular_coordinates(self):
        u,v=s.symbols("u v", real=True)
        plane = surface_geometry([u,v,0], [u,v])
        self.assertEqual(plane["metric"], s.eye(2))
        self.assertEqual(plane["gaussian_curvature"], 0)
        sphere = surface_geometry([s.sin(u)*s.cos(v),s.sin(u)*s.sin(v),s.cos(u)], [u,v], {u:s.pi/2,v:0})
        self.assertEqual(sphere["metric"], s.diag(1,s.sin(u)**2))
        self.assertEqual(sphere["gaussian_curvature"], 1)
        self.assertEqual(sphere["at_point"]["mean_curvature"], -1)
        self.assertEqual(s.simplify(sphere["christoffel"][0][1][1]+s.sin(u)*s.cos(u)), 0)
        with self.assertRaisesRegex(ValueError,"singular"):
            surface_geometry([s.sin(u)*s.cos(v),s.sin(u)*s.sin(v),s.cos(u)], [u,v], {u:0,v:0})
        with self.assertRaisesRegex(ValueError,"singular everywhere"):
            surface_geometry([u,0,0], [u,v])
        with self.assertRaisesRegex(ValueError,"Real-valuedness"):
            surface_geometry([s.I*u,s.I*v,0], [u,v])

    def test_surface_mixed_second_derivative_and_orientation(self):
        u,v=s.symbols("u v", real=True)
        result=surface_geometry([u,v,u*v],[u,v],{u:0,v:0})
        d=1+u*u+v*v
        self.assertEqual(s.simplify(result["gaussian_curvature"]+d**-2),0)
        self.assertEqual(s.simplify(result["mean_curvature"]+u*v/d**s.Rational(3,2)),0)
        self.assertEqual(result["at_point"]["gaussian_curvature"],-1)
        self.assertEqual(result["at_point"]["mean_curvature"],0)

    def test_genuine_finite_field_and_inverse(self):
        a=s.Symbol("a")
        kw=dict(prime=2,modulus=a*a+a+1,variable=a,left=a)
        square=quotient_arithmetic(**kw,operation="power",exponent=2)
        self.assertEqual(square["result"],a+1)
        self.assertEqual(square["order"],4)
        self.assertEqual(quotient_arithmetic(**kw,operation="power",exponent=3)["result"],1)
        self.assertEqual(quotient_arithmetic(**kw,operation="inverse")["result"],a+1)
        self.assertEqual(quotient_arithmetic(**kw,operation="multiply",right=a+1)["result"],1)
        self.assertEqual(quotient_arithmetic(3,a*a+1,a,a,"inverse")["result"],2*a)
        with self.assertRaisesRegex(ValueError,"prime"):
            quotient_arithmetic(4,a*a+a+1,a,a)

    def test_reducible_quotient_is_ring_with_zero_divisors(self):
        a=s.Symbol("a")
        with self.assertRaisesRegex(ValueError,"reducible"):
            quotient_arithmetic(2,a*a+1,a,a)
        square=quotient_arithmetic(2,a*a+1,a,a+1,"power",exponent=2,require_field=False)
        self.assertFalse(square["is_field"])
        self.assertEqual(square["result"],0)
        self.assertFalse(square["is_unit"])
        with self.assertRaisesRegex(ValueError,"no inverse"):
            quotient_arithmetic(2,a*a+1,a,a+1,"inverse",require_field=False)
        self.assertEqual(quotient_arithmetic(2,a*a+1,a,a,"inverse",require_field=False)["result"],a)
        with self.assertRaisesRegex(ValueError,"integer coefficients"):
            quotient_arithmetic(2,a*a+a+1,a,a/s.Integer(2))

    def test_permutation_groups_cosets_normality_and_natural_action(self):
        g=permutation_group_summary([[1,0,2],[1,2,0]], [[1,0,2]], 0)
        self.assertEqual(g["order"],6)
        self.assertEqual(sorted(map(len,g["conjugacy_classes"])),[1,2,3])
        self.assertEqual(g["center_order"],1)
        self.assertEqual(g["derived_subgroup_order"],3)
        self.assertEqual(g["stabilizer_order"],2)
        self.assertFalse(g["subgroup_normal"])
        self.assertFalse(g["quotient_group_exists"])
        self.assertNotEqual(g["left_cosets"],g["right_cosets"])
        self.assertEqual(len(g["left_cosets"]),3)
        self.assertEqual(len({tuple(x) for c in g["left_cosets"] for x in c}),6)
        a3=permutation_group_summary([[1,0,2],[1,2,0]], [[1,2,0]])
        self.assertTrue(a3["subgroup_normal"])
        self.assertEqual(a3["left_cosets"],a3["right_cosets"])

    def test_finite_relation_cycles_and_isolated_universe(self):
        result=relation_summary([0,1,2],[(0,0),(1,1),(0,1)])
        self.assertFalse(result["reflexive"])
        self.assertFalse(result["irreflexive"])
        self.assertFalse(result["symmetric"])
        self.assertTrue(result["antisymmetric"])
        self.assertTrue(result["transitive"])
        self.assertEqual(result["equivalence_closure_classes"],[[0,1],[2]])
        cycle=relation_summary([0,1,2],[(0,1),(1,2),(2,0)])
        self.assertTrue(cycle["asymmetric"])
        self.assertFalse(cycle["transitive"])
        self.assertEqual(len(cycle["transitive_closure"]),9)
        self.assertIn([0,0],cycle["transitive_closure"])

    def test_invalid_topology_and_sierpinski_invariants(self):
        invalid=finite_topology(["a","b","c"],[[],["a","b","c"],["a"],["b"]])
        self.assertFalse(invalid["valid_topology"])
        self.assertIn("unions",invalid["reason"])
        self.assertEqual(set(invalid["witness"]["missing"]),{"a","b"})
        result=finite_topology([0,1],[[],[1],[0,1]],subset=[1])
        self.assertTrue(result["T0"])
        self.assertFalse(result["T1"])
        self.assertFalse(result["hausdorff"])
        self.assertTrue(result["connected"])
        self.assertEqual(result["interior"],[1])
        self.assertEqual(result["closure"],[0,1])
        self.assertEqual(result["boundary"],[0])
        self.assertIn([0,1],result["specialization_pairs"])

    def test_continuity_preimages_and_homeomorphism(self):
        args=([0,1],[[],[1],[0,1]],[0,1],[[],[0],[0,1]])
        identity=topology_map(*args,images=[0,1])
        self.assertFalse(identity["continuous"])
        self.assertEqual(identity["continuity_failures"],[{"target_open":[0],"preimage":[0]}])
        swap=topology_map(*args,images=[1,0])
        self.assertTrue(swap["homeomorphism"])
        discrete=finite_topology([0,1],[[],[0],[1],[0,1]])
        self.assertTrue(discrete["hausdorff"])
        self.assertFalse(discrete["connected"])

    def test_bounds_and_structure_validation(self):
        with self.assertRaises(ValueError): simplicial_homology([range(8)])
        with self.assertRaises(ValueError): simplicial_homology([[0,0]])
        with self.assertRaises(ValueError): finite_topology(range(11),[[],range(11)])
        with self.assertRaises(ValueError): relation_summary([0,1],[(1,2)])
        with self.assertRaises(ValueError): permutation_group_summary([[0,0]])
        with self.assertRaisesRegex(ValueError,"order at most"):
            permutation_group_summary([[1,0,2,3,4,5],[1,2,3,4,5,0]])
        a=s.Symbol("a")
        with self.assertRaisesRegex(ValueError,"degree is bounded"):
            quotient_arithmetic(2,a*a+a+1,a,(a+1)**4096 * (a+2)**4096)


if __name__ == "__main__": unittest.main(verbosity=2)
