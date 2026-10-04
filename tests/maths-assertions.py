import json,math,re,sympy as S

def sym(value):
 if not isinstance(value,str):return value
 local={k:S.Symbol(k) for k in ['x','y','z','t','s','n','r','u','v','a','k','theta','phi','C','C1','C2']}
 local.update({k:S.Function(k) for k in ['f','g','F']});local['y']=S.Function('y') if 'y(x)' in value else S.Symbol('y');local['u']=S.Function('u') if re.search(r'u\(x,\s*y\)',value) else S.Symbol('u')
 return S.sympify(value,locals=local)
def eq(actual,expected,tol=0):
 a,b=sym(actual),sym(expected)
 if isinstance(a,(bool,S.logic.boolalg.BooleanAtom)) or isinstance(b,(bool,S.logic.boolalg.BooleanAtom)):assert bool(a)==bool(b),(a,b)
 elif isinstance(a,dict) and isinstance(b,dict):
  assert len(a)==len(b)
  for k,v in a.items():
   matches=[w for key,w in b.items() if sym(k)==sym(key)];assert len(matches)==1;eq(v,matches[0],tol)
 elif isinstance(a,(list,tuple)) or isinstance(b,(list,tuple)):
  assert len(a)==len(b),(a,b)
  for v,w in zip(a,b):eq(v,w,tol)
 elif isinstance(a,(set,S.Set)) or isinstance(b,(set,S.Set)):
  if isinstance(a,set):a=S.FiniteSet(*a)
  if isinstance(b,set):b=S.FiniteSet(*b)
  assert a==b,(a,b)
 elif isinstance(a,S.MatrixBase) or isinstance(b,S.MatrixBase):
  assert isinstance(a,S.MatrixBase) and isinstance(b,S.MatrixBase) and a.shape==b.shape,(a,b)
  for v,w in zip(a,b):eq(v,w,tol)
 elif isinstance(a,(S.core.relational.Relational,S.logic.boolalg.BooleanFunction)) or isinstance(b,(S.core.relational.Relational,S.logic.boolalg.BooleanFunction)):assert a==b,(a,b)
 else:
  diff=S.simplify(a-b)
  if diff!=0:assert tol and not diff.free_symbols and math.isfinite(float(diff)) and abs(float(diff))<=tol,(a,b,diff)
def near(a,b,tol):assert math.isfinite(float(a)) and abs(float(a)-float(b))<=tol,(a,b,tol)
def match(a,e):
 if isinstance(e,dict):
  if '$length' in e:assert len(a)==e['$length'],(len(a),e['$length'])
  elif '$mathSet' in e:
   assert len(a)==len(e['$mathSet']);assert all(any(S.simplify(sym(v)-sym(w))==0 for v in a) for w in e['$mathSet'])
  elif '$math' in e:eq(a,e['$math'])
  elif '$near' in e:near(a,e['$near'],e['atol'])
  elif '$nearArray' in e:
   assert len(a)==len(e['$nearArray'])
   for v,w in zip(a,e['$nearArray']):near(v,w,e['atol'])
  elif '$between' in e:assert math.isfinite(float(a)) and e['$between'][0]<=float(a)<=e['$between'][1],a
  elif '$mathList' in e:eq(a,e['$mathList'])
  elif '$mathNear' in e:
   av,bv=sym(a),sym(e['$mathNear'])
   if 'samples' in e:
    for var,vals in e['samples'].items():
     for val in vals:eq(av.subs(S.Symbol(var),val),bv.subs(S.Symbol(var),val),e['atol'])
   else:eq(av,bv,e['atol'])
  else:
   assert isinstance(a,dict),a
   for key,want in e.items():assert key in a,('missing key',key);match(a[key],want)
 elif isinstance(e,bool):assert a==e or a==str(e),(a,e)
 elif isinstance(e,list):
  assert isinstance(a,list) and len(a)==len(e),(a,e)
  for v,w in zip(a,e):match(v,w)
 else:assert a==e or str(a)==str(e),(a,e)
def at(result,path):
 for k in path:result=result[k]
 return result

