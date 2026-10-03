"""Calculator's bounded mathematical API. All computation stays in its worker."""
import ast, json, re, math, warnings
import sympy as S
import numpy as np
import scipy
from scipy import stats, optimize, integrate as ni, interpolate, linalg, fft, signal
import networkx as nx
from sympy.parsing.sympy_parser import (stringify_expr, standard_transformations,
    implicit_multiplication_application, convert_xor, rationalize, convert_equals_signs)
from sympy.core.relational import Relational
from sympy.calculus.util import continuous_domain
from sympy.ntheory.modular import crt
from sympy.solvers.ode import checkodesol
from latex_adapter import parse_math_latex,substitute_bound_guard_path
from supplemental import *
from presentation import present, node
from extended import extended

NAMES=('Add Mul Pow Subs Integer Rational Float Symbol Function Matrix ImmutableMatrix eye zeros ones diag '
'Abs sqrt root exp log sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh atanh '
'csc sec cot acsc asec acot re im arg conjugate sign floor ceiling Min Max Mod Piecewise '
'Eq Ne Lt Le Gt Ge And Or Not Xor Implies Equivalent FiniteSet Union Intersection Complement '
'Interval Range ProductSet Contains Lambda Tuple factorial factorial2 binomial rf ff '
'simplify trigsimp expand factor cancel together apart collect powsimp radsimp '
'diff Derivative integrate Integral limit Limit summation Sum product Product series '
'solve solveset linsolve nonlinsolve reduce_inequalities nsolve '
'N nsimplify gcd lcm gcdex mod_inverse isprime factorint totient divisors prime primepi '
'continued_fraction continued_fraction_reduce diophantine '
'det transpose trace hessian resultant discriminant div rem quo groebner Poly '
'bernoulli fibonacci catalan harmonic gamma lowergamma uppergamma erf erfc erfi Ei Si Ci '
'besselj bessely besseli besselk airyai airybi zeta digamma polygamma beta hyper meijerg '
'residue singularities laplace_transform inverse_laplace_transform fourier_transform '
'inverse_fourier_transform fourier_series rsolve dsolve pdsolve simplify_logic satisfiable '
'Point Point2D Point3D Line Line3D Plane Circle Ellipse Segment Polygon Triangle '
'conjugate interpolate chebyshevt legendre Hermite hermite MatrixSymbol').split()
BASE={k:getattr(S,k) for k in NAMES if hasattr(S,k)}
BASE.update({'pi':S.pi,'E':S.E,'e':S.E,'I':S.I,'i':S.I,'oo':S.oo,'inf':S.oo,
 'True':S.true,'False':S.false,'true':S.true,'false':S.false,'Reals':S.S.Reals,'Complexes':S.S.Complexes,
 'Integers':S.S.Integers,'EmptySet':S.S.EmptySet,'ln':S.log,'C':S.Symbol('C')})
METHODS={'subs','doit','evalf','det','inv','transpose','adjugate','cofactor_matrix','rref','rank',
'nullspace','rowspace','columnspace','eigenvals','eigenvects','charpoly','jacobian','dot','cross','norm',
'T','H','pinv','trace','diff','integrate','series','simplify','expand','factor','distance','intersection',
'area','length','circumference','is_convergent','is_absolutely_convergent','coeff','degree','all_coeffs'}
TRANS=standard_transformations+(convert_xor,implicit_multiplication_application,convert_equals_signs,rationalize)

