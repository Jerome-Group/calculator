import unittest,json,math
import sympy as S
from calculator import compute_json
class CurrentDispatchTests(unittest.TestCase):
 def call(self,op,params=None,settings=None,input='',mode='text',definitions=None):
  out=json.loads(compute_json(json.dumps({'operation':op,'params':params or {},'settings':{'precision':30,'angle':'rad','domain':'real',**(settings or {})},'input':input,'mode':mode,'definitions':definitions or []})))
  self.assertNotEqual(out['status'],'error',out)
  return out
 def test_proportion(self):
  d=self.call('proportion',{'counts':'[40,100]','action':'one-sample interval'})['details'];self.assertAlmostEqual(d['Wilson lower'],.30940128643245896,places=12);self.assertAlmostEqual(d['Wilson upper'],.4979974132089382,places=12)
  d=self.call('proportion',{'counts':'[40,100]','action':'one-sample test','null':'0.5','tail':'less'})['details'];self.assertAlmostEqual(d['z'],-2);self.assertAlmostEqual(d['p-value'],.0227501319481792,places=12)
  d=self.call('proportion',{'counts':'[40,100,60,100]','action':'two-sample test'})['details'];self.assertAlmostEqual(d['z'],-2.82842712474619,places=12)
 def test_two_means(self):
  d=self.call('two_mean_interval',{'data':'[1,2,3,4,5]','other':'[2,3,4,5,6]','kind':'Welch'})['details'];self.assertAlmostEqual(d['lower'],-3.306004135204166,places=11);self.assertEqual(d['degrees of freedom'],8)
  d=self.call('two_mean_interval',{'data':'[1,2,3]','other':'[2,3,4]','kind':'paired'})['details'];self.assertEqual((d['lower'],d['upper']),(-1,-1))
 def test_expectation(self):
  d=self.call('expectation',{'value':'x','weight':'2*x','variable':'x','lower':'0','upper':'1','kind':'continuous'})['details'];self.assertEqual(d['expectation'],'2/3');self.assertEqual(d['variance'],'1/18')
  d=self.call('expectation',{'value':'x','weight':'1/6','variable':'x','lower':'1','upper':'6','kind':'discrete'})['details'];self.assertEqual(d['expectation'],'7/2');self.assertEqual(d['variance'],'35/12')
  out=json.loads(compute_json(json.dumps({'operation':'expectation','params':{'weight':'x','value':'x','lower':'0','upper':'1'}})));self.assertEqual(out['status'],'error')
 def test_sin_fit(self):
  xs=[i/2 for i in range(17)];ys=[2*math.sin(1.2*x+.3)+1 for x in xs]
  d=self.call('regression',{'x':str(xs),'y':str(ys),'model':'sinusoidal','initial':'[2,1.2,0.3,1]'})['details'];self.assertGreater(d['R²'],.999999999);self.assertLess(d['residual sum of squares'],1e-12)
 def test_logistic_fit(self):
  xs=[i-4 for i in range(9)];ys=[3/(1+math.exp(-.8*(x-.2))) for x in xs]
  d=self.call('regression',{'x':str(xs),'y':str(ys),'model':'logistic','initial':'[3,0.8,0.2]'})['details'];self.assertGreater(d['R²'],.999999999);self.assertLess(d['residual sum of squares'],1e-12)
 def test_dispatch_domain_cases(self):
  out=self.call('system',{'equations':'[(x^2-1)/(x-1)-2,y]','variables':'[x,y]','kind':'nonlinear'});self.assertEqual(out['text'],'EmptySet')
  out=self.call('solve',{'expression':'Piecewise((1/x,x>0),(0,True))','variable':'x'});self.assertEqual(out['text'],'Interval(-oo, 0)')
  out=self.call('solve',{'expression':'a*x','variable':'x'});self.assertIn('parameter cases',out['details'])
  out=json.loads(compute_json(json.dumps({'operation':'numeric_derivative','params':{'expression':'Abs(x)','point':'0','step':'1e-4'}})));self.assertEqual(out['status'],'error');self.assertIn('does not exist',out['text'])
 def test_compact_roots(self):
  samples=[(r'\frac{3^2}{\sqrt4+1}','3'),(r'\sqrt x','sqrt(x)'),(r'\sqrt{\sqrt{16}}','2'),(r'\frac{1}{\sqrt x}','1/sqrt(x)'),(r'\sqrt[3]{8}','2')]
  for latex,expected in samples:
   out=self.call('evaluate',input=latex,mode='latex')
   self.assertEqual(S.simplify(S.sympify(out['text'])-S.sympify(expected)),0,latex)
 def test_compact_tex_argument_boundaries(self):
  samples=[(r'\int_1^02\,\mathrm{d}x','-2'),(r'\int_0^12\,\mathrm{d}x','2'),(r'\sum_{n=1}^32','6'),(r'\prod_{n=1}^32','8'),(r'x^23','3*x**2'),(r'2^34','32'),(r'2^{34}','17179869184'),(r'\frac123','3/2'),(r'\frac1234','17'),(r'\frac1{23}','1/23'),(r'\frac{12}3','4'),(r'2^3\frac12','4'),(r'2^\frac123','3*sqrt(2)'),(r'\sqrt{x^23}','sqrt(3*x**2)'),(r'\int_0^\pi2\,\mathrm{d}x','2*pi'),(r'\int_0^{12}2\,\mathrm{d}x','24'),(r'\sum_{n=1}^{32}2','64'),(r'\sin^230','sin(30)**2'),(r'\left(x^2\right)','x**2'),(r'x^2\cdot3','3*x**2'),(r'x^2{3}','3*x**2'),(r'x^2\times3','3*x**2'),(r'\int_0^1x^2\mathrm{d}x','1/3'),(r'\int_0^1x^2dx','1/3'),(r'\mathit{x}^23','3*x**2'),(r'\operatorname{sin}^230','sin(30)**2'),(r'x^2dy','x**2*d*y'),(r'\int_0^1x^2dx+x^2dy','1/3+x**2*d*y'),(r'\int_0^1x^2\mathrm{d}x+x^2dy','1/3+x**2*d*y'),(r'\int_0^1x^2dx+d^2y','1/3+d**2*y')]
  for latex,expected in samples:
   with self.subTest(latex=latex):
    out=self.call('evaluate',input=latex,mode='latex')
    self.assertEqual(S.simplify(S.sympify(out['text'])-S.sympify(expected)),0)
 def test_compact_tex_missing_arguments(self):
  for latex in [r'x^',r'\frac1',r'\int_1^',r'x^{2',r'\sqrt' * 70 + '2']:
   with self.subTest(latex=latex):
    out=json.loads(compute_json(json.dumps({'operation':'evaluate','input':latex,'mode':'latex'})))
    self.assertEqual(out['status'],'error')
 def test_degrees_current(self):
  out=self.call('evaluate',settings={'angle':'deg'},input='sin(30)');self.assertEqual(out['text'],'1/2')
  out=self.call('evaluate',settings={'angle':'deg'},input=r'\arcsin(1)',mode='latex');self.assertEqual(out['text'],'90')
 def test_nested_unresolved_results_keep_conditions_and_diagnostics(self):
  for expression in ['Integral(f(x),x)', 'Piecewise((Integral(f(x),x),x>0),(0,True))', '[Piecewise((Integral(f(x),x),x>0),(0,True))]', '{"branch":Piecewise((Integral(f(x),x),x>0),(0,True))}']:
   out=self.call('evaluate',input=expression)
   self.assertEqual(out['status'],'unresolved',out)
   self.assertTrue(any('not established a complete answer' in note for note in out['notes']),out)
   self.assertIn('Integral',out['text'])
   if expression.startswith('Piecewise'):
    self.assertEqual(out['display']['headers'],['Value','Condition'])
    self.assertIn('x > 0',out['display']['rows'][0][1]['text'])
 def test_generating_retains_valid_branch_and_reports_unevaluated_fallback(self):
  out=self.call('generating',{'sequence':'n','variable':'n','target':'z'})
  self.assertEqual(out['status'],'unresolved',out)
  result=S.sympify(out['text']);z=S.Symbol('z')
  self.assertIsInstance(result,S.Piecewise)
  self.assertEqual(S.simplify(result.args[0].expr-z/(1-z)**2),0)
  self.assertEqual(result.args[0].cond,S.Abs(z)<1)
  self.assertTrue(result.args[1].expr.has(S.Sum))
  self.assertTrue(any('not established a complete answer' in note for note in out['notes']),out)
 def test_complete_piecewise_stays_conditional(self):
  out=self.call('evaluate',input='Piecewise((x^2,x>0),(0,True))')
  self.assertEqual(out['status'],'conditional',out)
  self.assertFalse(any('not established a complete answer' in note for note in out['notes']),out)
 def test_unresolved_eigenvalue_key_is_not_a_complete_answer(self):
  out=self.call('matrix_eigenvalues',{'expression':'[[Integral(f(x),x)]]'})
  self.assertEqual(out['status'],'unresolved',out)
  self.assertIn('Integral',out['display']['rows'][0][0]['text'])
 def test_unsolved_recurrence_does_not_claim_exact(self):
  out=json.loads(compute_json(json.dumps({'operation':'recurrence','params':{'equation':'a(n+1)-a(n)-1/(n+1)','function':'a(n)','conditions':'{}'}})))
  self.assertEqual(out['status'],'error',out)
  self.assertIn('does not establish',out['text'])
if __name__=='__main__':unittest.main()