def assert_fixture(f,result):
 assert result['status']==f['expectedStatus'],('status',result['status'],f['expectedStatus'],result.get('text'))
 if f['expectedStatus']!='error':assert result.get('display') and result['display'].get('type'), 'semantic display missing'
 for a in f['assertions']:
  kind=a['kind'];d=result.get('details') or {};value=result['text'];parsed=None
  if kind=='textContains':assert a['expected'].lower() in result['text'].lower(),result['text']
  elif kind=='mathEqual':eq(at(result,a['path']),a['expected'])
  elif kind=='partialObject':match(at(result,a['path']),a['expected'])
  elif kind=='noteContains':assert any(a['expected'] in n for n in result['notes']),result['notes']
  elif kind=='noteOrDetailContains':assert a['expected'] in json.dumps({'notes':result['notes'],'details':d})
  elif kind=='displayContains':assert a['expected'] in json.dumps(result['display'])
  elif kind=='tupleFirst':near(sym(value)[0],a['expected'],a['atol'])
  elif kind=='nearScalar':near(float(sym(value)),a['expected'],a['atol'])
  elif kind=='seriesCoefficients':
   v=sym(value);x=S.Symbol(a['variable']);poly=v.removeO()
   for i,c in enumerate(a['coefficients']):eq(poly.coeff(x,i),c)
   assert v.getO()==S.Order(x**a['order'],x)
  elif kind=='solutionSet':eq(value,'FiniteSet('+','.join('('+','.join(sol)+')' for sol in a['expected'])+')')
  elif kind=='matrixBasis':
   basis=sym(value);A=S.Matrix(a['matrix']);B=S.Matrix.vstack(*basis) if a['span']=='row' else S.Matrix.hstack(*basis)
   assert len(basis)==a['dimension'] and B.rank()==a['dimension'];assert (S.Matrix.vstack(A,B) if a['span']=='row' else S.Matrix.hstack(A,B)).rank()==A.rank()
  elif kind=='eigenvalueMultiset':
   values=sym(value);assert len(values)==len(a['expected'])
   for want in a['expected']:assert any(S.simplify(sym(k)-sym(want['value']))==0 and v==want['multiplicity'] for k,v in values.items())
  elif kind=='eigenspaceResidual':
   eigen=sym(value);A=S.Matrix(a['matrix']);assert len(eigen)==len(a['expectedEigenvalues'])
   for lam,multiplicity,basis in eigen:
    assert multiplicity==1 and len(basis)==1 and basis[0]!=S.zeros(A.rows,1);eq(A*basis[0],lam*basis[0]);assert any(S.simplify(lam-sym(w))==0 for w in a['expectedEigenvalues'])
  elif kind in ['luResidual','qrResidual','svdResidual']:
   parts=sym(value);A=S.Matrix(a['matrix'])
   if kind=='luResidual':L,U,swaps=parts;P=A.copy();[P.row_swap(i,j) for i,j in swaps];eq(L*U,P);assert L.is_lower and U.is_upper and list(L.diagonal())==[1]*L.rows
   elif kind=='qrResidual':Q,R=parts;eq(Q*R,A);eq(Q.T*Q,S.eye(Q.cols));assert R.is_upper
   else:U,D,V=parts;eq(U*D*V.H,A);eq(U.H*U,S.eye(U.cols));eq(V.H*V,S.eye(V.cols));assert all(v.is_positive is True for v in D.diagonal())
  elif kind=='odeResidual':
   sols=sym(value);sols=sols if isinstance(sols,list) else [sols];mapping={q.lhs:q.rhs for q in sols}
   for equation in a['equations']:eq(sym(equation).subs(mapping).doit(),0)
   if 'expected' in a:eq(sols[0].rhs,a['expected'])
   if 'freeConstants' in a:
    constants=set().union(*(q.rhs.free_symbols for q in sols))-{S.Symbol(v) for v in a['variables']};assert len(constants)==a['freeConstants'];basis=S.Matrix([q.rhs for q in sols]).jacobian(sorted(constants,key=str));assert S.simplify(basis.det())!=0
  elif kind=='pdeResidual':
   sol=sym(value);eq(sym(a['equation']).subs(sol.lhs,sol.rhs).doit(),0);functions=sol.rhs.atoms(S.core.function.AppliedUndef);assert len(functions)==a['arbitraryFunctions'];arg=next(iter(functions)).args[0];x,y=S.symbols('x y');assert arg.free_symbols=={x,y} and S.diff(arg,x)!=0 and S.diff(arg,y)!=0
  elif kind=='trajectory':
   ts=at(result,a['timePath']);ys=at(result,a['valuePath']);assert len(ts)==a['samples'] and len(ys)==len(a['expected']);near(ts[0],a['expectedTime'][0],1e-12);near(ts[-1],a['expectedTime'][1],1e-12)
   for fn,values in zip(a['expected'],ys):
    assert len(values)==len(ts)
    for t,y in zip(ts,values):near(y,float(sym(fn).subs(S.Symbol('t'),t)),a['atol'])
  elif kind=='linearization':
   eq(d['Jacobian'],S.Matrix(a['jacobian']));eq(d['field at point'],S.Matrix(a['field']));actual=[sym(k) for k in d['eigenvalues']];assert len(actual)==len(a['eigenvalues']);assert all(any(S.simplify(v-sym(w))==0 for v in actual) for w in a['eigenvalues'])
  elif kind=='poissonSineMode':
   q=d['grid coordinates'];u=d['interior solution'];h=1/(a['grid']+1);scale=math.pi**2*h*h/(4*math.sin(math.pi*h/2)**2);assert len(q)==a['grid'] and len(u)==a['grid']
   for row,y in zip(u,q):
    assert len(row)==len(q)
    for val,x in zip(row,q):near(val,scale*math.sin(math.pi*x)*math.sin(math.pi*y),a['atol'])
   near(d['residual infinity norm'],0,a['maxResidual'])
  elif kind=='transformTuple':v=sym(value);eq(v[0],a['transform']);eq(v[1],a['abscissa']);assert bool(v[2])==a['condition']
  elif kind=='recurrenceSequence':
   v=sym(value);n=S.Symbol(a['variable'])
   for i,c in enumerate(a['samples']):eq(v.subs(n,i),c)
   eq(v.subs(n,n+2)-v.subs(n,n+1)-v,0)
  elif kind=='piecewiseAnalytic':
   v=sym(value);assert isinstance(v,S.Piecewise);eq(v.args[0].expr,a['expression']);assert str(v.args[0].cond)=='Abs(z) < 1'
  elif kind=='truthTable':
   rows=result['display']['items'][1]['value']['rows'];assert len(rows)==len(a['rows'])
   actual=[[cell['text']=='T' for cell in row] for row in rows];assert actual==a['rows']
  elif kind=='integerParametricFamily':
   solutions=sym(value);assert len(solutions)==1;coords=next(iter(solutions));assert len(coords)==2;eq(2*coords[0]+3*coords[1],7);parameters=set().union(*(v.free_symbols for v in coords));assert len(parameters)==1;p=next(iter(parameters));assert abs(S.diff(coords[0],p))==3 and abs(S.diff(coords[1],p))==2
  elif kind=='pointSet':v=sym(value);assert set(tuple(p) for p in v)==set(tuple(p) for p in a['expected'])
  elif kind=='numericSolutionSet':match(d['point'],{'$nearArray':a['expected'][0],'atol':a['atol']});assert d['success'];match(d['residual'],{'$nearArray':[0,0],'atol':a['atol']})
  elif kind=='unitRatio':
   from sympy.physics import units
   locals={k:getattr(units,k) for k in ['kilometer','hour']};v=S.sympify(value,locals=locals);target=S.sympify(a['target'],locals=locals);eq(v/target,a['expected'])
  elif kind=='criticalPoints':
   rows=d['stationary points'];assert len(rows)==len(a['expected'])
   for actual,want in zip(rows,a['expected']):eq(actual['x'],want['x']);eq(actual['y'],want['y']);assert actual['classification']==want['classification']
   for actual,want in zip(d['interval endpoints'],a['endpoints']):eq(actual['x'],want['x']);eq(actual['y'],want['y'])
  else:raise ValueError('unknown assertion '+kind)