class Context:
 def __init__(self,request):
  self.request=request;self.settings=request.get('settings',{});self.notes=[];self.denominators=[]
  self.precision=int(self.settings.get('precision',30))
  if not 5<=self.precision<=200:raise ValueError('Precision must be between 5 and 200 digits.')
  self.env=dict(BASE);self.env["integrate"]=lambda expression,*bounds,**kwargs:checked_integrate(expression,*bounds,context=self,**kwargs);self.assumptions={};self.assumption_kinds={}
  for spec in self.settings.get('assumptions','').split(','):
   if not spec.strip():continue
   name,_,kind=spec.strip().partition(':');name=name.strip();kind=kind.strip()
   if not re.fullmatch('[A-Za-z][A-Za-z0-9_]*',name) or kind not in ['positive','negative','nonnegative','real','integer','nonzero']:raise ValueError('Assumptions use x:positive, n:integer, y:real.')
   if name in BASE:raise ValueError(name+' is a reserved constant or command.')
   if name in self.assumption_kinds and self.assumption_kinds[name]!=kind:raise ValueError('Use one compatible assumption per symbol; repeated conflicting assumption for '+name+'.')
   self.assumption_kinds[name]=kind;self.assumptions[name]=S.Symbol(name,**{kind:True})
  self.env.update(self.assumptions)
  # Apply the angle policy before parsing any stored mathematical definition.
  if self.settings.get('angle')=='deg':
   for name in ['sin','cos','tan','csc','sec','cot']:
    fn=getattr(S,name);self.env[name]=lambda x,_fn=fn,**kwargs:_fn(x*S.pi/180,**kwargs)
   for name in ['asin','acos','atan','acsc','asec','acot']:
    fn=getattr(S,name);self.env[name]=lambda x,_fn=fn,**kwargs:180*_fn(x,**kwargs)/S.pi
   self.env['atan2']=lambda y,x,**kwargs:180*S.atan2(y,x,**kwargs)/S.pi
   self.notes.append('Degree mode: circular trigonometric input and inverse-function output use degrees. Saved definitions and graphs use the same mode.')
  self.definition_sources={};self.definition_denominators={};self.definition_notes={};self.definition_conditions={};self.definition_parameters={};self.building=[]
  for d in request.get('definitions',[]):
   name=d.get('name','')
   if not re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,23}',name):raise ValueError('Names start with a letter and use at most 24 letters, digits or underscores.')
   if name in BASE:raise ValueError('Definition name '+name+' is a reserved constant or command.')
   if name in self.assumptions:raise ValueError('Definition name '+name+' conflicts with an assumed independent symbol. Rename the definition or remove that assumption.')
   if name in self.definition_sources:raise ValueError('Duplicate saved definition: '+name)
   self.definition_sources[name]=d
  for name in self.definition_sources:self.definition(name)
 def definition(self,name):
  if name in self.env:return self.env[name]
  if name in self.building:raise ValueError('Circular definition: '+' → '.join(self.building+[name]))
  self.building.append(name);d=self.definition_sources[name]
  args=[a.strip() for a in d.get('args','').split(',') if a.strip()]
  if len(set(args))!=len(args) or any(not re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,23}',a) or a in BASE for a in args):raise ValueError('Function parameters must be distinct, unreserved mathematical variable names.')
  for dep in re.findall(r'\b[A-Za-z][A-Za-z0-9_]*\b',d['expression']):
   if dep in self.definition_sources and dep not in args:self.definition(dep)
  local={a:self.assumptions.get(a,S.Symbol(a)) for a in args}
  val,dens,notes,conditions=self._parse(d['expression'],extra=local)
  self.env[name]=S.Lambda(tuple(local.values()),val) if args else val
  self.definition_parameters[name]=tuple(local.values())
  self.definition_denominators[name]=dens;self.definition_notes[name]=notes;self.definition_conditions[name]=conditions
  self.building.pop();return self.env[name]
 def _normal_denominator(self,d):
  d=S.sympify(d)
  if S.count_ops(d)<80:d=S.simplify(d)
  if d.is_zero is True or d==0:raise ValueError('This input is undefined: an original denominator becomes zero.')
  if d.is_nonzero is True or (not d.free_symbols and d.is_zero is False):return None
  return d
 @staticmethod
 def _equations(text):
  # Convert standalone mathematical '=' inside lists and grouping. Strings and
  # mathematical keyword arguments stay intact; '<=', '>=', '!=' are unchanged.
  import io, tokenize
  tokens=[(t.type,t.string) for t in tokenize.generate_tokens(io.StringIO(text).readline) if t.type not in [tokenize.ENDMARKER,tokenize.NEWLINE,tokenize.NL]]
  keywords={'evaluate','domain','modulus','dict','ics','conds','dir','check','extension','order','rational','real','positive','integer','nonzero','negative','nonnegative'}
  def level(items):
   groups=[];i=0
   while i<len(items):
    typ,tok=items[i]
    if tok in ('(','[','{'):
     close={'(':')','[':']','{':'}'}[tok];depth=1;j=i+1
     while j<len(items):
      if items[j][1]==tok:depth+=1
      if items[j][1]==close:depth-=1
      if depth==0:break
      j+=1
     if j==len(items):raise ValueError('Unbalanced mathematical brackets.')
     groups.append((tokenize.NAME,tok+level(items[i+1:j])+close));i=j+1
    else:groups.append((typ,tok));i+=1
   chunks=[];start=0
   for j,(_,tok) in enumerate(groups):
    if tok==',':chunks.append(groups[start:j]);start=j+1
   chunks.append(groups[start:]);out=[]
   for chunk in chunks:
    equals=[j for j,(_,tok) in enumerate(chunk) if tok=='=']
    if equals:
     if len(equals)!=1:raise ValueError('Write chained equations as a list of separate equations.')
     j=equals[0];left=chunk[:j];right=chunk[j+1:]
     lhs=tokenize.untokenize(left).strip();rhs=tokenize.untokenize(right).strip()
     if not lhs or not rhs:raise ValueError('An equation needs an expression on both sides.')
     out.append(lhs+'='+rhs if lhs in keywords else 'Eq('+lhs+','+rhs+')')
    else:out.append(tokenize.untokenize(chunk).strip())
   return ','.join(out)
  return level(tokens)
 def _parse(self,source,extra=None,latex=False):
  if not isinstance(source,str):return S.sympify(source),[],[],[]
  if len(source)>12000:raise ValueError('Input is limited to 12,000 characters.')
  if not source.strip():raise ValueError('A required mathematical input is empty.')
  if source.startswith('latex:'):return self._parse(source[6:],extra=extra,latex=True)
  env=dict(self.env);env.update(extra or {});dens=[];notes=[];conditions=[];binding_frames=[]
  def add_den(d,guard=S.true,guard_path=None):
   if guard is S.false or guard==False:return
   if binding_frames:binding_frames[-1]['denominators'].append((d,guard_path if guard_path is not None else (guard,)));return
   if guard is not S.true and guard!=True:d=S.Piecewise((d,guard),(1,True))
   d=self._normal_denominator(d)
   if d is not None and d not in dens:dens.append(d)
  def add_condition(kind,arg,guard=S.true,guard_path=None):
   if guard is S.false or guard==False:return
   arg=S.sympify(arg)
   if binding_frames:binding_frames[-1]['conditions'].append((kind,arg,guard_path if guard_path is not None else (guard,)));return
   if guard is not S.true and guard!=True:arg=S.Piecewise((arg,guard),(-1 if kind=='negative' else 1,True))
   known=getattr(arg,'is_'+kind,None)
   if known is False:raise ValueError('A referenced definition requires '+str(arg)+' to be '+kind+'; this argument violates that domain assumption.')
   if known is not True and (kind,arg) not in conditions:conditions.append((kind,arg))
  active={name for name in re.findall(r'\b[A-Za-z][A-Za-z0-9_]*\b',source) if name in self.definition_sources and name not in (extra or {})}
  for name in active:
   notes.extend(self.definition_notes.get(name,[]))
  def reference(name,guard=S.true,guard_path=None):
   for d in self.definition_denominators.get(name,[]):add_den(d,guard,guard_path)
   for kind,arg in self.definition_conditions.get(name,[]):add_condition(kind,arg,guard,guard_path)
   return env[name]
  def bound_references(variable,point,outer_path,parse_argument):
   frame={'denominators':[],'conditions':[]};binding_frames.append(frame)
   try:argument=parse_argument()
   finally:binding_frames.pop()
   substitutions={variable:point}
   for denominator,path in frame['denominators']:
    path=substitute_bound_guard_path(path,len(outer_path),substitutions)
    add_den(denominator.subs(substitutions,simultaneous=True),S.And(*path),path)
   for kind,arg,path in frame['conditions']:
    path=substitute_bound_guard_path(path,len(outer_path),substitutions)
    add_condition(kind,arg.subs(substitutions,simultaneous=True),S.And(*path),path)
   return argument
  def apply_function(name,args,guard=S.true,guard_path=None):
   fn=self.env[name];parameters=self.definition_parameters[name]
   if len(args)!=len(parameters):raise ValueError(name+' expects '+str(len(parameters))+' arguments.')
   substitutions=dict(zip(parameters,args))
   for parameter,arg in zip(parameters,args):
    kind=self.assumption_kinds.get(str(parameter))
    if kind:add_condition(kind,arg,guard,guard_path)
   for kind,arg in self.definition_conditions.get(name,[]):add_condition(kind,arg.subs(substitutions,simultaneous=True),guard,guard_path)
   for d in self.definition_denominators.get(name,[]):add_den(d.subs(substitutions,simultaneous=True),guard,guard_path)
   return fn(*args)
  if latex:
   functions={k:v for k,v in env.items() if isinstance(v,S.Lambda)}
   def latex_symbol(name,guard,guard_path=None):
    if name in active and not isinstance(env[name],S.Lambda):return reference(name,guard,guard_path)
    return S.Symbol(name) if name in functions else env.get(name,S.Symbol(name))
   out=parse_math_latex(source,symbols={k:v for k,v in env.items() if isinstance(v,(S.Basic,S.MatrixBase)) and not isinstance(v,S.Lambda)},functions=functions,angle=self.settings.get('angle','rad'),function_callback=apply_function,symbol_callback=latex_symbol,binding_callback=bound_references)
   expr=out.expression
   for d in out.excluded_denominators:add_den(d)
   notes.extend(out.notes)
  else:
   text=source.replace('−','-').replace('×','*').replace('÷','/').replace('π','pi').replace('∞','oo').replace('√','sqrt')
   if '__' in text or '`' in text or ';' in text or '\\' in text:raise ValueError('Use mathematical notation only. LaTeX belongs in LaTeX mode.')
   text=self._equations(text)
   for name in re.findall(r'\b[A-Za-z][A-Za-z0-9_]*\b',text):
    if name not in env:env[name]=S.Function(name) if re.search(r'\b'+re.escape(name)+r'\s*\(',text) else S.Symbol(name)
   for name,fn in list(env.items()):
    if isinstance(fn,S.Lambda) and name in self.definition_sources and name not in (extra or {}):
     env[name]=lambda *args,_name=name,**kwargs:apply_function(_name,args,kwargs.pop("__calculator_guard",S.true))
   def power(base,exponent,**kwargs):
    guard=kwargs.pop("__calculator_guard",S.true);exponent=S.sympify(exponent)
    if exponent.is_negative is True:add_den(base,guard)
    return S.Pow(base,exponent,**kwargs)
   env['Pow']=power;env['__calculator_reference']=reference
   transforms=tuple(t for t in TRANS if t is not convert_equals_signs)
   code=stringify_expr(text,env,dict(BASE),transforms);tree=ast.parse(code,mode='eval')
   allowed=(ast.Expression,ast.Call,ast.Name,ast.Load,ast.Constant,ast.List,ast.Tuple,ast.Dict,ast.Set,ast.BinOp,ast.UnaryOp,ast.Add,ast.Sub,ast.Mult,ast.Div,ast.Pow,ast.Mod,ast.USub,ast.UAdd,ast.BitAnd,ast.BitOr,ast.Invert,ast.Compare,ast.Eq,ast.NotEq,ast.Lt,ast.LtE,ast.Gt,ast.GtE,ast.keyword,ast.Attribute,ast.Subscript,ast.Slice)
   for node in ast.walk(tree):
    if not isinstance(node,allowed):raise ValueError('This syntax is not part of the calculator language.')
    if isinstance(node,ast.Attribute) and node.attr not in METHODS:raise ValueError('Unknown mathematical property: '+node.attr)
    if isinstance(node,ast.Name) and node.id not in env:raise ValueError('Unknown name '+node.id)
   from sympy.parsing.sympy_parser import evaluateFalse
   # SymPy's evaluateFalse assumes named functions, including inside products.
   # Lower validated method calls to local named helpers before that transform.
   class MethodsAsFunctions(ast.NodeTransformer):
    def visit_Call(visitor,node):
     node=visitor.generic_visit(node)
     if isinstance(node.func,ast.Attribute):
      method=node.func.attr;alias='_calculator_method_'+str(len(env))
      env[alias]=(lambda value,*args,**kwargs:checked_integrate(value,*args,context=self,**kwargs)) if method=='integrate' else (lambda value,*args,_method=method,**kwargs:getattr(value,_method)(*args,**kwargs))
      return ast.copy_location(ast.Call(func=ast.Name(id=alias,ctx=ast.Load()),args=[node.func.value,*node.args],keywords=node.keywords),node)
     return node
   normalized=ast.fix_missing_locations(MethodsAsFunctions().visit(tree))
   unevaluated=evaluateFalse(ast.unparse(normalized))
   import copy
   def guard_and(*args):return ast.Call(func=ast.Name(id='And',ctx=ast.Load()),args=list(args),keywords=[])
   def guard_not(arg):return ast.Call(func=ast.Name(id='Not',ctx=ast.Load()),args=[arg],keywords=[])
   def protect(node,guard):
    if isinstance(node,ast.Name) and node.id in active and not isinstance(env[node.id],S.Lambda):
     return ast.Call(func=ast.Name(id='__calculator_reference',ctx=ast.Load()),args=[ast.Constant(node.id),copy.deepcopy(guard)],keywords=[])
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='Piecewise':
     previous=ast.Constant(False);newargs=[]
     for pair in node.args:
      if not isinstance(pair,ast.Tuple) or len(pair.elts)!=2:raise ValueError('Piecewise uses (expression,condition) pairs.')
      available=guard_and(copy.deepcopy(guard),guard_not(copy.deepcopy(previous)))
      condition=protect(pair.elts[1],available)
      effective=guard_and(copy.deepcopy(available),copy.deepcopy(condition))
      newargs.append(ast.Tuple(elts=[protect(pair.elts[0],effective),condition],ctx=ast.Load()))
      previous=ast.Call(func=ast.Name(id='Or',ctx=ast.Load()),args=[previous,copy.deepcopy(condition)],keywords=[])
     node.args=newargs;return node
    if isinstance(node,ast.Call):
     node.args=[protect(arg,guard) for arg in node.args]
     node.keywords=[ast.keyword(arg=k.arg,value=protect(k.value,guard)) for k in node.keywords]
     if isinstance(node.func,ast.Name) and (node.func.id=='Pow' or node.func.id in self.definition_parameters):
      node.keywords.append(ast.keyword(arg='__calculator_guard',value=copy.deepcopy(guard)))
     elif isinstance(node.func,ast.Attribute):node.func.value=protect(node.func.value,guard)
     return node
    for name,value in ast.iter_fields(node):
     if isinstance(value,ast.AST):setattr(node,name,protect(value,guard))
     elif isinstance(value,list):setattr(node,name,[protect(v,guard) if isinstance(v,ast.AST) else v for v in value])
    return node
   guarded=ast.fix_missing_locations(protect(unevaluated,ast.Constant(True)))
   expr=eval(compile(guarded,'<math>','eval'),{'__builtins__':{},**env})
  def collect(obj,guard=S.true):
   if guard is S.false or guard==False:return
   if isinstance(obj,dict):
    for k,v in obj.items():collect(k,guard);collect(v,guard)
   elif isinstance(obj,(list,tuple,set,S.MatrixBase)):
    for value in obj:collect(value,guard)
   elif isinstance(obj,S.Piecewise):
    previous=S.false
    for value,condition in obj.args:
     available=S.And(guard,S.Not(previous));collect(condition,available)
     collect(value,S.And(available,condition));previous=S.Or(previous,condition)
   elif isinstance(obj,S.Basic):
    if obj in [S.nan,S.zoo]:add_den(S.Integer(0),guard)
    if isinstance(obj,S.Pow) and obj.exp.is_negative is True:add_den(obj.base,guard)
    for child in obj.args:collect(child,guard)
  collect(expr)
  return expr,dens,list(dict.fromkeys(notes)),conditions
 def parse(self,source,extra=None,latex=False,record=True):
  expr,dens,notes,conditions=self._parse(source,extra=extra,latex=latex)
  if record:
   notes.extend("Required domain from a referenced definition: "+str(arg)+" is "+kind+"." for kind,arg in conditions)
   self.denominators.extend(d for d in dens if d not in self.denominators);self.notes.extend(n for n in notes if n not in self.notes)
  return expr
 def p(self,key,default=None):
  value=self.request.get('params',{}).get(key,default)
  if value is None:raise ValueError('Missing '+key)
  return self.parse(value)
 def raw(self,key,default=''):return self.request.get('params',{}).get(key,default)
 def sym(self,key='variable',default='x'):
  v=self.p(key,default)
  if not isinstance(v,S.Symbol):raise ValueError('Choose an unassigned variable, such as x. A saved value cannot be a differentiation variable.')
  return v
 def arr(self,key,default=None):return np.asarray(self.p(key,default),dtype=float)
 def num(self,key,default=None):return float(self.p(key,default))
 def integer(self,key,default=None,lo=None,hi=None):
  x=self.p(key,default)
  if x.is_integer is not True:raise ValueError(key+' must be an integer.')
  n=int(x)
  if (lo is not None and n<lo) or (hi is not None and n>hi):raise ValueError(key+' is outside the allowed range.')
  return n

def walk_unresolved(r):
 if isinstance(r,dict):return any(walk_unresolved(k) or walk_unresolved(v) for k,v in r.items())
 if isinstance(r,(list,tuple,S.MatrixBase)):return any(walk_unresolved(v) for v in r)
 return isinstance(r,S.Basic) and (r.has(S.Integral,S.Derivative,S.Sum,S.Product,S.Limit,S.ConditionSet) or any('Transform' in type(a).__name__ for a in S.preorder_traversal(r)))
def convert(r):
 if isinstance(r,dict):return {str(k):convert(v) for k,v in r.items()}
 if isinstance(r,(list,tuple,set)):return [convert(v) for v in r]
 if isinstance(r,np.ndarray):return convert(r.tolist())
 if isinstance(r,(np.integer,)):return int(r)
 if isinstance(r,(np.floating,float)):return float(r) if math.isfinite(float(r)) else str(r)
 if isinstance(r,(int,str,bool)) or r is None:return r
 return str(r)
