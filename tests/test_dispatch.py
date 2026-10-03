import unittest,json,math
import sympy as S
from calculator import compute_json
class CurrentDispatchTests(unittest.TestCase):
 def test_latex_unary_plus_cut_remainder_and_domain(self):
  self.assertEqual(self.call('evaluate',input='+2',mode='latex')['text'],'2')
  self.assertEqual(self.call('evaluate',input='+x',mode='latex')['text'],'x')
  self.assertEqual(self.call('evaluate',input=r'\frac{+2}{+4}',mode='latex')['text'],'1/2')
  out=self.call('solve',{'expression':r'latex:(\frac{x}{+x})-1','variable':'x'})
  self.assertEqual(S.sympify(out['text']),S.Union(S.Interval.open(-S.oo,0),S.Interval.open(0,S.oo)))
  # Unary LaTeX ingestion does not change the existing plain percent convention.
  for source in ['50%','+50%',r'+50\%']:
   out=json.loads(compute_json(json.dumps({'operation':'evaluate','input':source,'mode':'latex' if '\\' in source else 'text'})))
   self.assertEqual(out['status'],'error',out)
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
 def test_vendor_menu_calculus_and_complex_templates(self):
  samples=[(r'\dfrac{\mathrm{d}}{\mathrm{d}x}x^2\bigm|_{x=3}','6'),(r'\frac{\mathrm{d}}{\mathrm{dx}}x^2\bigm|_{x=3}','6'),(r'\dfrac{\mathrm{d}^{2}}{\mathrm{d}x^{2}}x^3\bigm|_{x=2}','12'),(r'\dfrac{\mathrm{d}}{\mathrm{d}x}(x^2+3*x)\bigm|_{x=-2}','-1'),(r'2+\dfrac{\mathrm{d}}{\mathrm{d}x}x^2\bigm|_{x=3}','8'),(r'\lvert3+4\mathrm{i}\rvert','5'),(r'\arg(\mathrm{i})','pi/2'),(r'\Re(3+4\mathrm{i})','3'),(r'\Im(3+4\mathrm{i})','4')]
  for latex,expected in samples:
   with self.subTest(latex=latex):
    out=self.call('evaluate',input=latex,mode='latex',settings={'domain':'complex'})
    self.assertEqual(S.simplify(S.sympify(out['text'])-S.sympify(expected)),0)
 def test_vendor_menu_derivative_order_and_point_validation(self):
  for latex in [r'\dfrac{\mathrm{d}^{2}}{\mathrm{d}x^{3}}x^3\bigm|_{x=2}',r'\dfrac{\mathrm{d}}{\mathrm{d}x}x^2\bigm|_{y=3}',r'\dfrac{\mathrm{d}^{0}}{\mathrm{d}x^{0}}x^2\bigm|_{x=3}',r'\dfrac{\mathrm{d}}{\mathrm{d}x}x^2',r'\dfrac{\mathrm{d}}{\mathrm{d}x}\frac{x}{x}\bigm|_{x=0}']:
   out=json.loads(compute_json(json.dumps({'operation':'evaluate','input':latex,'mode':'latex'})))
   self.assertEqual(out['status'],'error',out)
 def test_vendor_menu_derivative_keeps_named_functions_and_angle_policy(self):
  out=self.call('evaluate',input=r'\dfrac{\mathrm{d}}{\mathrm{d}x}f(x)\bigm|_{x=3}',mode='latex',definitions=[{'name':'f','args':'t','expression':'t^3'}])
  self.assertEqual(out['text'],'27')
  out=self.call('evaluate',input=r'\dfrac{\mathrm{d}}{\mathrm{d}x}\sin(x)\bigm|_{x=30}',mode='latex',settings={'angle':'deg'})
  self.assertEqual(S.simplify(S.sympify(out['text'])-S.pi*S.sqrt(3)/360),0)
  out=json.loads(compute_json(json.dumps({'operation':'evaluate','input':r'\dfrac{\mathrm{d}}{\mathrm{d}x}f(x)\bigm|_{x=1}','mode':'latex','definitions':[{'name':'f','args':'t','expression':'(t^2-1)/(t-1)'}]})))
  self.assertEqual(out['status'],'error',out)
  self.assertIn('original denominator',out['text'])
 def test_vendor_menu_constructs_keep_original_denominator_exclusions(self):
  from latex_adapter import parse_math_latex
  for source in [r'\Re(\frac{x}{x})',r'\lvert\frac{x}{x}\rvert']:
   parsed=parse_math_latex(source)
   self.assertEqual(parsed.original,source)
   self.assertIn(S.Symbol('x'),parsed.excluded_denominators)
  source=r'\dfrac{\mathrm{d}}{\mathrm{d}x}\frac{1}{x}\bigm|_{x=3}'
  parsed=parse_math_latex(source)
  self.assertEqual(parsed.original,source)
  self.assertFalse(any(S.Symbol('x') in den.free_symbols for den in parsed.excluded_denominators))
 def test_vendor_menu_derivative_keeps_saved_scalar_restrictions_at_point(self):
  for expression,valid,invalid in [('x/x','3','0'),('(x^2-1)/(x-1)','3','1')]:
   definitions=[{'name':'A','expression':expression}]
   source=r'\dfrac{\mathrm{d}}{\mathrm{d}x}A\bigm|_{x='+valid+'}'
   out=self.call('evaluate',input=source,mode='latex',definitions=definitions)
   self.assertEqual(out['text'],'0' if expression=='x/x' else '1')
   self.assertFalse(any('Original restriction' in note for note in out['notes']),out)
   source=r'\dfrac{\mathrm{d}}{\mathrm{d}x}A\bigm|_{x='+invalid+'}'
   out=json.loads(compute_json(json.dumps({'operation':'evaluate','input':source,'mode':'latex','definitions':definitions})))
   self.assertEqual(out['status'],'error',out)
   self.assertIn('original denominator',out['text'])
 def test_vendor_menu_bound_variable_assumptions(self):
  for kind,valid,invalid in [('positive','2','-1'),('nonzero','2','0'),('real','2','i')]:
   for argument,definitions in [(r'x^2',[]),('A',[{'name':'A','expression':'x^2'}]),('f(x)',[{'name':'f','args':'t','expression':'t^2'}])]:
    settings={'assumptions':'x:'+kind}
    source=r'\dfrac{\mathrm{d}}{\mathrm{d}x}'+argument+r'\bigm|_{x='+valid+'}'
    out=self.call('evaluate',input=source,mode='latex',settings=settings,definitions=definitions)
    self.assertEqual(out['text'],'4')
    source=r'\dfrac{\mathrm{d}}{\mathrm{d}x}'+argument+r'\bigm|_{x='+invalid+'}'
    out=json.loads(compute_json(json.dumps({'operation':'evaluate','mode':'latex','input':source,'settings':settings,'definitions':definitions})))
    self.assertEqual(out['status'],'error',out)
    self.assertIn('domain assumption',out['text'])
  source=r'\dfrac{\mathrm{d}}{\mathrm{d}x}\sqrt{x^2}\bigm|_{x=-1}'
  out=json.loads(compute_json(json.dumps({'operation':'evaluate','mode':'latex','input':source,'settings':{'assumptions':'x:positive'}})))
  self.assertEqual(out['status'],'error',out)
 def test_vendor_menu_bound_assumptions_preserve_outer_case_guard(self):
  from calculator import Context
  y=S.Symbol('y')
  for argument,definitions in [('x^2',[]),('A',[{'name':'A','expression':'x^2'}]),('f(x)',[{'name':'f','args':'t','expression':'t^2'}])]:
   source=r'\begin{cases}\dfrac{\mathrm{d}}{\mathrm{d}x}'+argument+r'\bigm|_{x=-1}&y>0\\0&\text{otherwise}\end{cases}'
   context=Context({'settings':{'assumptions':'x:positive'},'definitions':definitions})
   expression,_,_,conditions=context._parse(source,latex=True)
   self.assertEqual(expression.doit().subs(y,-1),0)
   self.assertTrue(any(kind=='positive' and arg.subs(y,1).is_positive is False and arg.subs(y,-1).is_positive is True for kind,arg in conditions),conditions)
 def test_vendor_menu_nested_derivatives_consume_inner_bindings(self):
  from calculator import Context
  x=S.Symbol('x')
  for argument,definitions in [(r'\frac{1}{x-3}',[]),('f(x)',[{'name':'f','args':'t','expression':'1/(t-3)'}]),('A',[{'name':'A','expression':'1/(x-3)'}])]:
   source=r'\dfrac{\mathrm{d}}{\mathrm{d}x}{\dfrac{\mathrm{d}}{\mathrm{d}x}'+argument+r'\bigm|_{x=2}}\bigm|_{x=3}'
   out=self.call('evaluate',input=source,mode='latex',definitions=definitions)
   self.assertEqual(out['text'],'0')
   context=Context({'definitions':definitions});context.parse(source,latex=True)
   self.assertFalse(any(x in den.free_symbols for den in context.denominators))
 def test_vendor_menu_presentation_wrappers_preserve_mathematics(self):
  from latex_adapter import parse_math_latex
  samples=[(r'\textcolor{red}{3+1}','4'),(r'\colorbox{blue}{\textcolor{red}{$ 3+1 $}}','4'),(r'\boxed{3+1}','4'),(r'\bbox[5px,border: 2px solid red]{3+1}','4'),(r'\bbox[5px,border: 2px dashed black]{3+1}','4'),(r'2\boxed{3+1}','8'),(r'x^2\textcolor{red}{3}','3*x**2'),(r'\boxed{x}^{2}','x**2')]
  for source,expected in samples:
   with self.subTest(source=source):
    self.assertEqual(parse_math_latex(source).original,source)
    out=self.call('evaluate',input=source,mode='latex')
    self.assertEqual(S.simplify(S.sympify(out['text'])-S.sympify(expected)),0)
 def test_vendor_menu_presentation_rejects_mixed_text_and_bad_metadata(self):
  for source in [r'\colorbox{blue}{hello $3+1$}',r'\colorbox{blue}{$3$ and $1$}',r'\colorbox{blue}{3+1}',r'\textcolor{red}{3+1',r'\bbox[border: calc(1px) solid red]{3+1}',r'\textcolor{not-a-color}{3+1}']:
   out=json.loads(compute_json(json.dumps({'operation':'evaluate','input':source,'mode':'latex'})))
   self.assertEqual(out['status'],'error',out)
 def test_vendor_menu_presentation_keeps_piecewise_denominator_guards(self):
  from latex_adapter import parse_math_latex
  x=S.Symbol('x')
  for expression in [r'\textcolor{red}{\frac{1}{x}}',r'\boxed{\frac{1}{x}}',r'\colorbox{blue}{\textcolor{red}{$ \frac{1}{x} $}}']:
   source=r'\begin{cases}'+expression+r'&x\ne0\\0&\text{otherwise}\end{cases}'
   parsed=parse_math_latex(source)
   self.assertEqual(parsed.expression.subs(x,0),0)
   self.assertTrue(parsed.excluded_denominators)
   self.assertTrue(all(den.subs(x,0)!=0 for den in parsed.excluded_denominators))
 def test_vendor_menu_derivative_point_preserves_outer_piecewise_guard(self):
  from calculator import Context
  x=S.Symbol('x')
  for argument,definitions in [(r'\frac{x}{x}',[]),('f(x)',[{'name':'f','args':'t','expression':'t/t'}]),('A',[{'name':'A','expression':'x/x'}])]:
   source=r'\begin{cases}\dfrac{\mathrm{d}}{\mathrm{d}x}'+argument+r'\bigm|_{x=0}&x\ne0\\0&\text{otherwise}\end{cases}'
   context=Context({'definitions':definitions})
   context.parse(source,latex=True)
   self.assertTrue(any(den.subs(x,1)==0 for den in context.denominators))
   self.assertTrue(all(den.subs(x,0)!=0 for den in context.denominators))
   out=self.call('evaluate',input=source,mode='latex',definitions=definitions)
   self.assertEqual(out['text'],'0')
   self.assertTrue(any('Original restriction' in note for note in out['notes']),out)
 def test_vendor_menu_derivative_keeps_identical_local_and_outer_guards_distinct(self):
  from calculator import Context
  x=S.Symbol('x')
  for branch,definitions in [(r'\frac{1}{x+1}',[]),('f(x)',[{'name':'f','args':'t','expression':'1/(t+1)'}]),('A',[{'name':'A','expression':'1/(x+1)'}])]:
   inner=r'\begin{cases}'+branch+r'&x>0\\x&\text{otherwise}\end{cases}'
   source=r'\begin{cases}\dfrac{\mathrm{d}}{\mathrm{d}x}{'+inner+r'}\bigm|_{x=-1}&x>0\\0&\text{otherwise}\end{cases}'
   context=Context({'definitions':definitions});expression=context.parse(source,latex=True).doit()
   self.assertEqual(expression.subs(x,1),1)
   self.assertEqual(expression.subs(x,-1),0)
   self.assertFalse(context.denominators,context.denominators)
 def test_vendor_menu_constructs_keep_piecewise_restriction_guards(self):
  from latex_adapter import parse_math_latex
  x=S.Symbol('x')
  for expression in [r'\Re(\frac{1}{x})',r'\lvert\frac{1}{x}\rvert',r'\Im(\frac{1}{x})']:
   source=r'\begin{cases}'+expression+r'&x\ne0\\0&\text{otherwise}\end{cases}'
   parsed=parse_math_latex(source)
   self.assertTrue(parsed.excluded_denominators)
   self.assertTrue(all(den.subs(x,0)!=0 for den in parsed.excluded_denominators))
   self.assertEqual(parsed.expression.subs(x,0),0)
  source=r'\begin{cases}\Re(f(x))&x\ne0\\0&\text{otherwise}\end{cases}'
  out=self.call('solve',{'expression':'latex:'+source,'variable':'x'},definitions=[{'name':'f','args':'t','expression':'1/t'}])
  self.assertEqual(out['text'],'{0}')
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
 def test_merged_upright_integral_differentials(self):
  samples=[(r'\int_3^41\,\mathrm{dx}','1'),(r'\int_4^31\,\mathrm{dx}','-1'),(r'\int_{-2}^11\,\mathrm{dx}','3'),(r'\int_0^1y^2\mathrm{dy}','1/3'),(r'\int_0^1\theta^2\mathrm{d\theta}','1/3'),(r'\int_0^1x^2\mathrm{dx}','1/3'),(r'\int_0^1\sqrt{x}\mathrm{dx}','2/3'),(r'\int_3^41\,\mathrm { d x }','1'),(r'\int_3^41\,\mathrm { d } x','1'),(r'\int_0^1\int_0^1xy\mathrm{dx}\mathrm{dy}','1/4'),(r'{\int_0^1x^2\mathrm{dx}}+x^2dy','1/3+x**2*d*y')]
  for latex,expected in samples:
   with self.subTest(latex=latex):
    out=self.call('evaluate',input=latex,mode='latex')
    self.assertEqual(S.simplify(S.sympify(out['text'])-S.sympify(expected)),0)
  from latex_adapter import parse_math_latex
  source=r'\int_3^41\,\mathrm{dx}'
  self.assertEqual(parse_math_latex(source).original,source)
  self.assertEqual(self.call('evaluate',params={'expression':'latex:'+source})['text'],'1')
  self.assertEqual(self.call('evaluate',input='A',definitions=[{'name':'A','expression':'latex:'+source}])['text'],'1')
 def test_upright_differential_scope_and_ambiguity(self):
  from latex_adapter import normalize_compact_arguments
  for latex in [r'\mathrm{dx}',r'\int_0^1x\mathrm{dxyz}',r'\int_0^1x\mathrm{delta}',r'\int_0^1x\mathrm{d}',r'\int_0^1x\mathrm{dx}+\mathrm{dy}']:
   with self.subTest(latex=latex):
    if latex==r'\mathrm{dx}':self.assertEqual(normalize_compact_arguments(latex),latex)
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
