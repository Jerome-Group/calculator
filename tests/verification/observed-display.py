# Decode only browser-observed semantic nodes. Unsupported notation fails closed.
def observed_value(node):
 kind=node['type']
 if kind=='math':
  tex=node['latex']
  if tex.startswith(r'\mathtt{\text{') and tex.endswith('}}'):
   text=tex[len(r'\mathtt{\text{'):-2];return S.Integer(text) if re.fullmatch(r'[-+]?\d+',text) else text
  crt=re.fullmatch(r'([a-z])\\equiv (.+)\\pmod\{(.+)\}',tex)
  if crt:return (latex_expression(crt[2]),latex_expression(crt[3]))
  # Math annotations carry actual TeX, not JSON-escaped backslash text.
  if ' = ' in tex and tex.count('=')==1:
   left,right=tex.split('=');return S.Eq(latex_expression(left),latex_expression(right),evaluate=False)
  return latex_expression(tex)
 if kind=='text':return {'T':True,'F':False,'Empty collection':[]}.get(node['text'],node['text'])
 if kind=='list':return [observed_value(v) for v in node['items']]
 if kind=='fields':return {v['label']:observed_value(v['value']) for v in node['items']}
 if kind=='table':
  rows=[[observed_value(v) for v in row] for row in node['rows']]
  if node['headers']==['Value','Condition']:return S.Piecewise(*[(v,True if c=='Otherwise' else c)for v,c in rows])
  return rows
 raise ValueError('unsupported observed display '+str(kind))
def observed_serializable(value):
 if isinstance(value,dict):return {str(k):observed_serializable(v) for k,v in value.items()}
 if isinstance(value,(list,tuple)):return [observed_serializable(v) for v in value]
 if isinstance(value,(S.Integer,S.Float)):return int(value) if isinstance(value,S.Integer) else float(value)
 if isinstance(value,(str,bool,int,float)):return value
 return str(value)
def observed_result(fixture,observed):
 value=observed_value(observed['display']);details=observed_value(observed['detailDisplay']) if observed.get('detailDisplay') else {}
 if isinstance(value,dict):details={**value,**details}
 operation=fixture['request']['operation']
 if isinstance(value,dict) and operation=='matrix_lu':value=[value['L'],value['U'],value['Row swaps (zero-based pairs); apply swaps to A to obtain LU']]
 if isinstance(value,dict) and operation=='matrix_qr':value=[value['Q'],value['R; A = QR']]
 if isinstance(value,dict) and operation=='matrix_svd':value=[value['U'],value['Σ'],value['V; A = UΣVᴴ']]
 if operation=='matrix_eigenvalues' and observed['display']['type']=='table':value={row[0]:row[1] for row in value}
 if operation=='matrix_eigenvectors' and isinstance(value,list):value=[(row['eigenvalue'],row['algebraic multiplicity'],row['eigenspace basis']) for row in value]
 if operation=='matrix_null' and isinstance(value,dict) and value.get('basis')=='Empty basis; only the zero vector solves Av = 0.':value=[]
 if operation=='laplace' and isinstance(value,dict):value=(value['Transform'],value['Convergence half-plane Re(s) >'],value['Additional condition'])
 if operation in ['ivp','bvp'] and observed['display']['type']=='table':
  headers=observed['display']['headers']
  if headers[0]!='t':raise ValueError('unexpected trajectory independent variable')
  details={'t':[row[0] for row in value],'values':[[row[j]for row in value]for j in range(1,len(headers))]}

 if fixture['request']['operation']=='spline' and observed['display']['type']=='table':
  if observed['display']['headers']!=['x','Interpolated y']:raise ValueError('unexpected spline column meaning')
  details={'x':[row[0] for row in value],'y':[row[1] for row in value]}
 if fixture['request']['operation']=='number_theory' and fixture['request']['params']['action']=='Bézout' and isinstance(value,dict):
  params=fixture['request']['params'];value=(value['coefficient of '+params['a']],value['coefficient of '+params['b']],value['greatest common divisor'])
 if any(a['kind']=='solutionSet' for a in fixture['assertions']):
  values=value.get('solutions') if isinstance(value,dict) else value
  if not isinstance(values,list):raise ValueError('observed solution collection missing')
  variables=next(a['variables'] for a in fixture['assertions'] if a['kind']=='solutionSet');solutions=[]
  groups=values if values and isinstance(values[0],list) else [values]
  for group in groups:
   mapping={str(v.lhs):v.rhs for v in group if isinstance(v,S.Equality)}
   if set(mapping)!=set(variables):raise ValueError('incomplete observed solution assignment')
   solutions.append(tuple(mapping[v] for v in variables))
  value=S.FiniteSet(*solutions)
 return {'status':observed['status'],'text':str(value),'details':observed_serializable(details),'display':observed['display'],'notes':observed.get('notes',[])}