def matrix(c,key='expression'):
 a=c.p(key,'[[1,2],[3,4]]');a=a if isinstance(a,S.MatrixBase) else S.Matrix(a)
 if a.rows>30 or a.cols>30:raise ValueError('Symbolic matrices are limited to 30×30. Reduce the matrix or use numerical methods.')
 return a

def math_source(value):
 if isinstance(value,str):return repr(value)
 if value is None:return 'None'
 if isinstance(value,np.ndarray):return math_source(value.tolist())
 if isinstance(value,dict):return '{'+','.join(math_source(k)+':'+math_source(v) for k,v in value.items())+'}'
 if isinstance(value,(list,tuple,set)):return '['+','.join(math_source(v) for v in value)+']'
 return str(value)
def integer_rows(rows):
 for row in rows:
  for v in row:
   if S.sympify(v).is_integer is not True:raise ValueError('Use exact integer labels; fractional labels are not rounded.')
 return [[int(v) for v in row] for row in rows]

def compute(request):
 c=Context(request);op=request.get('operation','evaluate');params=request.get('params',{});r=None;numeric=False;details=None;reusable=None;conditional=False
 def graph_expression(key,flag,default):
  canonical=str(c.raw(flag,'false')).lower() in ('true','1')
  context=Context({**request,'settings':{**request.get('settings',{}),'angle':'rad'}}) if canonical else c
  expression=context.p(key,default)
  if context is not c:
   c.denominators.extend(d for d in context.denominators if d not in c.denominators)
   c.notes.extend(n for n in context.notes if n not in c.notes)
   c.notes.append('Generated canonical graph expressions already use radians internally.')
  return expression
 expr=None
 if op in ['evaluate','approx','simplify','expand','factor','apart','cancel','trigsimp','substitute','solve','differentiate','integrate','multiple_integral','limit','series','sum','product','convergence','residue','singularities','domain','root','minimize','laplace','inverse_laplace','fourier','inverse_fourier','sequence_limit','multilimit','asymptotic']:
  source=params.get('expression',request.get('input',''))
  expr=c.parse(source,latex=request.get('mode') in ('math','latex') and 'expression' not in params)
 if op=='evaluate':r=checked_integrate(expr.function,*expr.limits,context=c) if isinstance(expr,S.Integral) else expr.doit() if hasattr(expr,'doit') else expr
 elif op=='approx':r=S.N(expr,c.precision);numeric=True
 elif op in ['simplify','expand','factor','apart','cancel','trigsimp']:r=S.apart(expr,c.sym()) if op=='apart' else getattr(S,op)(expr)
 elif op=='substitute':r=expr.subs(c.p('substitutions','{x:2}'),simultaneous=True).doit()
 elif op=='solve':
  v=c.sym();domain=S.S.Reals if c.settings.get('domain','real')=='real' else S.S.Complexes
  if isinstance(expr,Relational) and not isinstance(expr,S.Equality):r=S.reduce_inequalities([expr],v);c.notes.append('Inequality solving uses the real domain.')
  else:
   e=expr.lhs-expr.rhs if isinstance(expr,S.Equality) else expr
   r=parameter_linear_cases(e,v,domain,c.denominators)
   if r is None:
    r=S.solveset(e,v,domain=domain)
    for den in c.denominators:
     if den.has(v):r=S.Complement(r,S.solveset(den,v,domain=domain))
    try:
     poly=S.Poly(S.together(e).as_numer_denom()[0],v);lc=poly.LC()
     if poly.degree()>1 and lc.free_symbols and lc.is_zero is None:conditional=True;c.notes.append('Generic polynomial branch requires '+str(lc)+' ≠ 0; solve the degenerate leading-coefficient case separately.')
    except S.PolynomialError:pass
  c.notes.append('Solution domain: '+str(domain)+'. Original excluded points are retained.')
 elif op=='system':
  eqs=c.p('equations','[x+y-3,x-y-1]');vs=c.p('variables','[x,y]');eqs=[e.lhs-e.rhs if isinstance(e,S.Equality) else e for e in eqs]
  if c.raw('kind','linear')=='linear':r=S.linsolve([S.expand(e.doit()) for e in eqs],vs)
  else:r=S.nonlinsolve(eqs,vs);c.notes.append('Nonlinear systems may return conditional or incomplete symbolic sets. Solutions are over the complex domain unless constrained.')
  r=filter_system_exclusions(r,vs,c.denominators)
  if isinstance(r,dict):conditional=True
 elif op=='inequality':r=S.reduce_inequalities(c.p('inequalities','[x^2<4,x>0]'),c.p('variable','x'))
 elif op=='differentiate':r=S.diff(expr,c.sym(),c.integer('order','1',1,20))
 elif op=='integrate':
  v=c.sym();a=c.raw('lower');b=c.raw('upper')
  if bool(a)!=bool(b):raise ValueError('Set both bounds, or leave both empty for an antiderivative.')
  r=checked_integrate(expr,(v,c.parse(a),c.parse(b)),context=c) if a else S.integrate(expr,v)
  if not a and not walk_unresolved(r):r=r+S.Symbol('C');c.notes.append('C is an arbitrary integration constant on each connected domain.')
 elif op=='multiple_integral':
  bounds=c.p('bounds','[(y,0,x),(x,0,1)]')
  if not 1<=len(bounds)<=3:raise ValueError('Use one to three integration bounds, innermost first.')
  r=checked_integrate(expr,*bounds,context=c);c.notes.append('Bounds are applied in the listed order, innermost first.')
 elif op=='limit':r=S.limit(expr,c.sym(),c.p('point','0'),dir=c.raw('direction','+-'))
 elif op in ['series','asymptotic']:r=S.series(expr,c.sym(),c.p('point','0'),c.integer('order','6',1,30),dir=c.raw('direction','+'))
 elif op in ['sum','product']:
  r=getattr(S,'summation' if op=='sum' else 'product')(expr,(c.sym('variable','n'),c.p('lower','1'),c.p('upper','oo')))
 elif op=='convergence':
  sm=S.Sum(expr,(c.sym('variable','n'),c.p('lower','1'),S.oo));r={'convergent':sm.is_convergent(),'absolutely convergent':sm.is_absolutely_convergent()}
 elif op=='sequence_limit':r=S.limit(expr,c.sym('variable','n'),S.oo)
 elif op=='multilimit':
  vs=c.p('variables','[x,y]');paths=c.p('paths','[[t,0],[0,t],[t,t]]');t=c.sym('parameter','t');p=c.p('point','0')
  limits=[S.limit(expr.subs(dict(zip(vs,path)),simultaneous=True),t,p) for path in paths];r={'path limits':limits}
  c.notes.append('Different path limits disprove a common limit. Agreement along finitely many paths does not prove a multivariable limit.')
 elif op=='residue':r=S.residue(expr,c.sym('variable','z'),c.p('point','0'))
 elif op=='singularities':r=S.singularities(expr,c.sym(),domain=S.S.Reals if c.settings.get('domain')=='real' else S.S.Complexes);c.notes.append('Branch points and some non-isolated singularities may not be returned by this algorithm.')
 elif op=='domain':r=continuous_domain(expr,c.sym(),S.S.Reals)
 elif op.startswith('matrix_'):
  a=matrix(c);kind=op[7:]
  methods={'det':'det','inverse':'inv','transpose':'transpose','adjoint':'adjoint','adjugate':'adjugate','cofactors':'cofactor_matrix','rref':'rref','rank':'rank','null':'nullspace','row':'rowspace','column':'columnspace','eigenvalues':'eigenvals','eigenvectors':'eigenvects','lu':'LUdecomposition','qr':'QRdecomposition','svd':'singular_value_decomposition','pinverse':'pinv','trace':'trace','cholesky':'cholesky'}
  if kind=='cells':r={'cells':[[str(a[i,j]) for j in range(a.cols)] for i in range(a.rows)]}
  elif kind=='characteristic':r=a.charpoly(c.sym()).as_expr()
  elif kind=='solve':
   rhs=matrix(c,'rhs')
   if rhs.rows!=a.rows or rhs.cols!=1:raise ValueError('The right-hand side must be one column with exactly '+str(a.rows)+' rows. Solve each right-hand side separately.')
   r=S.linsolve((a.applyfunc(lambda x:x.doit()),rhs.applyfunc(lambda x:x.doit())))
  elif kind=='condition':r=S.oo if a.rank()<min(a.rows,a.cols) else float(np.linalg.cond(np.asarray(a,dtype=complex)));numeric=True
  elif kind=='rref':
   reduced,pivots=a.rref();r=reduced;details={'pivot columns (1-based)':[j+1 for j in pivots]}
   # Record actual elementary row operations for small exact matrices.
   if a.rows<=8 and a.cols<=10:
    work=a.copy();steps=[];row=0
    for col in range(work.cols):
     candidates=[i for i in range(row,work.rows) if work[i,col].is_zero is False]
     if not candidates:continue
     pivot=candidates[0]
     if pivot!=row:work.row_swap(row,pivot);steps.append({'operation':f'R{row+1} ↔ R{pivot+1}','matrix':work.copy()})
     p=work[row,col]
     if p!=1:work.row_op(row,lambda v,j:v/p);steps.append({'operation':f'R{row+1} ← R{row+1}/({p})','matrix':work.copy()})
     for i in range(work.rows):
      if i==row or work[i,col]==0:continue
      k=work[i,col];work.row_op(i,lambda v,j:v-k*work[row,j]);steps.append({'operation':f'R{i+1} ← R{i+1} − ({k})R{row+1}','matrix':work.copy()})
     row+=1
     if row==work.rows:break
    if work.equals(reduced):details['elimination steps']=steps
   c.notes.append('Symbolic pivots assume their denominators are nonzero; parameter values can change rank. Pivot columns are 1-based.')
  else:r=getattr(a,methods[kind])()
  if a.free_symbols and kind in ['inverse','rref','rank','null','row','column','solve','lu','qr','svd','pinverse']:
   c.notes.append('Generic symbolic result: exceptional parameter values have not been split into cases. Re-evaluate after substituting those values.')
   if a.rows==a.cols:
    determinant=S.factor(a.det())
    if determinant!=0 and determinant.free_symbols:c.notes.append('Full-rank case requires '+str(determinant)+' ≠ 0.')
   else:
    _,pivots=a.rref()
    if pivots:
     _,rows=a[:,list(pivots)].T.rref();minor=S.factor(a.extract(list(rows),list(pivots)).det())
     if minor.free_symbols:c.notes.append('Displayed pivot pattern requires '+str(minor)+' ≠ 0; other cases are not resolved.')
   conditional=True
  if kind=='adjoint':c.notes.append('Hermitian adjoint Aᴴ = conjugate transpose, distinct from classical adjugate.')
  if kind=='adjugate':c.notes.append('Classical adjugate: transposed cofactor matrix. A adj(A) = det(A) I.')
 elif op in ['gradient','jacobian','hessian','divergence','curl','dot','cross','jacobian_factor']:
  e=c.p('expression','x^2+y^2');vs=c.p('variables','[x,y]')
  if op=='gradient':r=S.Matrix([S.diff(e,v) for v in vs])
  elif op=='jacobian':r=S.Matrix(e).jacobian(vs)
  elif op=='hessian':r=S.hessian(e,vs)
  elif op=='jacobian_factor':r=S.Abs(S.det(S.Matrix(e).jacobian(vs)))
  elif op=='divergence':
   if len(e)!=len(vs):raise ValueError('Field and coordinate dimensions must match.')
   r=sum(S.diff(a,b) for a,b in zip(e,vs))
  elif op=='curl':
   if len(e)!=3 or len(vs)!=3:raise ValueError('Curl requires 3 components and 3 coordinates.')
   x,y,z=vs;a,b,d=e;r=S.Matrix([S.diff(d,y)-S.diff(b,z),S.diff(a,z)-S.diff(d,x),S.diff(b,x)-S.diff(a,y)])
  else:r=getattr(S.Matrix(e),op)(S.Matrix(c.p('other','[1,0,0]')))
 elif op in ['line_integral','surface_integral','surface_area','contour']:
  e=S.Integer(1) if op=='surface_area' else c.p('expression','[-y,x,0]');pos=S.Matrix(c.p('position','[cos(t),sin(t),0]'));vs=c.p('variables','[x,y,z]');bounds=c.p('bounds','[(t,0,2*pi)]');pull=dict(zip(vs,pos))
  if op=='contour':
   z=c.sym('variable','z');path=c.p('path','exp(I*t)');t=bounds[0][0];integrand=e.subs(z,path)*S.diff(path,t)
  elif op=='line_integral':
   t=bounds[0][0];velocity=pos.diff(t)
   integrand=S.Matrix(e).subs(pull,simultaneous=True).dot(velocity) if isinstance(e,(list,tuple,S.MatrixBase)) else e.subs(pull,simultaneous=True)*S.sqrt(velocity.dot(velocity))
  else:
   u,v=bounds[0][0],bounds[1][0];normal=pos.diff(u).cross(pos.diff(v))
   integrand=S.Matrix(e).subs(pull,simultaneous=True).dot(normal) if isinstance(e,(list,tuple,S.MatrixBase)) else e.subs(pull,simultaneous=True)*S.sqrt(normal.dot(normal))
  r=contour_integral(e,z,path,bounds,c) if op=='contour' else S.integrate(S.simplify(integrand),*bounds);numeric=bool(op=='contour' and c.contour_numeric);details={'pulled-back integrand':str(integrand)};c.notes.append('Orientation is the listed parameter direction (surface normal r_u × r_v).')
 elif op in ['laplace','inverse_laplace','fourier','inverse_fourier']:
  fn={'laplace':S.laplace_transform,'inverse_laplace':S.inverse_laplace_transform,'fourier':S.fourier_transform,'inverse_fourier':S.inverse_fourier_transform}[op]
  r=fn(expr,c.sym('variable','t'),c.sym('target','s'));c.notes.append('Transform convergence conditions are retained when the engine returns them.')
 elif op=='ode':
  equation=c.p('equation',"diff(y(x),x)-y(x)");func=c.p('function','y(x)');ics=c.p('conditions','{}');r=S.dsolve(equation,func,ics=ics or None)
  try:details={'substitution check':str(checkodesol(equation,r,func=func))}
  except Exception:pass
 elif op=='pde':r=S.pdsolve(c.p('equation','diff(u(x,y),x)+diff(u(x,y),y)'),c.p('function','u(x,y)'));c.notes.append('Symbolic PDE support covers the engine’s first-order linear families.')
 elif op in ['ivp','bvp']:
  vs=c.p('variables','[y,v]');t=c.sym('variable','t');rhs=c.p('rhs','[v,-y]');f=S.lambdify((t,*vs),rhs,'numpy');a=c.num('lower','0');b=c.num('upper','10')
  if a>=b:raise ValueError('End time must exceed start time.')
  if op=='ivp':
   initial=c.arr('initial','[1,0]');tol=c.num('tolerance','1e-8')
   if not 1e-12<=tol<=1e-2:raise ValueError('Tolerance must lie between 1e-12 and 0.01.')
   sol=ni.solve_ivp(lambda q,y:np.asarray(f(q,*y),float),(a,b),initial,rtol=tol,atol=tol/100,dense_output=True)
   if not sol.success:raise ValueError(sol.message)
   ts=np.linspace(a,b,101);ys=sol.sol(ts);r={'t':ts,'values':ys,'function evaluations':sol.nfev,'relative tolerance':tol}
  else:
   # Boundary conditions provide one condition per state: [state-index, endpoint 0/1, value].
   bc=c.p('conditions','[[0,0,0],[0,1,1]]')
   if len(bc)!=len(vs):raise ValueError('Provide one boundary condition per state variable.')
   for k,end,value in bc:
    if int(k)!=k or not 0<=int(k)<len(vs) or end not in [0,1]:raise ValueError('Boundary condition uses [state index, endpoint 0 or 1, value].')
   ts=np.linspace(a,b,30);sol=ni.solve_bvp(lambda q,y:np.array([np.broadcast_to(v,q.shape) for v in f(q,*y)],float),lambda ya,yb:np.array([(ya if int(end)==0 else yb)[int(k)]-float(value) for k,end,value in bc]),ts,np.zeros((len(vs),len(ts))),tol=1e-6,max_nodes=1000)
   if not sol.success:raise ValueError(sol.message)
   ts=np.linspace(a,b,101);r={'t':ts,'values':sol.sol(ts),'max residual':float(np.max(sol.rms_residuals))}
  numeric=True;c.notes.append('Numerical trajectory, not a symbolic or global existence proof. Samples can be saved as an object.')
 elif op=='stability':
  vs=c.p('variables','[x,y]');rhs=S.Matrix(c.p('rhs','[y,-x-y]'));point=c.p('point','{x:0,y:0}');j=rhs.jacobian(vs).subs(point);r={'field at point':rhs.subs(point),'Jacobian':j,'eigenvalues':j.eigenvals()};c.notes.append('Linearisation is inconclusive for eigenvalues with zero real part; first verify the field vanishes at the point.')
 elif op in ['heat','wave']:
  x=c.sym();t=c.sym('time','t');L=c.p('length','pi');speed=c.p('coefficient','1');coeffs=c.p('coefficients','[1]')
  if L.is_positive is not True or speed.is_positive is not True:raise ValueError('Length and diffusivity/wave speed must be positive.')
  if len(coeffs)>50 or len(c.p('velocity','[]'))>50:raise ValueError('Use at most 50 sine modes.')
  velocity=c.p('velocity','[]');r=0
  for k in range(1,max(len(coeffs),len(velocity) if op=='wave' else 0)+1):
   a=coeffs[k-1] if k<=len(coeffs) else S.Integer(0)
   w=k*S.pi/L
   time=S.exp(-speed*w*w*t) if op=='heat' else S.cos(speed*w*t)
   r+=a*S.sin(w*x)*time
   if op=='wave' and k<=len(velocity):r+=velocity[k-1]*S.sin(w*x)*S.sin(speed*w*t)/(speed*w)
  c.notes.append('Exact finite sine-mode solution on 0≤x≤L with homogeneous Dirichlet boundaries. Coefficients specify the initial profile; omitted modes are not inferred.')
 elif op=='poisson':
  n=c.integer('grid','12',3,35);fexpr=c.p('forcing','-2*pi^2*sin(pi*x)*sin(pi*y)');x,y=c.p('variables','[x,y]');f=S.lambdify((x,y),fexpr,'numpy');h=1/(n+1)
  from scipy.sparse import diags,kron,eye as speye
  from scipy.sparse.linalg import spsolve
  T=diags([np.ones(n-1),-2*np.ones(n),np.ones(n-1)],[-1,0,1])/h**2;A=kron(speye(n),T)+kron(T,speye(n));q=np.arange(1,n+1)*h;X,Y=np.meshgrid(q,q);rhs=np.broadcast_to(f(X,Y),X.shape).ravel();u=spsolve(A.tocsr(),rhs);r={'grid coordinates':q,'interior solution':u.reshape(n,n),'residual infinity norm':float(np.max(np.abs(A@u-rhs)))};numeric=True;c.notes.append('Δu=f on the unit square with u=0 on all boundaries; second-order five-point finite differences. Discretisation error is not the residual.')
 elif op=='distribution':
  name=c.raw('distribution','normal');pars=c.arr('parameters','[0,1]').tolist();action=c.raw('action','cdf');value=c.num('value','0')
  names={'normal':'norm','student-t':'t','chi-square':'chi2','F':'f','binomial':'binom','poisson':'poisson','geometric':'geom','hypergeometric':'hypergeom','uniform':'uniform','exponential':'expon','gamma':'gamma','beta':'beta','negative-binomial':'nbinom'}
  if name not in names:raise ValueError('Unknown distribution.')
  if name=='normal':
   if len(pars)!=2 or pars[1]<=0:raise ValueError('Normal parameters are [mean, positive standard deviation].')
   dist=stats.norm(loc=pars[0],scale=pars[1])
  elif name=='uniform':
   if len(pars)!=2 or pars[0]>=pars[1]:raise ValueError('Uniform parameters are [lower, upper], with lower < upper.')
   dist=stats.uniform(loc=pars[0],scale=pars[1]-pars[0])
  elif name=='exponential':
   if len(pars)!=1 or pars[0]<=0:raise ValueError('Exponential parameter is [positive rate].')
   dist=stats.expon(scale=1/pars[0])
  elif name=='gamma':
   if len(pars)!=2 or min(pars)<=0:raise ValueError('Gamma parameters are [positive shape, positive scale].')
   dist=stats.gamma(pars[0],scale=pars[1])
  else:dist=getattr(stats,names[name])(*pars)
  mean,var=dist.stats(moments='mv')
  if any(not np.isfinite(p) for p in pars):raise ValueError('Distribution parameters must be finite.')
  if name in ['student-t','chi-square','F','beta'] and (not pars or min(pars)<=0):raise ValueError('Shape and degrees-of-freedom parameters must be positive.')
  if name in ['binomial','negative-binomial'] and (len(pars)!=2 or pars[0]!=int(pars[0]) or pars[0]<(1 if name=='negative-binomial' else 0) or not 0<=pars[1]<=1 or name=='negative-binomial' and pars[1]==0):raise ValueError('Use an integer trial/success count and a valid probability.')
  if name=='poisson' and (len(pars)!=1 or pars[0]<0):raise ValueError('Poisson mean must be nonnegative.')
  if name=='geometric' and (len(pars)!=1 or not 0<pars[0]<=1):raise ValueError('Success probability must lie in (0,1].')
  if name=='hypergeometric' and (len(pars)!=3 or any(p!=int(p) for p in pars) or pars[0]<=0 or not 0<=pars[1]<=pars[0] or not 0<=pars[2]<=pars[0]):raise ValueError('Use integer population, successes and draws with 0 ≤ successes, draws ≤ population.')
  if action in ['ppf','isf'] and not 0<value<1:raise ValueError('Inverse probability must be strictly between 0 and 1.')
  if action=='moments':r={'mean':mean,'variance':var}
  else:
   method='pmf' if action=='pdf/pmf' and hasattr(dist,'pmf') else 'pdf' if action=='pdf/pmf' else action
   if method not in ['pdf','pmf','cdf','sf','ppf','isf'] or not hasattr(dist,method):raise ValueError('Use a density for continuous variables and a point probability for discrete variables.')
   r=float(getattr(dist,method)(value))
   if np.isnan(r):raise ValueError('These parameters or inputs are outside the distribution domain.')
  numeric=True;c.notes.append('CDF = P(X≤x); SF = P(X>x). For a discrete inclusive upper tail P(X≥k), use SF at k−1. PPF inverts the CDF.')
 elif op=='proportion':
  counts=c.p('counts','[40,100]');action=c.raw('action','one-sample interval');level=c.num('level','0.95');null=c.num('null','0.5');tail=c.raw('tail','two-sided')
  if len(counts) not in [2,4] or any(S.sympify(v).is_integer is not True for v in counts):raise ValueError('Counts must be exact integers [successes,trials], or two such pairs.')
  counts=[int(v) for v in counts]
  for k,n in zip(counts[::2],counts[1::2]):
   if n<1 or not 0<=k<=n:raise ValueError('Each pair requires 0≤successes≤trials and trials>0.')
  if not 0<level<1:raise ValueError('Confidence level must lie between 0 and 1.')
  k,n=counts[:2];p=k/n;z=stats.norm.ppf((1+level)/2)
  if action=='one-sample interval':
   center=(p+z*z/(2*n))/(1+z*z/n);half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n);r={'proportion':p,'Wilson lower':center-half,'Wilson upper':center+half,'confidence':level}
  elif action=='one-sample test':
   if not 0<null<1:raise ValueError('The null proportion must be strictly between 0 and 1 for a z test.')
   statistic=(p-null)/math.sqrt(null*(1-null)/n);pvalue=2*stats.norm.sf(abs(statistic)) if tail=='two-sided' else stats.norm.cdf(statistic) if tail=='less' else stats.norm.sf(statistic);r={'z':statistic,'p-value':pvalue,'null proportion':null,'tail':tail}
  else:
   if len(counts)!=4:raise ValueError('Two samples require [successes1,trials1,successes2,trials2].')
   k2,n2=counts[2:];p2=k2/n2
   if action=='two-sample interval':
    se=math.sqrt(p*(1-p)/n+p2*(1-p2)/n2);r={'difference p1−p2':p-p2,'Wald lower':p-p2-z*se,'Wald upper':p-p2+z*se,'standard error':se}
   else:
    pool=(k+k2)/(n+n2);se=math.sqrt(pool*(1-pool)*(1/n+1/n2))
    if se==0:raise ValueError('Pooled variance is zero; the proportion z test is undefined.')
    statistic=(p-p2)/se;pvalue=2*stats.norm.sf(abs(statistic)) if tail=='two-sided' else stats.norm.cdf(statistic) if tail=='less' else stats.norm.sf(statistic);r={'z':statistic,'p-value':pvalue,'tail':tail,'null':'p1=p2'}
  numeric=True;c.notes.append('Independent Bernoulli samples. Normal z tests and the two-sample Wald interval need adequately large success/failure counts (typically ≥10 each); use the exact binomial test for small one-sample counts.')
 elif op=='two_mean_interval':
  a=c.arr('data','[1,2,3,4,5]').ravel();b=c.arr('other','[2,3,4,5,6]').ravel();level=c.num('level','0.95');kind=c.raw('kind','Welch')
  if min(len(a),len(b))<2 or not 0<level<1:raise ValueError('Both samples need at least 2 observations and confidence must be between 0 and 1.')
  if kind=='paired':
   if len(a)!=len(b):raise ValueError('Paired observations must have matching lengths.')
   diff=a-b;center=diff.mean();se=stats.sem(diff);df=len(diff)-1
  else:
   center=a.mean()-b.mean();va=a.var(ddof=1)/len(a);vb=b.var(ddof=1)/len(b);se=math.sqrt(va+vb);df=(va+vb)**2/(va*va/(len(a)-1)+vb*vb/(len(b)-1)) if va+vb else min(len(a),len(b))-1
  half=stats.t.ppf((1+level)/2,df)*se;r={'mean difference':center,'lower':center-half,'upper':center+half,'standard error':se,'degrees of freedom':df};numeric=True;c.notes.append('Independent observations (or independent paired differences); approximately normal sampling distribution. Welch uses unequal variances.')
 elif op=='expectation':
  value=c.p('value','x');weight=c.p('weight','2*x');v=c.sym();a=c.p('lower','0');b=c.p('upper','1');kind=c.raw('kind','continuous');opfun=S.integrate if kind=='continuous' else S.summation
  total=opfun(weight,(v,a,b));mean=opfun(value*weight,(v,a,b));variance=opfun(value**2*weight,(v,a,b))-mean**2;r={'normalisation':S.simplify(total),'expectation':S.simplify(mean),'variance':S.simplify(variance)}
  if S.simplify(total-1)!=0:raise ValueError('The supplied density/mass does not integrate/sum to 1 (or normalisation could not be proved).')
  c.notes.append('The weight must be nonnegative on its support. Normalisation is checked; positivity for general symbolic weights is an explicit user assumption.')
 elif op=='describe':
  a=c.arr('data','[1,2,3]');a=a.ravel();n=len(a)
  if n<1 or not np.isfinite(a).all():raise ValueError('Use a nonempty finite numeric dataset.')
  r={'n':n,'sum':a.sum(),'mean':a.mean(),'median':np.median(a),'minimum':a.min(),'maximum':a.max(),'quartiles (linear interpolation)':np.quantile(a,[.25,.5,.75]),'population variance (÷n)':a.var(),'population standard deviation':a.std(),'sample variance (÷n−1)':a.var(ddof=1) if n>1 else 'undefined for n=1','sample standard deviation':a.std(ddof=1) if n>1 else 'undefined for n=1'};numeric=True
 elif op=='regression':
  x=c.arr('x','[1,2,3,4]').ravel();y=c.arr('y','[3,5,7,9]').ravel();kind=c.raw('model','linear')
  if len(x)!=len(y) or len(x)<3:raise ValueError('Provide matching x/y datasets with at least 3 points.')
  if kind in ['linear','polynomial']:
   degree=1 if kind=='linear' else c.integer('degree','2',1,min(10,len(x)-1));coef=np.polyfit(x,y,degree);yp=np.polyval(coef,x);sx=S.Symbol('x');formula=sum(S.Float(float(v))*sx**(degree-i) for i,v in enumerate(coef))
  elif kind in ['sinusoidal','logistic']:
   if kind=='sinusoidal':
    fn=lambda x,a,b,c,d:a*np.sin(b*x+c)+d;guess=[(y.max()-y.min())/2,2*np.pi/(x.max()-x.min()),0,y.mean()]
   else:
    fn=lambda x,L,k,x0:L/(1+np.exp(-k*(x-x0)));guess=[max(y.max(),1),1,float(np.median(x))]
   if len(x)<=len(guess):raise ValueError('Provide more observations than fitted parameters.')
   user=c.p('initial','[]');guess=np.asarray(user,float).tolist() if len(user) else guess;coefs,cov=optimize.curve_fit(fn,x,y,p0=guess,maxfev=10000);yp=fn(x,*coefs);sx=S.Symbol('x')
   formula=S.Float(coefs[0])*S.sin(S.Float(coefs[1])*sx+S.Float(coefs[2]))+S.Float(coefs[3]) if kind=='sinusoidal' else S.Float(coefs[0])/(1+S.exp(-S.Float(coefs[1])*(sx-S.Float(coefs[2]))));c.notes.append('Nonlinear local least-squares fit; the initial guess can change the solution. Inspect residuals.')
  else:
   if kind in ['exponential','power'] and np.any(y<=0):raise ValueError('Log-transformed regression requires positive y.')
   if kind in ['logarithmic','power'] and np.any(x<=0):raise ValueError('This regression requires positive x.')
   xx=np.log(x) if kind in ['logarithmic','power'] else x;yy=np.log(y) if kind in ['exponential','power'] else y;a,b=np.polyfit(xx,yy,1);sx=S.Symbol('x')
   formula=S.Float(float(np.exp(b)))*S.exp(S.Float(float(a))*sx) if kind=='exponential' else S.Float(float(np.exp(b)))*sx**S.Float(float(a)) if kind=='power' else S.Float(float(a))*S.log(sx)+S.Float(float(b));yp=S.lambdify(sx,formula,'numpy')(x)
   c.notes.append('Exponential and power fits minimise squared residuals after taking log(y).')
  ss=float(np.sum((y-yp)**2));total=float(np.sum((y-y.mean())**2));r={'model':formula,'R²':1-ss/total if total else 'undefined','residual sum of squares':ss,'Pearson r':stats.pearsonr(x,y).statistic,'Spearman rho':stats.spearmanr(x,y).statistic};reusable=str(formula);numeric=True
 elif op=='confidence':
  a=c.arr('data','[1,2,3,4,5]').ravel();level=c.num('level','0.95');n=len(a)
  if n<2 or not 0<level<1:raise ValueError('At least 2 observations and a confidence level between 0 and 1 are required.')
  se=stats.sem(a);critical=stats.t.ppf((1+level)/2,n-1);lo,hi=a.mean()-critical*se,a.mean()+critical*se;r={'mean':a.mean(),'lower':lo,'upper':hi,'standard error':se,'df':n-1,'confidence level':level};numeric=True;c.notes.append('One-sample Student t interval: independent observations and an approximately normal sampling distribution of the mean. Sample standard deviation uses n−1.')
 elif op=='test':
  name=c.raw('test','one-sample t');a=c.p('data','[1,2,3,4,5]') if name=='ANOVA' else c.arr('data','[1,2,3,4,5]');b=c.arr('other','[2,3,4,5,6]');tail=c.raw('tail','two-sided');mu=c.num('null','0')
  if name=='one-sample t':out=stats.ttest_1samp(a,mu,alternative=tail)
  elif name=='Welch t':out=stats.ttest_ind(a,b,equal_var=False,alternative=tail)
  elif name=='paired t':out=stats.ttest_rel(a,b,alternative=tail)
  elif name=='equal-variance t':out=stats.ttest_ind(a,b,equal_var=True,alternative=tail)
  elif name=='chi-square goodness':out=stats.chisquare(a,b)
  elif name=='chi-square independence':out=stats.chi2_contingency(a)
  elif name=='ANOVA':out=stats.f_oneway(*[np.asarray(group,float) for group in a])
  elif name=='binomial':
   if len(a)!=2 or any(not np.isfinite(v) or int(v)!=v for v in a) or not 0<=a[0]<=a[1] or a[1]<1 or not 0<=mu<=1:raise ValueError('Binomial test requires integer [successes,trials], 0≤successes≤trials and null probability in [0,1].')
   out=stats.binomtest(int(a[0]),int(a[1]),mu,alternative=tail)
  else:raise ValueError('Unknown test.')
  if not np.isfinite(out.statistic) or not np.isfinite(out.pvalue):raise ValueError('The test is undefined for these data (check sample sizes, variance and expected counts).')
  r={'statistic':out.statistic,'p-value':out.pvalue,'tail':tail if name not in ['ANOVA','chi-square goodness','chi-square independence'] else 'upper tail'};numeric=True
  if hasattr(out,'df'):r['degrees of freedom']=out.df
  c.notes.append('t tests assume independent samples (paired tests use independent pairs), with approximately normal means; equal-variance t and ANOVA additionally assume equal variances. Chi-square expected counts should generally be ≥5. A p-value is not P(null hypothesis is true).')
 elif op=='combinatorics':
  n=c.integer('n','10',0,100000);k=c.integer('k','3',0,n);kind=c.raw('kind','combinations');r=S.binomial(n,k) if kind=='combinations' else S.factorial(n)/S.factorial(n-k) if kind=='permutations' else S.factorial(n)
 elif op=='recurrence':r=S.rsolve(c.p('equation','a(n+2)-a(n+1)-a(n)'),c.p('function','a(n)'),c.p('conditions','{a(0):0,a(1):1}'));c.notes.append('A null result means this recurrence was unresolved, not that no solution exists.')
 elif op=='generating':
  n=c.sym('variable','n');z=c.sym('target','z');r=S.summation(c.p('sequence','n')*z**n,(n,0,S.oo));c.notes.append('Convergence conditions from the engine are retained; formal and analytic generating functions have different interpretations.')
 elif op=='sets':
  a=S.FiniteSet(*c.p('left','[1,2,3]'));b=S.FiniteSet(*c.p('right','[2,3,4]'));kind=c.raw('operation','union');r={'union':lambda:a|b,'intersection':lambda:a&b,'difference':lambda:a-b,'product':lambda:S.ProductSet(a,b),'symmetric difference':lambda:a^b}[kind]()
 elif op=='logic':
  e=c.p('expression','Implies(p,q)');vs=sorted(e.free_symbols,key=str)
  if len(vs)>10:raise ValueError('Truth tables are limited to 10 variables.')
  from sympy.logic.boolalg import truth_table
  r={'simplified':S.simplify_logic(e),'satisfying assignment':S.satisfiable(e),'variables':vs,'truth table':list(truth_table(e,vs))}
 elif op=='relation':r=relation_summary(c.p('universe','[1,2,3]'),c.p('pairs','[(1,1),(2,2),(3,3),(1,2)]'))
 elif op=='graph_theory':
  directed=c.raw('directed','no')=='yes';g=nx.DiGraph() if directed else nx.Graph();edges=c.p('edges','[(0,1,1),(1,2,2),(0,2,4)]');nodes=c.p('nodes','[]')
  if len(nodes)>200 or len(edges)>1000:raise ValueError('Graph analysis is limited to 200 nodes and 1,000 edges.')
  g.add_nodes_from([str(n) for n in nodes])
  for edge in edges:
   if len(edge) not in [2,3]:raise ValueError('Each edge is (from,to) or (from,to,weight).')
   g.add_edge(str(edge[0]),str(edge[1]),weight=float(edge[2]) if len(edge)==3 else 1,capacity=float(edge[2]) if len(edge)==3 else 1)
  if len(g)>200:raise ValueError('Graph analysis is limited to 200 nodes.')
  action=c.raw('action','summary');a=str(c.p('start','0'));b=str(c.p('end','2'))
  if action=='path':r={'path':nx.shortest_path(g,a,b,weight='weight',method='bellman-ford'),'distance':nx.shortest_path_length(g,a,b,weight='weight',method='bellman-ford')}
  elif action=='spanning tree':
   if directed:raise ValueError('Minimum spanning tree requires an undirected graph.')
   tree=nx.minimum_spanning_tree(g);r=list(tree.edges(data='weight'));c.notes.append('Disconnected inputs return a minimum spanning forest.')
  elif action=='flow':r=nx.maximum_flow(g,a,b)
  elif action=='adjacency':r=S.Matrix(nx.to_numpy_array(g,nodelist=list(g)))
  elif action=='laplacian':
   if directed:raise ValueError('This Laplacian operation requires an undirected graph.')
   r=S.Matrix(nx.laplacian_matrix(g).toarray())
  else:r={'nodes':list(g),'degrees':dict(g.degree()),'components':list(nx.strongly_connected_components(g) if directed else nx.connected_components(g)),'bipartite':nx.is_bipartite(g),'planar (underlying graph)':nx.check_planarity(nx.Graph(g))[0],'cycles':list(nx.simple_cycles(g))[:100] if directed and len(g)<15 else nx.cycle_basis(g) if not directed else 'Cycle enumeration limited to <15 nodes.'}
  c.notes.append('Matrix rows follow the displayed insertion order of nodes. Directed connectivity means strongly connected components.')
 elif op=='number_theory':
  a=c.integer('a','84');b=c.integer('b','30');kind=c.raw('action','gcd')
  if kind=='gcd':r=S.gcd(a,b)
  elif kind=='lcm':r=S.lcm(a,b)
  elif kind=='Bézout':r=S.gcdex(a,b);c.notes.append('Output (s,t,g) satisfies s·a+t·b=g=gcd(a,b).')
  elif kind=='modular inverse':r=S.mod_inverse(a,b)
  elif kind=='modular power':r=pow(a,c.integer('exponent','13',0),b)
  elif kind=='factor':r=S.factorint(a)
  elif kind=='prime':r=S.isprime(a);c.notes.append('Primality is deterministic below 2^64; larger accepted values use a strong probable-prime test, not a proof certificate.')
  elif kind=='totient':r=S.totient(a)
  elif kind=='divisors':r=S.divisors(a)
  elif kind=='continued fraction':r=S.continued_fraction(S.Rational(a,b))
 elif op=='crt':
  r=crt(c.p('moduli','[3,5]'),c.p('residues','[2,3]'),check=True)
  if r is None:r=S.S.EmptySet
  c.notes.append('Result (r,m) represents x=r modulo m. EmptySet means the congruences are inconsistent.')
 elif op=='diophantine':r=S.diophantine(c.p('expression','2*x+3*y-7'));c.notes.append('Free integer parameters describe families. Solutions may depend on assumptions and the supported equation family.')
 elif op=='group':r=permutation_group_summary(integer_rows(c.p('generators','[[1,0,2],[1,2,0]]')),integer_rows(c.p('subgroup','[[1,0,2]]')),c.integer('point','0',0))
 elif op=='quotient':r=quotient_arithmetic(c.integer('prime','2',2),c.p('modulus','a^2+a+1'),c.sym('variable','a'),c.p('left','a'),c.raw('action','inverse'),c.p('right','a+1'),c.integer('exponent','2',0,100000),require_field=c.raw('structure','field')=='field')
 elif op=='polynomial':
  e=c.p('expression','x^4-1');v=c.sym();kind=c.raw('action','factor');p=c.integer('modulus','0',0)
  if p and not S.isprime(p):raise ValueError('Coefficient-field modulus must be prime; use quotient rings for composite moduli.')
  kw={'modulus':p} if p else {}
  if kind=='factor':r=S.factor(e,**kw)
  elif kind=='divide':r=S.div(e,c.p('other','x^2+1'),v,**kw)
  elif kind=='gcd':r=S.gcd(e,c.p('other','x^2+1'),**kw)
  elif kind=='resultant':r=S.Poly(e,v,**kw).resultant(S.Poly(c.p('other','x^2+1'),v,**kw))
  elif kind=='discriminant':r=S.Poly(e,v,**kw).discriminant()
 elif op=='ideal':
  vs=c.p('variables','[x,y]');g=S.groebner(c.p('generators','[x*y-1,y^2-1]'),*vs,order=c.raw('order','lex'));quo,rem=g.reduce(c.p('expression','x-y'));r={'Groebner basis':list(g),'quotients':quo,'remainder':rem,'member of ideal':rem==0};c.notes.append('Polynomial ideal membership over the inferred characteristic-zero coefficient field; order is explicit.')
 elif op=='homology':r=simplicial_homology(integer_rows(c.p('facets','[[0,1],[1,2],[0,2]]')))
 elif op=='topology':r=finite_topology(c.p('universe','[0,1]'),c.p('open_sets','[[],[1],[0,1]]'),c.p('subset','[1]'))
 elif op=='topology_map':r=topology_map(c.p('source','[0,1]'),c.p('source_opens','[[],[1],[0,1]]'),c.p('target','[0,1]'),c.p('target_opens','[[],[1],[0,1]]'),c.p('images','[0,1]'))
 elif op=='surface_geometry':
  coords=c.p('variables','[u,v]');mapping={v:S.Symbol(str(v),real=True) for v in coords if isinstance(v,S.Symbol) and v.is_real is None}
  realvars=[v.xreplace(mapping) for v in coords];position=[e.xreplace(mapping) for e in c.p('position','[sin(u)*cos(v),sin(u)*sin(v),cos(u)]')];point={k.xreplace(mapping):v for k,v in c.p('point','{}').items()};r=surface_geometry(position,realvars,point or None);c.notes.append('Surface coordinates are real. The chart must be regular; singular chart points are excluded.')
 elif op=='curve_geometry':
  pos=S.Matrix(c.p('position','[cos(t),sin(t),t]'));t=c.sym('variable','t')
  if t.is_real is None:
   real=S.Symbol(str(t),real=True);pos=pos.subs(t,real);t=real
  if len(pos)!=3 or any(S.simplify(S.im(v))!=0 for v in pos):raise ValueError('Euclidean curve geometry requires three provably real coordinates. Set additional symbols real in assumptions.')
  v=pos.diff(t);a=v.diff(t);speed2=S.simplify(v.dot(v));cross=v.cross(a);cross2=S.simplify(cross.dot(cross))
  if speed2==0:raise ValueError('The curve has zero speed; curvature is undefined.')
  r={'speed':S.sqrt(speed2),'curvature':S.simplify(S.sqrt(cross2)/S.sqrt(speed2)**3),'torsion':'undefined: zero binormal' if cross2==0 else S.simplify(cross.dot(a.diff(t))/cross2)};c.notes.append('Real curve parameter; speed must be nonzero. Torsion is undefined where the binormal vanishes.')
 elif op=='geometry':
  a=c.p('left','Circle(Point(0,0),1)');b=c.p('right','Line(Point(-2,0),Point(2,0))');kind=c.raw('action','intersection');r=a.intersection(b) if kind=='intersection' else a.distance(b)
 elif op=='root':
  v=c.sym();f=S.lambdify(v,expr,'numpy');a=c.num('lower','0');b=c.num('upper','2')
  dom=continuous_domain(expr,v,S.S.Reals)
  if S.Interval(a,b).is_subset(dom) is not True:raise ValueError('The bracket is not proven continuous. Split around singularities or choose a verified continuous interval.')
  sol=optimize.root_scalar(f,bracket=[a,b],method='brentq',xtol=1e-12)
  if not sol.converged:raise ValueError('Root search did not converge.')
  r={'root':sol.root,'residual':float(f(sol.root)),'iterations':sol.iterations,'bracket':[a,b]};numeric=True;c.notes.append('One numerical root in the chosen continuous bracket; this is not an exhaustive root list.')
 elif op=='numeric_integral':
  e=c.p('expression','exp(-x^2)');v=c.sym();f=S.lambdify(v,e,'numpy');a=c.num('lower','0');b=c.num('upper','oo');singular=S.singularities(e,v,S.S.Reals)
  if isinstance(singular,S.FiniteSet) and any(float(p)>a and float(p)<b for p in singular):raise ValueError('Interior singularity detected. Split the improper integral and check each one-sided limit; a principal value is not an ordinary integral.')
  with warnings.catch_warnings():
   warnings.simplefilter('error',ni.IntegrationWarning)
   val,err=ni.quad(f,a,b,epsabs=1e-10,epsrel=1e-10,limit=200)
  r={'integral':val,'estimated absolute error':err};numeric=True;c.notes.append('Adaptive quadrature error is an estimate; split difficult integrals at known discontinuities.')
 elif op=='numeric_derivative':
  e=c.p('expression','sin(x)');v=c.sym();r=checked_numeric_derivative(e,v,c.p('point','1'),c.num('step','1e-4'));numeric=True;c.notes.append('Step comparison and one-sided slopes are diagnostics, not rigorous error bounds.')
 elif op=='numeric_system':
  vs=c.p('variables','[x,y]');es=c.p('equations','[x^2+y^2-1,x-y]');fn=S.lambdify(vs,es,'numpy');sol=optimize.root(lambda q:np.asarray(fn(*q),float),c.arr('initial','[1,1]'));r={'success':bool(sol.success),'point':sol.x,'residual':sol.fun,'message':sol.message};numeric=True;c.notes.append('Local search from the initial guess; no claim that all roots have been found.')
 elif op=='minimize':
  vs=c.p('variables','[x,y]');f=S.lambdify(vs,expr,'numpy');bounds=c.p('bounds','[(-10,10),(-10,10)]');ineq=c.p('constraints','[]');cons=[{'type':'ineq','fun':lambda q,fn=S.lambdify(vs,g,'numpy'):float(fn(*q))} for g in ineq]
  sol=optimize.minimize(lambda q:float(f(*q)),c.arr('initial','[0,0]'),bounds=[tuple(float(x) for x in pair) for pair in bounds],constraints=cons,method='SLSQP');r={'success':bool(sol.success),'point':sol.x,'value':float(sol.fun),'iterations':int(sol.nit),'message':sol.message};numeric=True;c.notes.append('Local constrained minimisation. Each constraint g(x)≥0. A successful local search is not a proof of global optimality.')
 elif op=='linear_program':
  coef=c.arr('objective','[-1,-1]');a=c.arr('A','[[1,2],[3,1]]');b=c.arr('b','[4,5]');bounds=c.p('bounds','[(0,oo),(0,oo)]');ae=c.p('Aeq','[]');be=c.p('beq','[]');sol=optimize.linprog(coef,A_ub=a if len(a) else None,b_ub=b if len(b) else None,A_eq=np.asarray(ae,float) if len(ae) else None,b_eq=np.asarray(be,float) if len(be) else None,bounds=[tuple(None if q in [S.oo,-S.oo] else float(q) for q in pair) for pair in bounds],method='highs');r={'status':sol.message,'success':bool(sol.success),'point':sol.x,'minimum':sol.fun};numeric=True;c.notes.append('Minimise c·x subject to A·x≤b and explicit variable bounds. Negate c for maximisation.')
 elif op=='interpolate':
  pts=c.p('points','[(0,1),(1,2),(2,5)]');v=c.sym();r=S.interpolate(pts,v)
 elif op=='spline':
  x=c.arr('x','[0,1,2,3]');y=c.arr('y','[0,1,0,1]');points=c.arr('points','[0.5,1.5,2.5]');kind=c.raw('kind','PCHIP');fn=interpolate.PchipInterpolator(x,y,extrapolate=False) if kind=='PCHIP' else interpolate.CubicSpline(x,y,extrapolate=False);r={'x':points,'y':fn(points)};numeric=True;c.notes.append('No extrapolation beyond supplied x values. Cubic spline uses not-a-knot boundary conditions.')
 elif op=='fft':
  a=np.asarray(c.p('data','[1,0,-1,0]'),complex);kind=c.raw('action','FFT');r=S.Matrix(fft.ifft(a) if kind=='inverse FFT' else fft.fft(a));numeric=True;c.notes.append('Forward FFT uses exp(−2πikn/N), no normalisation; inverse includes 1/N.')
 elif op=='convolution':r=S.Matrix(signal.convolve(c.arr('left','[1,2,1]'),c.arr('right','[1,-1]'),mode=c.raw('mode','full')));numeric=True
 elif op=='markov':
  a=matrix(c);n=a.rows
  if n!=a.cols or any(S.simplify(sum(a.row(i))-1)!=0 for i in range(n)) or any(v.is_nonnegative is not True for v in a):raise ValueError('Use a square nonnegative matrix whose rows sum to 1.')
  vs=S.symbols('p:'+str(n));stationary=S.linsolve(list((a.T-S.eye(n))*S.Matrix(vs))+[sum(vs)-1],vs);r={'stationary distributions':stationary,'transition power':a**c.integer('steps','5',0,1000)};c.notes.append('Row-stochastic convention: row distribution evolves as p→pP. Parameterised stationary families still require probabilities ≥0.')
 elif op=='units':
  from sympy.physics import units
  from sympy.physics.units import convert_to
  whitelist=['meter','centimeter','kilometer','second','minute','hour','kilogram','gram','newton','joule','watt','pascal','coulomb','volt','ampere','ohm','kelvin','mole','radian','degree','hertz']
  env={k:getattr(units,k) for k in whitelist};amount=c.parse(c.raw('expression','3*meter/second'),extra=env);target=c.parse(c.raw('target','kilometer/hour'),extra=env);r=convert_to(amount,target)
  from sympy.physics.units.quantities import Quantity
  if S.simplify(r/target).has(Quantity):raise ValueError('The source and target dimensions are incompatible.')
  c.notes.append('Multiplicative unit conversion; affine temperatures such as Celsius offsets are not supported.')
 elif op=='graph_derivative':
  x=c.sym();e=graph_expression('expression','canonical','sin(x)').subs(S.Symbol('a'),c.p('parameter','1'));r=S.diff(e,x);c.notes.append('Derivative of the graph expression, using its saved angle setting.')
 elif op=='graph_accumulation':
  x=c.sym();t=S.Dummy('integration_variable',real=True);e=graph_expression('expression','canonical','sin(x)').subs(S.Symbol('a'),c.p('parameter','1'));r=S.integrate(e.subs(x,t),(t,c.p('point','0'),x));c.notes.append('Accumulation function from the chosen base point, wherever the integral exists.')
 elif op=='graph_analysis':
  x=c.env.get('x',S.Symbol('x'));par={S.Symbol('a'):c.p('parameter','1')};e=graph_expression('expression','canonical','sin(x)').subs(par);g=graph_expression('other','otherCanonical','0').subs(par);action=c.raw('action','value');a=c.p('lower','-2');b=c.p('upper','2');point=c.p('point','0')
  if not a.is_real or not b.is_real or not a<b:raise ValueError('Use an increasing finite real interval.')
  interval=S.Interval(a,b);domain=continuous_domain(e,x,S.S.Reals)
  if action=='value':r=e.subs(x,point).doit()
  elif action in ['roots','intersection','critical points']:
   target=S.diff(e,x) if action=='critical points' else e-g if action=='intersection' else e
   search_domain=interval.intersect(domain)
   if action=='intersection':search_domain=search_domain.intersect(continuous_domain(g,x,S.S.Reals))
   r=S.solveset(target,x,domain=search_domain)
   c.notes.append('Solutions are restricted to the chosen interval. Critical points require separate classification; endpoints may also be extrema.')
   if action=='critical points' and isinstance(r,S.FiniteSet):details={'candidates':[{'x':str(v),'y':str(e.subs(x,v)),'second derivative':str(S.diff(e,x,2).subs(x,v)), 'classification':'Local minimum' if S.diff(e,x,2).subs(x,v).is_positive else 'Local maximum' if S.diff(e,x,2).subs(x,v).is_negative else 'Second derivative inconclusive'} for v in r]}
  elif action=='tangent':
   slope=S.diff(e,x).subs(x,point);value=e.subs(x,point)
   if slope.has(S.zoo,S.oo,-S.oo,S.nan) or value.has(S.zoo,S.oo,-S.oo,S.nan):raise ValueError('No finite tangent was found at this point.')
   r=S.expand(value+slope*(x-point));details={'point':[str(point),str(value)],'slope':str(slope)}
  elif action in ['integral','area']:
   if interval.is_subset(domain) is not True:raise ValueError('This interval crosses an undefined point. Split the integral explicitly at discontinuities.')
   if action=='area' and interval.is_subset(continuous_domain(g,x,S.S.Reals)) is not True:raise ValueError('The comparison curve is not continuous on the interval.')
   r=S.integrate(S.Abs(e-g) if action=='area' else e,(x,a,b))
  elif action=='domain':r=domain
  elif action=='singularities':r=S.singularities(e,x,S.S.Reals)
  else:raise ValueError('Unknown graph analysis operation.')
  c.notes.append('Graph parameter a = '+c.raw('parameter','1')+'. Analysis uses the original function, not screen pixels.')
 elif op=='finance':
  pv=c.num('principal','1000');rate=c.num('rate','0.05');n=c.integer('periods','12',1,100000);kind=c.raw('action','future value');r=pv*(1+rate)**n if kind=='future value' else pv*rate/(1-(1+rate)**(-n)) if rate else pv/n;numeric=True;c.notes.append('Rate is per period (0.05 means 5%). Payment assumes end-of-period payments and a fixed rate; this is arithmetic, not financial advice.')
 else:
  extra=extended(op,c)
  if extra is None:raise ValueError('Unknown operation: '+op)
  r,numeric=extra
 if r is None:raise ValueError('The engine could not resolve this request. This does not establish that no result or closed form exists.')
 for d in dict.fromkeys(c.denominators):c.notes.append('Original restriction: '+str(d)+' ≠ 0.')
 if c.assumptions:c.notes.append('Assumptions: '+c.settings.get('assumptions',''))
 conditional=conditional or isinstance(r,S.Piecewise)
 unresolved=walk_unresolved(r) or (isinstance(r,dict) and r.get('success') is False)
 if unresolved:c.notes.append('Some parts remain unevaluated or conditional. The engine has not established a complete answer; try assumptions, bounds, or numerical evaluation.')
 if not numeric and isinstance(r,S.Basic) and r.has(S.Float):numeric=True;c.notes.append('This result contains approximate floating-point values.')
 latex=S.latex(r) if not isinstance(r,(dict,np.ndarray)) else ''
 text=str(r) if not isinstance(r,dict) else json.dumps(convert(r),ensure_ascii=False,indent=2)
 approx=None
 if isinstance(r,(S.Expr,S.MatrixBase)) and not r.free_symbols and not unresolved:
  try:value=S.N(r,c.precision);approx=str(value) if value!=r and not value.has(S.Integral,S.Derivative,S.Sum,S.Product) else None
  except Exception:pass
 if reusable is None and isinstance(r,(S.Basic,S.MatrixBase,list,tuple,int,float,dict)):reusable=math_source(r)
 return {'text':text[:80000],'latex':latex[:40000],'approx':approx,'status':'unresolved' if unresolved else 'conditional' if conditional else 'divergent' if isinstance(r,S.Basic) and r in (S.oo,-S.oo,S.zoo,S.nan) else 'numeric' if numeric else 'exact','display':present(op,r,c,details),'detailDisplay':node(details) if details else None,'notes':list(dict.fromkeys(c.notes)),'detailSources':{str(k):math_source(v) for k,v in (details or r).items()} if isinstance(details or r,dict) else None,'details':convert(details or r) if isinstance(r,dict) or details else None,'inputLatex':S.latex(expr) if expr is not None else None,'reusable':reusable}

