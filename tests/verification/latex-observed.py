import re,sympy as S
from sympy.parsing.sympy_parser import parse_expr,standard_transformations,implicit_multiplication_application

def latex_expression(source):
 source=source.strip()
 source=re.sub(r'([A-Za-z]+)_\{(\d+)\}',lambda m:m[1]+('' if m[1]=='C' else '_')+m[2],source)
 if r'\wedge' in source:return S.And(*(latex_expression(v) for v in source.split(r'\wedge')))
 if r'\vee' in source:return S.Or(*(latex_expression(v) for v in source.split(r'\vee')))
 if source.startswith(r'\neg '):return S.Not(latex_expression(source[5:]))
 if r'\cup' in source:return S.Union(*(latex_expression(v) for v in source.split(r'\cup')))
 if source.startswith(r'\left') and (r'\infty' in source or source.startswith(r'\left[') and source.endswith(r'\right)') or source.startswith(r'\left(') and source.endswith(r'\right]')):
  clean=source.replace(r'\left','').replace(r'\right','').replace(r'\infty','oo');args=clean[1:-1].split(',')
  if len(args)==2:return S.Interval(latex_expression(args[0]),latex_expression(args[1]),left_open=clean[0]=='(',right_open=clean[-1]==')')
 if source.startswith(r'\sum_{'):
  m=re.fullmatch(r'\\sum_\{([a-z])=([^}]+)\}\^\{([^}]+)\} (.*)',source)
  if not m:raise ValueError('unsupported summation notation')
  return S.Sum(latex_expression(m[4]),(S.Symbol(m[1]),latex_expression(m[2]),S.oo if m[3]==r'\infty' else latex_expression(m[3])))

 if source.startswith(r'\left\{') and source.endswith(r'\right\}'):
  pieces=source.split(r'\times')
  if len(pieces)>1:return S.ProductSet(*(latex_expression(p) for p in pieces))
  inner=source[len(r'\left\{'):-len(r'\right\}')]
  parts=[];start=0;depth=0
  for i,char in enumerate(inner):
   if char in '({[':depth+=1
   elif char in ')}]':depth-=1
   elif char==',' and depth==0:parts.append(inner[start:i]);start=i+1
  parts.append(inner[start:])
  return S.FiniteSet(*(latex_expression(p) for p in parts))
 if r'\begin{matrix}' in source:
  inner=source.split(r'\begin{matrix}',1)[1].split(r'\end{matrix}',1)[0]
  return S.Matrix([[latex_expression(c) for c in row.split('&')] for row in inner.split(r'\\')])

 source=source.replace(r'\left','').replace(r'\right','');source=re.sub(r'\\\s+', ' ',source)
 def translate(text):
  # Deliberately limited independent parser for generated TeX arithmetic, not
  # the application's parser. TeX's explicit fraction groups preserve binding.
  text=text.replace(r'\left','').replace(r'\right','')
  def g(i):
   while i<len(text) and text[i].isspace():i+=1
   if text[i]!='{':raise ValueError('expected group at '+text[i:])
   level=1;j=i+1
   while level:
    if text[j]=='{':level+=1
    elif text[j]=='}':level-=1
    j+=1
   return translate(text[i+1:j-1]),j
  out='';i=0
  while i<len(text):
   if text[i]=='\\':
    m=re.match(r'\\([A-Za-z]+)',text[i:]);assert m,text[i:];name=m[1];i+=len(m[0])
    if name=='frac':a,i=g(i);b,i=g(i);out+='(('+a+')/('+b+'))'
    elif name=='sqrt':a,i=g(i);out+='sqrt('+a+')'
    elif name in ['sin','cos','tan','exp','log']:
     power=None
     if i<len(text) and text[i]=='^':power,i=g(i+1)
     while i<len(text) and text[i].isspace():i+=1
     if i<len(text) and text[i]=='{':a,i=g(i)
     elif i<len(text) and text[i]=='(':
      depth=1;j=i+1
      while depth:
       if text[j]=='(':depth+=1
       elif text[j]==')':depth-=1
       j+=1
      a=translate(text[i+1:j-1]);i=j
     else:raise ValueError('missing function argument '+text[i:])
     out+=name+'('+a+')'+('**('+power+')' if power else '')
    elif name=='text':
     label,i=g(i)
     if label not in ['km','hour']:raise ValueError('unsupported unit text '+label)
     out+='kilometer' if label=='km' else 'hour'
    elif name=='operatorname':
     label,i=g(i)
     if label not in ['Point2D','Point3D','erf']:raise ValueError('unsupported operator '+label)
     out+=label
    elif name=='cdot':out+='*'
    elif name=='theta' and text[i:].lstrip().startswith('('):out+='Heaviside'
    elif name in ['theta','phi','pi']:out+=name
    else:raise ValueError('unsupported TeX command '+name)
   elif text[i]=='{':a,i=g(i);out+='('+a+')'
   elif text[i]=='^':
    if text[i+1]=='{':a,i=g(i+1);out+='**('+a+')'
    else:out+='**';i+=1
   elif text[i]=='|':
    j=text.find('|',i+1);assert j>=0;out+='Abs('+translate(text[i+1:j])+')';i=j+1
   else:out+=text[i];i+=1
  return out
 transformed=translate(source)
 transformed=re.sub(r"([A-Za-z])\(\(([^()]+)\)\)",r"\1(\2)",transformed)
 local={k:S.Symbol(k) for k in ['u','v','t','theta','phi','x','y','z','C1','C2','t0','x1','x2','x_1','x_2','t_0']};local.update({'sqrt':S.sqrt,'sin':S.sin,'cos':S.cos,'tan':S.tan,'exp':S.exp,'log':S.log,'e':S.E,'i':S.I,'O':S.Order,'erf':S.erf,'Abs':S.Abs,'pi':S.pi})
 from sympy.physics.units import kilometer,hour
 local.update({'kilometer':kilometer,'hour':hour,'oo':S.oo})
 for name in re.findall(r"([A-Za-z])\s*\{(?:\\left)?\(",source):local[name]=S.Function(name)
 return parse_expr(transformed,local_dict=local,transformations=standard_transformations+(implicit_multiplication_application,))
