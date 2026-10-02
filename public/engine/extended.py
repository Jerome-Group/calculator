"""Additional bounded local operations and audited workflow equivalents."""
import sympy as S
import numpy as np
from scipy import stats, linalg

def extended(op,c):
 numeric=False
 if op in ['together','radsimp']:r=getattr(S,op)(c.p('expression'))
 elif op=='compose':r=c.p('expression').subs(c.sym(),c.p('inner'),simultaneous=True)
 elif op=='piecewise':r=S.Piecewise(*c.p('cases'))
 elif op=='least_squares':
  a=np.asarray(c.p('matrix'),float);b=np.asarray(c.p('data'),float)
  if a.ndim!=2 or len(b)!=a.shape[0]:raise ValueError('Use one observed value for each design-matrix row.')
  x,residuals,rank,singular=linalg.lstsq(a,b);r={'coefficients':S.Matrix(x),'residual sum of squares':float(np.linalg.norm(a@x-b)**2),'rank':rank,'singular values':singular};numeric=True
  c.notes.append('Minimizes ‖Ax−b‖₂; rank deficiency may make coefficients non-unique. The displayed answer is minimum-norm.')
 elif op=='numeric_svd':
  a=np.asarray(c.p('expression'),float);u,d,vh=linalg.svd(a,full_matrices=False);r={'U':S.Matrix(u),'Σ':S.diag(*map(float,d)),'Vᴴ':S.Matrix(vh),'reconstruction error':float(np.linalg.norm(u@np.diag(d)@vh-a))};numeric=True
 elif op=='ode_system':r=S.dsolve(c.p('equations'),c.p('functions'))
 elif op in ['divisor_count','mobius']:
  n=c.integer('n',lo=1);r=getattr(S,op)(n)
 elif op=='metric':
  g=S.Matrix(c.p('metric'));vs=c.p('variables');n=len(vs)
  if n>3 or g.shape!=(n,n) or g!=g.T:raise ValueError('Use a symmetric 1–3 dimensional metric matching the coordinates.')
  det=S.simplify(g.det())
  if det==0:raise ValueError('The metric is degenerate (det g = 0).')
  inverse=g.inv();G=[[[S.simplify(sum(inverse[k,l]*(S.diff(g[l,j],vs[i])+S.diff(g[l,i],vs[j])-S.diff(g[i,j],vs[l])) for l in range(n))/2) for j in range(n)] for i in range(n)] for k in range(n)]
  ricci=S.Matrix(n,n,lambda i,j:S.simplify(sum(S.diff(G[k][i][j],vs[k])-S.diff(G[k][i][k],vs[j])+sum(G[k][k][l]*G[l][i][j]-G[k][j][l]*G[l][i][k] for l in range(n)) for k in range(n))))
  scalar=S.simplify(sum(inverse[i,j]*ricci[i,j] for i in range(n) for j in range(n)))
  r={'metric g':g,'determinant':det,'Christoffel symbols Γᵏᵢⱼ':{str(k+1):S.Matrix(G[k]) for k in range(n)},'Ricci tensor':ricci,'scalar curvature R':scalar}
  if n==2:r['Gaussian curvature K = R/2']=scalar/2
  c.notes.append('Levi-Civita connection. Convention gives scalar curvature +2 on a unit sphere. Valid only where det(g) ≠ 0.')
 elif op=='uncertainty':
  expr=c.p('expression');vs=c.p('variables');means=c.p('values');errors=c.p('errors')
  if len(vs)!=len(means) or len(vs)!=len(errors) or any(float(x)<0 for x in errors):raise ValueError('Give one value and nonnegative standard uncertainty per variable.')
  substitutions=dict(zip(vs,means));gradient=S.Matrix([S.diff(expr,v).subs(substitutions) for v in vs]);variance=S.simplify(sum((d*e)**2 for d,e in zip(gradient,errors)))
  r={'value':expr.subs(substitutions),'standard uncertainty (first order)':S.sqrt(variance),'variance (first order)':variance,'sensitivity coefficients':gradient};c.notes.append('First-order propagation for independent inputs; standard uncertainties, not variances. Correlations and higher-order effects are excluded.')
 elif op=='critical_points':
  e=c.p('expression');x=c.sym();a,b=c.p('lower'),c.p('upper');roots=S.solveset(S.diff(e,x),x,domain=S.Interval(a,b));r={'stationary points':[]}
  if not isinstance(roots,S.FiniteSet):r={'stationary set':roots};c.notes.append('The stationary set could not be enumerated; no classification is certified.')
  else:
   for v in roots:
    d=S.simplify(S.diff(e,x,2).subs(x,v));r['stationary points'].append({'x':v,'y':e.subs(x,v),'classification':'local minimum' if d.is_positive else 'local maximum' if d.is_negative else 'second derivative inconclusive'})
  r['interval endpoints']=[{'x':v,'y':e.subs(x,v)} for v in [a,b]];c.notes.append('Check nondifferentiable points and discontinuities separately. Endpoints are candidates for constrained extrema.')
 elif op in ['histogram','boxplot']:
  data=c.arr('data');
  if data.ndim!=1 or not len(data) or not np.isfinite(data).all():raise ValueError('Enter a nonempty finite list of observations.')
  if op=='histogram':
   counts,edges=np.histogram(data,bins=c.integer('bins','5',1,100));r={'bin lower bounds':edges[:-1],'bin upper bounds':edges[1:],'counts':counts};c.notes.append('Bins are left-closed/right-open, except the final bin includes its upper endpoint.')
  else:
   q1,median,q3=np.quantile(data,[.25,.5,.75]);iqr=q3-q1;inside=data[(data>=q1-1.5*iqr)&(data<=q3+1.5*iqr)]
   r={'minimum':float(data.min()),'lower whisker':float(inside.min()),'Q1':q1,'median':median,'Q3':q3,'upper whisker':float(inside.max()),'maximum':float(data.max()),'outliers':data[(data<q1-1.5*iqr)|(data>q3+1.5*iqr)]};c.notes.append('Linearly interpolated quartiles; Tukey whiskers at the farthest observations within 1.5 IQR.')
  numeric=True
 elif op=='correlation':
  x,y=c.arr('x'),c.arr('y')
  if len(x)!=len(y) or len(x)<3:raise ValueError('Use matching samples with at least three pairs.')
  if np.std(x)==0 or np.std(y)==0:raise ValueError('Correlation is undefined for a constant sample.')
  result=stats.pearsonr(x,y);r={'Pearson r':result.statistic,'two-sided p-value':result.pvalue,'sample size':len(x)};numeric=True;c.notes.append('Tests zero population correlation; independent paired observations and bivariate normality are assumed for this p-value.')
 elif op=='finite_expectation':
  values=c.p('values');probabilities=c.p('probabilities')
  if len(values)!=len(probabilities) or not values or any(p.is_nonnegative is not True for p in probabilities):raise ValueError('Use one nonnegative probability per outcome.')
  if S.simplify(sum(probabilities)-1)!=0:raise ValueError('Probabilities must sum exactly to 1; fractions such as 1/6 are supported.')
  mean=S.simplify(sum(v*p for v,p in zip(values,probabilities)));r={'expected value':mean,'variance':S.simplify(sum((v-mean)**2*p for v,p in zip(values,probabilities)))}
 elif op=='symbolic_expectation':
  from sympy.stats import Normal,Exponential,Poisson,E,variance
  name=c.raw('distribution','normal');pars=c.p('parameters');x=c.sym('variable','X')
  if name=='normal':rv=Normal(str(x),*pars)
  elif name=='exponential':rv=Exponential(str(x),*pars)
  else:rv=Poisson(str(x),*pars)
  e=c.p('expression').subs(x,rv);r={'expected value':E(e),'variance':variance(e)};c.notes.append('Symbolic probability with exact parameters; required positivity assumptions are retained by the distribution.')
 else:return None
 return r,numeric