def compute_json(source):
 try:
  with warnings.catch_warnings(record=True) as ws:
   warnings.simplefilter('always');result=compute(json.loads(source))
   for w in ws:
    note=str(w.message)
    if 'deprecated' not in note.lower():result['notes'].append(note[:500])
  return json.dumps(result,ensure_ascii=False,allow_nan=False)
 except Exception as exc:
  return json.dumps({'status':'error','text':str(exc)[:1200] or type(exc).__name__,'latex':'','notes':['Input retained. Engine failure does not prove that no mathematical solution exists.']},ensure_ascii=False)


"""Small domain-preserving dispatch helpers; no network or site dependencies."""
import sympy as S
import numpy as np

def parameter_linear_cases(expression, variable, domain, denominators=()):
 """Return explicit parameter cases for affine equations, or None if inapplicable.
 Cases avoid claiming generic a!=0 formulas also cover the degenerate a=0 case.
 """
 try:
  numerator=S.together(expression).as_numer_denom()[0]
  poly=S.Poly(numerator,variable)
 except S.PolynomialError:return None
 if poly.degree()>1:return None
 a,b=poly.nth(1),poly.nth(0)
 if not (a.free_symbols|b.free_symbols)-{variable}:return None
 if a.is_zero is False:return None
 cases=[]
 for condition,solutions in [
  (S.Ne(a,0), S.Intersection(S.FiniteSet(-b/a),domain) if a!=0 else S.S.EmptySet),
  (S.And(S.Eq(a,0),S.Eq(b,0)),domain),
  (S.And(S.Eq(a,0),S.Ne(b,0)),S.S.EmptySet)]:
  condition=S.simplify(condition)
  if condition is S.false:continue
  for d in denominators:
   if d.has(variable):solutions=S.Complement(solutions,S.solveset(d,variable,domain=domain))
   else:condition=S.And(condition,S.Ne(d,0))
  cases.append({'when':condition,'solutions':solutions})
 return {'parameter cases':cases,'solution domain':domain}

