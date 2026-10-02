"""Typed, semantic mathematical output. Original engine values remain reusable."""
import sympy as S
import numpy as np

def node(value):
 if value is None:return {'type':'text','text':'Not defined'}
 if value is True or value is S.true:return {'type':'text','text':'T'}
 if value is False or value is S.false:return {'type':'text','text':'F'}
 if isinstance(value,np.ndarray):return node(value.tolist())
 if isinstance(value,dict):return {'type':'fields','items':[{'label':str(k),'value':node(v)} for k,v in value.items()]}
 if isinstance(value,(list,tuple,set)):
  if not value:return {'type':'text','text':'Empty collection'}
  return {'type':'list','items':[node(v) for v in value]}
 if isinstance(value,str):
  return {'type':'text','text':value}
 try:return {'type':'math','latex':S.latex(value),'text':str(value)}
 except Exception:return {'type':'text','text':str(value)}

def table(headers,rows):return {'type':'table','headers':headers,'rows':[[node(v) for v in row] for row in rows]}

def present(op,r,c,details):
 if op in ('system','numeric_system','matrix_solve') and isinstance(r,S.FiniteSet):
  variables=c.p('variables','[x,y]') if op!='matrix_solve' else [S.Symbol('x_'+str(i+1)) for i in range(len(next(iter(r),[])))]
  if not r:return node('No solution satisfies this system.')
  rows=[[S.Eq(v,x,evaluate=False) for v,x in zip(variables,solution)] for solution in r]
  free=set().union(*(x.free_symbols for solution in r for x in solution))
  return node({'solutions':rows,**({'free parameters':sorted(free,key=str)} if free else {})})
 if r is S.S.EmptySet:return node('No solutions in the selected domain.')
 if op=='crt' and r:return node(S.Eq(S.Mod(S.Symbol('x')-r[0],r[1]),0,evaluate=False))|{'latex':r'x\equiv '+S.latex(r[0])+r'\pmod{'+S.latex(r[1])+'}'}
 if op=='number_theory' and c.raw('action')=='Bézout':
  a,b=c.p('a'),c.p('b');u,v,g=r
  return node({'Bézout identity':S.Eq(S.Add(S.Mul(a,u,evaluate=False),S.Mul(b,v,evaluate=False),evaluate=False),g,evaluate=False),'coefficient of '+str(a):u,'coefficient of '+str(b):v,'greatest common divisor':g})
 if op=='matrix_null':return node({'null space':S.FiniteSet(S.Integer(0)) if not r else 'All linear combinations of the basis vectors below.','basis':r or 'Empty basis; only the zero vector solves Av = 0.'})
 if op=='matrix_eigenvalues':return table(['Eigenvalue λ','Algebraic multiplicity'],list(r.items()))
 if op=='matrix_eigenvectors':return node([{'eigenvalue':v,'algebraic multiplicity':m,'eigenspace basis':b} for v,m,b in r])
 if op in ('matrix_lu','matrix_qr','matrix_svd'):
  labels={'matrix_lu':['L','U','Row swaps (zero-based pairs); apply swaps to A to obtain LU'],'matrix_qr':['Q','R; A = QR'],'matrix_svd':['U','Σ','V; A = UΣVᴴ']}[op]
  return node(dict(zip(labels,r)))
 if op=='logic':return {'type':'fields','items':[{'label':'Simplified proposition','value':node(r['simplified'])},{'label':'Truth table','value':table([str(v) for v in r['variables']]+['Proposition'],[[bool(v) for v in inputs]+[result] for inputs,result in r['truth table']])},{'label':'A satisfying assignment','value':node(r['satisfying assignment'])}]}
 if op=='spline':return table(['x','Interpolated y'],zip(np.atleast_1d(r['x']),np.atleast_1d(r['y'])))
 if op=='graph_analysis' and c.raw('action')=='critical points' and details:
  return table(['x','y','Classification'],[(v['x'],v['y'],v.get('classification','Undetermined')) for v in details.get('candidates',[])])
 if op=='laplace' and isinstance(r,tuple):return node(dict(zip(['Transform','Convergence half-plane Re(s) >','Additional condition'],r)))
 if isinstance(r,S.Piecewise):return table(['Value','Condition'],[(v,'Otherwise' if condition is S.true else condition) for v,condition in r.args])
 if op in ('ivp','bvp') and isinstance(r,dict):return table(['t']+['State '+str(i+1) for i in range(len(r['values']))],zip(r['t'],*r['values']))
 return node(r)
