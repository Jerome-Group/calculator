import unittest,sympy as S
from calculator import Context
from calculator import parameter_linear_cases, filter_system_exclusions, checked_numeric_derivative
x,y,a,b=S.symbols('x y a b')
class DomainTests(unittest.TestCase):
 def test_extraneous_system_root(self):
  c=Context({});eqs=c.parse('[(x^2-1)/(x-1)-2,y]');r=S.nonlinsolve(eqs,[x,y])
  self.assertEqual(r,S.FiniteSet((1,0)));self.assertEqual(filter_system_exclusions(r,[x,y],c.denominators),S.S.EmptySet)
 def test_system_valid_and_conditional(self):
  self.assertEqual(filter_system_exclusions(S.FiniteSet((1,0),(2,0)),[x,y],[x-1]),S.FiniteSet((2,0)))
  r=filter_system_exclusions(S.FiniteSet((a,0)),[x,y],[x-1]);self.assertEqual(r['conditional solutions'][0]['required condition'],S.Ne(a-1,0))
 def test_parameter_linear(self):
  for expr,conditions in [(a*x,[({a:0},S.S.Reals),({a:2},S.FiniteSet(0))]),(a*x+b,[({a:0,b:0},S.S.Reals),({a:0,b:1},S.S.EmptySet),({a:2,b:4},S.FiniteSet(-2))])]:
   r=parameter_linear_cases(expr,x,S.S.Reals)
   for subs,want in conditions:
    selected=[q['solutions'].subs(subs,simultaneous=True) for q in r['parameter cases'] if q['when'].subs(subs,simultaneous=True) is S.true]
    self.assertEqual(selected,[want])
 def test_parameter_constant(self):
  r=parameter_linear_cases(a,x,S.S.Reals)
  self.assertEqual(len(r['parameter cases']),2)
  self.assertIsNone(parameter_linear_cases(x*x-1,x,S.S.Reals))
 def test_derivative_corner(self):
  with self.assertRaisesRegex(ValueError,'derivative does not exist'):checked_numeric_derivative(S.Abs(x),x,0,1e-4)
  with self.assertRaises(ValueError):checked_numeric_derivative(S.sign(x),x,0,1e-4)
 def test_smooth_derivative(self):
  r=checked_numeric_derivative(S.sin(x),x,1,1e-4);self.assertAlmostEqual(r['central difference'],float(S.cos(1)),places=8)
  r=checked_numeric_derivative(x*x,x,0,1e-4);self.assertEqual(r['central difference'],0)
if __name__=='__main__':unittest.main()