def filter_system_exclusions(result, variables, denominators):
 """Remove definitely inadmissible tuples and retain unresolved conditions.
 Non-finite sets remain explicit conditional sets rather than being enumerated.
 """
 denominators=list(dict.fromkeys(denominators))
 if not denominators or result is S.S.EmptySet:return result
 if not isinstance(result,S.FiniteSet):
  return S.ConditionSet(S.Tuple(*variables),S.And(*[S.Ne(d,0) for d in denominators]),result)
 accepted=[];conditional=[]
 for candidate in result:
  if not isinstance(candidate,(tuple,S.Tuple)) or len(candidate)!=len(variables):
   return S.ConditionSet(S.Tuple(*variables),S.And(*[S.Ne(d,0) for d in denominators]),result)
  replacements=dict(zip(variables,candidate));conditions=[];invalid=False
  for den in denominators:
   value=S.simplify(den.subs(replacements,simultaneous=True))
   if value==0 or value.is_zero is True or value.has(S.nan,S.zoo):invalid=True;break
   if value.is_zero is not False:conditions.append(S.Ne(value,0))
  if invalid:continue
  if conditions:conditional.append({'candidate':candidate,'required condition':S.And(*conditions)})
  else:accepted.append(candidate)
 if not conditional:return S.FiniteSet(*accepted)
 return {'unconditional solutions':S.FiniteSet(*accepted),'conditional solutions':conditional}

