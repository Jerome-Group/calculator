import unittest, sympy as S
from calculator import Context
x,t=S.symbols('x t')
class ParserTests(unittest.TestCase):
 def context(self,defs=None,**settings):return Context({'settings':settings,'definitions':defs or []})
 def assertmath(self,got,want):self.assertEqual(S.simplify(got-want),0)
 def test_latex_unary_plus_identity_and_precedence(self):
  from latex_adapter import parse_math_latex
  samples=[('+2',2),('+x',x),('+2+3*4',14),('+2^3',8),('(+2)^3',8),(r'\frac{+2}{+4}',S.Rational(1,2)),(r'\frac{1}{2}+3',S.Rational(7,2)),(r'\frac{1}{2}+3+4',S.Rational(15,2)),(r'\frac{1}{2}3',S.Rational(3,2)),(r'x^{+2}',x**2),(r'\sqrt{+4}',2),(r'2\cdot(+3)',6),(r'2+(+3)',5),(r'\left(+2\right)',2),(r'\sin(+x)',S.sin(x))]
  for source,expected in samples:
   with self.subTest(source=source):
    parsed=parse_math_latex(source)
    self.assertEqual(parsed.original,source)
    self.assertmath(parsed.expression.doit(),expected)
  matrix=r'\begin{pmatrix}+2&+x\\3&+4\end{pmatrix}'
  for source in [matrix,'+'+matrix]:
   parsed=parse_math_latex(source)
   self.assertEqual(parsed.original,source)
   self.assertEqual(parsed.expression,S.ImmutableMatrix([[2,x],[3,4]]))
 def test_latex_unary_plus_strict_signs_and_limits(self):
  from latex_adapter import parse_math_latex,AmbiguousLatex
  for source in ['++2','+-2','-+2','--2','2++3','2+-3',r'2\cdot+3','+','2+','x^+2',r'\pm2',r'x^{+}',r'\lim_{x\to0^+}x']:
   with self.subTest(source=source),self.assertRaises(ValueError):parse_math_latex(source)
  # A directional plus is not an identity operator or a missing operand.
  self.assertEqual(parse_math_latex(r'\lim_{x\to0^{+}}\frac{1}{x}').expression.doit(),S.oo)
  self.assertEqual(parse_math_latex(r'\lim_{x\to0^{-}}\frac{1}{x}').expression.doit(),-S.oo)
  with self.assertRaises(AmbiguousLatex):parse_math_latex(r'\sin +x^2')
  with self.assertRaises(AmbiguousLatex):parse_math_latex(r'+\frac{1}{2}+3')
 def test_latex_unary_plus_fallback_preserves_original_parser(self):
  from unittest.mock import patch
  from latex_adapter import parse_math_latex,AmbiguousLatex
  with patch('latex_adapter._unary_plus_parser',side_effect=AssertionError('Only syntax failures may retry.')):
   for source,expected in [(r'\frac{1}{2}+3',S.Rational(7,2)),(r'\frac{1}{2}+3+4',S.Rational(15,2)),(r'\frac{1}{2}3',S.Rational(3,2)),('2+3*4',14)]:
    self.assertmath(parse_math_latex(source).expression.doit(),expected)
   with self.assertRaises(AmbiguousLatex):parse_math_latex(r'\frac{1}{2}-1')
   with self.assertRaises(AmbiguousLatex):parse_math_latex('f(x)')
   self.assertTrue(isinstance(parse_math_latex('x=2+3').expression,S.Equality))
 def test_latex_unary_plus_keeps_denominator_and_case_guards(self):
  from latex_adapter import parse_math_latex
  for source in [r'\frac{x}{+x}',r'+\frac{1}{x}',r'x^{+(-1)}']:
   parsed=parse_math_latex(source)
   self.assertEqual(parsed.original,source)
   self.assertEqual(parsed.excluded_denominators,[x])
  source=r'\begin{cases}+\frac{1}{+x}&x>0\\+0&\text{otherwise}\end{cases}'
  parsed=parse_math_latex(source)
  self.assertEqual(parsed.original,source)
  self.assertEqual(parsed.expression.subs(x,0),0)
  self.assertTrue(parsed.excluded_denominators)
  self.assertTrue(all(d.subs(x,0)!=0 for d in parsed.excluded_denominators))
 def test_latex_unary_plus_saved_references_and_degrees(self):
  defs=[{'name':'f','args':'t','expression':'(t^2-1)/(t-1)'},{'name':'A','expression':'1/x'}]
  c=self.context(defs)
  self.assertmath(c.parse('+f(+2)',latex=True).doit(),3)
  with self.assertRaisesRegex(ValueError,'denominator becomes zero'):self.context(defs).parse('+f(+1)',latex=True)
  c=self.context(defs);self.assertmath(c.parse('+A',latex=True),1/x);self.assertEqual(c.denominators,[x])
  self.assertmath(self.context(angle='deg').parse(r'+\sin(+30)',latex=True).doit(),S.Rational(1,2))
  self.assertmath(self.context(angle='deg').parse(r'\arcsin(+1)',latex=True).doit(),90)
 def test_degrees(self):
  c=self.context(angle='deg')
  self.assertmath(c.parse('sin(30)').doit(),S.Rational(1,2));self.assertmath(c.parse('asin(1)').doit(),90);self.assertmath(c.parse('atan2(1,1)').doit(),45)
  self.assertmath(S.diff(c.parse('sin(x)'),x),S.pi*S.cos(S.pi*x/180)/180)
 def test_latex_degrees(self):
  c=self.context(angle='deg')
  for latex,expected in [(r'\sin(30)',S.Rational(1,2)),(r'\arcsin(1)',90),(r'\sin^{-1}(1)',90),(r'\sin^2(30)',S.Rational(1,4)),(r'\sin(\pi/2)',S.sin(S.pi**2/360))]:
   self.assertmath(c.parse(latex,latex=True).doit(),expected)
 def test_function_degrees(self):
  c=self.context([{'name':'f','args':'x','expression':'sin(x)'}],angle='deg')
  self.assertmath(c.parse('f(30)').doit(),S.Rational(1,2));self.assertmath(c.parse('f(30)',latex=True).doit(),S.Rational(1,2))
 def test_reference_provenance(self):
  c=self.context([{'name':'f','args':'x','expression':'(x^2-1)/(x-1)'},{'name':'b','expression':'1/(t-3)'}])
  self.assertEqual(c.denominators,[])
  self.assertmath(c.parse('2+2').doit(),4);self.assertEqual(c.denominators,[])
  self.assertmath(c.parse('f(2)').doit(),3);self.assertEqual(c.denominators,[])
  c.parse('b');self.assertEqual(c.denominators,[t-3])
 def test_function_exclusions(self):
  definitions=[{'name':'f','args':'x','expression':'(x^2-1)/(x-1)'}]
  for latex in [False,True]:
   c=self.context(definitions);c.parse('f(t)',latex=latex);self.assertEqual(c.denominators,[t-1])
   with self.assertRaisesRegex(ValueError,'denominator becomes zero'):c.parse('f(1)',latex=latex)
 def test_nested_functions(self):
  defs=[{'name':'f','args':'x','expression':'1/(x-1)'},{'name':'g','args':'t','expression':'f(t+1)'}]
  c=self.context(defs);self.assertmath(c.parse('g(2)').doit(),S.Rational(1,2));self.assertEqual(c.denominators,[])
  with self.assertRaises(ValueError):c.parse('g(0)')
  c.parse('g(x)');self.assertEqual(c.denominators,[x])
 def test_recursive_denominators(self):
  for source in ['[(x^2-1)/(x-1)-2,y]','[[1/(x-1),2],[3,4]]','{x:1/(t-3)}','Eq(1/(x-1),2)']:
   c=self.context();c.parse(source);self.assertTrue(c.denominators,source)
  c=self.context();c.parse('simplify((x^2-1)/(x-1))');self.assertEqual(c.denominators,[x-1])
 def test_equations(self):
  c=self.context();eqs=c.parse('[x+y=3,x-y=1]');vs=c.parse('[x,y]')
  self.assertTrue(all(isinstance(e,S.Equality) for e in eqs));self.assertEqual(S.linsolve([S.expand(e.lhs-e.rhs) for e in eqs],vs),S.FiniteSet((2,1)))
  self.assertEqual(c.parse('factor(x^2+1,modulus=2)'),(x+1)**2)
 def test_conflicts(self):
  for defs,settings in [([{'name':'pi','expression':'3'}],{}),([{'name':'x','expression':'3'}],{'assumptions':'x:real'}),([{'name':'f','args':'x,x','expression':'x'}],{}),([{'name':'a','expression':'b'},{'name':'b','expression':'a'}],{})]:
   with self.assertRaises(ValueError):self.context(defs,**settings)
 def test_assumption_argument(self):
  c=self.context([{'name':'f','args':'x','expression':'simplify(sqrt(x^2))'}],assumptions='x:positive')
  with self.assertRaises(ValueError):c.parse('f(-1)')
  self.assertmath(c.parse('f(t)'),t);self.assertTrue(any('t is positive' in n for n in c.notes))
 def test_nested_assumption(self):
  c=self.context([{'name':'f','args':'x','expression':'simplify(sqrt(x^2))'},{'name':'g','args':'t','expression':'f(t)'}],assumptions='x:positive')
  with self.assertRaises(ValueError):c.parse('g(-1)')
  self.assertmath(c.parse('g(2)'),2)
 def test_piecewise_domain(self):
  for latex,text in [(False,'Piecewise((1/x,x>0),(0,True))'),(True,r'\begin{cases}\frac{1}{x}&x>0\\0&\text{otherwise}\end{cases}')]:
   c=self.context();expr=c.parse(text,latex=latex);result=S.solveset(expr,x,domain=S.S.Reals)
   for den in c.denominators:result=S.Complement(result,S.solveset(den,x,domain=S.S.Reals))
   self.assertEqual(result,S.Interval(-S.oo,0))
  c=self.context();c.parse('1/x+Piecewise((1/x,x>0),(0,True))');self.assertIn(x,c.denominators)
 def test_piecewise_named_domain(self):
  defs=[{'name':'f','args':'x','expression':'simplify((x^2-1)/(x-1))'},{'name':'a','expression':'1/x'}]
  for latex,text in [(False,'Piecewise((f(x),x>2),(0,True))'),(True,r'\begin{cases}f(x)&x>2\\0&\text{otherwise}\end{cases}')]:
   c=self.context(defs);expr=c.parse(text,latex=latex)
   self.assertEqual(expr.subs(x,1).doit(),0)
   self.assertTrue(all(d.subs(x,1)!=0 for d in c.denominators))
  c=self.context(defs);c.parse('Piecewise((a,x>0),(0,True))');self.assertTrue(all(d.subs(x,0)!=0 for d in c.denominators))
 def test_piecewise_cancelled_denominator(self):
  c=self.context();c.parse('Piecewise((simplify((x^2-1)/(x-1)),x>0),(0,True))')
  self.assertTrue(any(d.subs(x,1)==0 for d in c.denominators))
  self.assertTrue(all(d.subs(x,0)!=0 for d in c.denominators))
 def test_undefined(self):
  for text in ['0/0','1/(x-x)','simplify(0/0)']:
   with self.assertRaises(ValueError):self.context().parse(text)
 def test_shadowing(self):
  c=self.context([{'name':'x','expression':'5'},{'name':'f','args':'x','expression':'x^2'}])
  self.assertmath(c.parse('f(3)').doit(),9)
if __name__=='__main__':unittest.main()