def checked_numeric_derivative(expression, variable, point, step):
 """Central differences, one-sided diagnostics, and bounded symbolic checking."""
 point=S.sympify(point);h=float(step)
 if not np.isfinite(h) or h<=0:raise ValueError('Step must be finite and positive.')
 symbolic=None
 if S.count_ops(expression)<100:
  delta=S.Dummy('delta',real=True)
  f0=S.simplify(expression.subs(variable,point))
  quotient=(expression.subs(variable,point+delta)-f0)/delta
  try:
   left=S.limit(quotient,delta,0,dir='-');right=S.limit(quotient,delta,0,dir='+')
   if not (left.has(S.Limit) or right.has(S.Limit)):
    if left.is_finite is False or right.is_finite is False:raise ValueError('A finite derivative does not exist here: a one-sided difference quotient is unbounded.')
    difference=S.simplify(left-right)
    if difference.is_zero is False:raise ValueError('The derivative does not exist here: left and right derivatives differ ('+str(left)+' versus '+str(right)+').')
    if difference==0 and left.is_finite is True:symbolic={'left':str(left),'right':str(right)}
  except (NotImplementedError,RecursionError):pass
 f=S.lambdify(variable,expression,'numpy');x=float(point)
 if not np.isfinite(x) or x+h/2==x or x-h/2==x:raise ValueError('The point must be finite and the step large enough to change its floating-point value.')
 values=np.asarray([f(x),f(x-h),f(x+h),f(x-h/2),f(x+h/2)],dtype=float)
 if not np.isfinite(values).all():raise ValueError('The point or a neighbouring sample is outside the finite real domain.')
 y,ym,yp,ym2,yp2=values;left=(y-ym)/h;right=(yp-y)/h;left2=(y-ym2)/(h/2);right2=(yp2-y)/(h/2)
 d=(yp-ym)/(2*h);d2=(yp2-ym2)/h;scale=max(1,abs(d2),abs(left2),abs(right2));gap=abs(right2-left2)
 change=abs(right2-right)+abs(left2-left)
 if symbolic is None and gap>max(1e-7*scale,4*change,100*np.finfo(float).eps*max(1,abs(y))/h):
  raise ValueError('One-sided numerical slopes disagree. Differentiability is not established; inspect the point or change the step.')
 result={'central difference':float(d2),'step comparison':float(abs(d2-d)),'left difference':float(left2),'right difference':float(right2)}
 if symbolic is not None:result['one-sided symbolic check']=symbolic
 return result


def contour_integral(expression,z,path,bounds,c):
 c.contour_numeric=False
 if len(bounds)!=1 or len(bounds[0])!=3:raise ValueError('A contour requires one parameter and both endpoints.')
 t,lower,upper=bounds[0]
 # Detect a circle c + a exp(i k t), with real nonzero k and whole turns.
 terms=S.expand(path).args if isinstance(S.expand(path),S.Add) else [path]
 moving=[v for v in terms if v.has(t)];center=S.simplify(path-sum(moving))
 if len(moving)==1:
  term=moving[0];exps=list(term.atoms(S.exp))
  if len(exps)==1:
   exponential=exps[0];rate=S.simplify(S.diff(exponential.args[0],t)/S.I);radius_factor=S.simplify(term/exponential)
   turns=S.simplify(rate*(upper-lower)/(2*S.pi))
   if not radius_factor.has(t) and not rate.has(t) and rate.is_real and turns.is_integer and turns!=0 and not center.has(t):
    # Restrict exact theorem use to entire factors and rational poles. Reject branch functions.
    branchy=expression.has(S.log,S.Abs,S.conjugate,S.re,S.im) or any(p.exp.is_integer is not True and p.base.has(z) for p in expression.atoms(S.Pow))
    if not branchy:
     try:
      poles=S.singularities(expression,z,domain=S.S.Complexes)
      if isinstance(poles,S.FiniteSet) or poles is S.S.EmptySet:
       radius=S.Abs(radius_factor*S.exp(exponential.args[0].subs(t,lower)))
       total=S.Integer(0)
       for pole in poles:
        distance=S.simplify(S.Abs(pole-center)-radius)
        if distance==0:raise ValueError('A singularity lies on the contour; the ordinary contour integral is undefined.')
        if distance.is_negative:total+=S.residue(expression,z,pole)
        elif distance.is_positive is not True:raise NotImplementedError()
       c.notes.append('Exact residue theorem on a circular contour; signed winding number '+str(turns)+'. Avoids principal-branch endpoint cancellation.')
       return S.simplify(2*S.pi*S.I*turns*total)
     except (NotImplementedError,TypeError):pass
 import mpmath as mp
 if expression.free_symbols-{z} or path.free_symbols-{t}:raise ValueError('Assign all parameters for numerical contour integration.')
 pullback=expression.subs(z,path)*S.diff(path,t);f=S.lambdify(t,pullback,'mpmath')
 with mp.workdps(max(35,c.precision+10)):
  a=mp.mpf(str(S.N(lower,40)));b=mp.mpf(str(S.N(upper,40)))
  def quadrature(parts):return mp.quad(f,[a+(b-a)*i/parts for i in range(parts+1)])
  first=quadrature(32);second=quadrature(64)
  if not mp.isfinite(second) or abs(first-second)>mp.mpf('1e-12')*max(1,abs(second)):raise ValueError('Contour quadrature did not converge. Check poles on the path and branch conventions.')
  c.contour_numeric=True;c.notes.append('Numerical complex quadrature with 32/64-panel agreement; principal branches. This is not an exact contour theorem.')
  return S.Float(str(second.real),c.precision)+S.I*S.Float(str(second.imag),c.precision)


def checked_integrate(expression,*bounds,context=None,**kwargs):
 """Cross-check finite parameter-free complex integrals against quadrature.
 Symbolic endpoint subtraction can silently lose a branch winding number.
 Agreement is supporting evidence, not a general proof of convergence.
 """
 result=S.integrate(expression,*bounds,**kwargs)
 if len(bounds)!=1 or not isinstance(bounds[0],(tuple,list,S.Tuple)) or len(bounds[0])!=3:return result
 t,a,b=bounds[0];expression=S.sympify(expression);a=S.sympify(a);b=S.sympify(b)
 if not expression.has(S.I) or expression.free_symbols-{t} or not (a.is_real and b.is_real and a.is_finite and b.is_finite):return result
 import mpmath as mp
 try:
  with mp.workdps(50):
   f=S.lambdify(t,expression,'mpmath');lo=mp.mpf(str(S.N(a,50)));hi=mp.mpf(str(S.N(b,50)))
   q1=mp.quad(f,[lo+(hi-lo)*j/16 for j in range(17)])
   q2=mp.quad(f,[lo+(hi-lo)*j/32 for j in range(33)])
   if not mp.isfinite(q2) or abs(q2-q1)>mp.mpf('1e-25')*max(1,abs(q2)):raise ValueError('Inconsistent quadrature')
   symbolic=complex(S.N(result,30))
   if abs(q2-symbolic)>mp.mpf('1e-10')*max(1,abs(q2)):
    if context:context.notes.append('Symbolic branch endpoints contradicted two numerical quadrature passes. Showing an approximation (25-digit panel agreement); use Contour integral for exact circular residue evaluation.')
    real=mp.re(q2);imag=mp.im(q2)
    if abs(real)<mp.mpf('1e-40'):real=mp.mpf(0)
    if abs(imag)<mp.mpf('1e-40'):imag=mp.mpf(0)
    return S.Float(str(real),25)+S.I*S.Float(str(imag),25)
   if context:context.notes.append('Finite complex integral cross-checked with two numerical quadrature passes; numerical agreement is not a proof of convergence.')
 except Exception:
  if context:context.notes.append('Complex definite integral could not be independently verified; retained unevaluated to avoid a false exact answer.')
  return S.Integral(expression,*bounds)
 return result
