"""Bounded, strict LaTeX ingestion for SymPy 1.13.3 + Lark 1.2.2.

Keeps the original source and unevaluated arithmetic. Matrix/cases environments
are parsed structurally and their scalar entries use SymPy's mature LaTeX parser.
Unknown notation is rejected; this is not a general TeX interpreter.
"""
from dataclasses import dataclass, field
import re
import sympy as sp
from sympy.core.function import AppliedUndef
from sympy.core.parameters import evaluate
from sympy.parsing.latex.lark import LarkLaTeXParser
from sympy.parsing.latex.lark.transformer import TransformToSymPyExpr
from lark import Tree

class LatexInputError(ValueError):
    pass

def substitute_bound_guard_path(guard_path,depth,substitutions):
    return guard_path[:depth]+tuple(guard.subs(substitutions,simultaneous=True) for guard in guard_path[depth:])

class AmbiguousLatex(LatexInputError):
    def __init__(self, alternatives):
        self.alternatives = [str(a) for a in alternatives]
        super().__init__('Ambiguous notation: ' + ' or '.join(self.alternatives) + '. Define the function or insert an explicit multiplication sign.')

@dataclass
class ParsedLatex:
    original: str
    expression: object
    excluded_denominators: list = field(default_factory=list)
    notes: list = field(default_factory=list)

_PARSER = LarkLaTeXParser(transform=False)

_ENV = re.compile(r'\\(begin|end)\{([A-Za-z*]+)\}')
_MATRIX_NAMES = {'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix'}

def _environment_spans(text):
    stack=[]; found=[]
    for token in _ENV.finditer(text):
        kind,name=token.groups()
        if kind=='begin': stack.append((name,token.start(),token.end()))
        elif not stack or stack[-1][0]!=name: raise LatexInputError('Mismatched LaTeX environments.')
        else:
            _,start,body_start=stack.pop()
            if not stack: found.append((start,token.end(),name,text[body_start:token.start()]))
    if stack: raise LatexInputError('Unclosed LaTeX environment.')
    return found

def _split_top(text, separator):
    parts=[]; start=0; brace=0; env=0; i=0
    while i<len(text):
        m=_ENV.match(text,i)
        if m:
            env += 1 if m.group(1)=='begin' else -1
            i=m.end();continue
        ch=text[i]
        if ch=='{' and (i==0 or text[i-1]!='\\'):brace+=1
        elif ch=='}' and (i==0 or text[i-1]!='\\'):brace-=1
        if brace<0:raise LatexInputError('Mismatched braces.')
        if brace==0 and env==0 and text.startswith(separator,i):
            parts.append(text[start:i]); i+=len(separator);start=i;continue
        i+=1
    if brace or env:raise LatexInputError('Mismatched braces or environments.')
    parts.append(text[start:]);return parts

def normalize_compact_arguments(source, max_depth=64):
    """Add TeX-equivalent braces around one-token mathematical arguments.

    This preserves TeX token boundaries: sqrt17 means sqrt(1)*7 and x^23
    means x^2*3. It handles scripts, nested radicals and fixed-arity fraction/style
    macros. It does not infer the meaning of incomplete mathematical notation.
    """
    if len(source)>8000:
        raise LatexInputError('The LaTeX input exceeds the 8,000-character limit.')
    def root_at(text,i):
        return text.startswith(r'\sqrt',i) and (i+5==len(text) or not text[i+5].isalpha())
    def skip_space(text,i):
        while i<len(text) and text[i].isspace():i+=1
        return i
    function_names=('sin','cos','tan','csc','sec','cot','sinh','cosh','tanh','arcsin','arccos','arctan','ln','log','exp')
    integral_names=('int','iint','iiint','oint')
    def differential_at(text,i):
        # MathLive can merge the differential and its variable into one upright group.
        merged=re.match(r'\\mathrm\s*\{\s*d\s*([A-Za-z]|\\[A-Za-z]+)\s*\}',text[i:])
        if merged:return i+merged.end(),r'\mathrm{d}'+merged.group(1)
        separate=re.match(r'(\\mathrm\s*\{\s*d\s*\}|d)\s*([A-Za-z]|\\[A-Za-z]+)',text[i:])
        if separate:
            value=r'\mathrm{d}'+separate.group(2) if separate.group(1).startswith('\\') else separate.group(0)
            return i+separate.end(),value
        return None
    def operand_at(text,i,pending_integrals):
        i=skip_space(text,i)
        # Only an integral still awaiting its differential owns this token.
        if pending_integrals and differential_at(text,i):return False
        if i<len(text) and (text[i].isalnum() or text[i] in ('(','{')):return True
        command=re.match(r'\\([A-Za-z]+)',text[i:])
        return bool(command and command.group(1) in ('pi','alpha','beta','gamma','delta','epsilon','theta','lambda','mu','nu','xi','rho','sigma','tau','phi','chi','psi','omega','sqrt','frac','dfrac','tfrac','left','mathrm','mathit','operatorname','textcolor','colorbox','boxed','bbox')+function_names)
    def adjacent_factor(text,i,pending_integrals):
        if not operand_at(text,i,pending_integrals):return '',i
        j=skip_space(text,i)
        # Lark tokenizes adjacent dy as a differential even outside an integral.
        # Preserve ordinary-symbol multiplication once that integral is complete.
        if not pending_integrals and text[j]=='d' and differential_at(text,j):
            return r'\cdot d\cdot ',j+1
        return r'\cdot ',i
    def group(text,i,opening,closing):
        depth=1;j=i+1
        while j<len(text):
            if text[j]=='\\':
                match=re.match(r'\\(?:[A-Za-z]+|.)',text[j:])
                j+=len(match.group(0)) if match else 1
                continue
            if text[j]==opening:depth+=1
            elif text[j]==closing:
                depth-=1
                if depth==0:return text[i+1:j],j+1
            j+=1
        raise LatexInputError('A mathematical argument contains an unclosed '+opening+' group.')
    def braced(value):
        return value if value.startswith('{') and value.endswith('}') else '{'+value+'}'
    def atom(text,i,depth):
        if depth>max_depth:raise LatexInputError('Mathematical arguments are limited to 64 nested structures.')
        i=skip_space(text,i)
        if i>=len(text):raise LatexInputError('A mathematical argument is missing.')
        if text[i]=='{':
            body,end=group(text,i,'{','}')
            if not body.strip():raise LatexInputError('A mathematical argument is missing.')
            return '{'+scan(body,depth+1)+'}',end
        if root_at(text,i):return radical(text,i,depth+1)
        if text[i]=='\\':
            match=re.match(r'\\([A-Za-z]+|.)',text[i:])
            if not match:raise LatexInputError('Incomplete control sequence in a mathematical argument.')
            name=match.group(1);value=match.group(0);end=i+len(value)
            arity=2 if name in ('frac','dfrac','tfrac','binom','dbinom','tbinom','textcolor','colorbox') else 1 if name in ('mathrm','mathit','mathbf','mathsf','mathtt','operatorname','boxed') else 0
            for _ in range(arity):
                argument,end=atom(text,end,depth+1);value+=braced(argument)
            return value,end
        if text[i].isalnum():return text[i],i+1
        raise LatexInputError('Put the mathematical argument inside braces, for example x^{-1} or \\sqrt{x+1}.')
    def radical(text,i,depth):
        if depth>max_depth:raise LatexInputError('Mathematical arguments are limited to 64 nested structures.')
        end=skip_space(text,i+5);index=''
        if end<len(text) and text[end]=='[':
            body,end=group(text,end,'[',']');index='['+scan(body,depth+1)+']'
        radicand,end=atom(text,end,depth+1)
        return r'\sqrt'+index+braced(radicand),end
    def scan(text,depth):
        if depth>max_depth:raise LatexInputError('Mathematical arguments are limited to 64 nested structures.')
        result=[];i=0;pending_integrals=0
        while i<len(text):
            differential=differential_at(text,i) if pending_integrals else None
            if differential:
                i,value=differential;result.append(value);pending_integrals-=1
                continue
            if root_at(text,i):
                value,i=radical(text,i,depth+1);result.append(value)
                # The base grammar omits adjacency after a radical; retain TeX
                # multiplication when the next token visibly starts an operand.
                factor,i=adjacent_factor(text,i,pending_integrals);result.append(factor)

            elif text[i] in ('^','_'):
                script=text[i];argument,i=atom(text,i+1,depth+1)
                result.append(script+braced(argument))
                # Lark requires explicit multiplication after a scripted operand.
                factor,i=adjacent_factor(text,i,pending_integrals);result.append(factor)
            elif text[i]=='{':
                body,i=group(text,i,'{','}')
                result.append('{'+scan(body,depth+1)+'}')
            elif text[i]=='\\':
                match=re.match(r'\\([A-Za-z]+|.)',text[i:])
                name=match.group(1) if match else ''
                if name in integral_names:pending_integrals+=1
                if name in ('frac','dfrac','tfrac','binom','dbinom','tbinom'):
                    value,i=atom(text,i,depth+1);result.append(value)
                else:
                    value=match.group(0) if match else text[i];i+=len(value)
                    styled_function=False
                    j=skip_space(text,i)
                    if name=='operatorname' and j<len(text) and text[j]=='{':
                        body,end=group(text,j,'{','}')
                        if body in function_names:
                            value+='{'+body+'}';i=end;styled_function=True
                    # These scripts are operator limits or function powers. Their
                    # following expression is an argument, not a separate factor.
                    if styled_function or name in integral_names+('sum','prod','lim')+function_names:
                        while True:
                            j=skip_space(text,i)
                            if j>=len(text) or text[j] not in ('^','_'):break
                            script=text[j];argument,i=atom(text,j+1,depth+1)
                            value+=script+braced(argument)
                    result.append(value)
            else:result.append(text[i]);i+=1
        return ''.join(result)
    return scan(source,0)

def parse_math_latex(source, *, symbols=None, functions=None, max_length=8000, angle="rad", function_callback=None, symbol_callback=None, binding_callback=None):
    """Return ParsedLatex. functions maps names to SymPy Lambda, not Python code.

    Matrices, determinants (vmatrix), cases and nested occurrences are supported.
    Vmatrix norms and partial derivative glyphs are deliberately rejected because
    the base parser cannot preserve their semantics. Use explicit diff templates.
    """
    if not isinstance(source,str) or not source.strip():raise LatexInputError('Enter a mathematical expression.')
    if len(source)>max_length:raise LatexInputError('The LaTeX input exceeds the 8,000-character limit.')
    if '\\partial' in source:raise LatexInputError('Partial-derivative LaTeX is not accepted by this parser. Use the derivative operation with explicit variables and orders.')
    original_source=source
    source=normalize_compact_arguments(source)
    symbols={} if symbols is None else symbols
    functions={} if functions is None else functions
    if any(not isinstance(f,sp.Lambda) for f in functions.values()):raise LatexInputError('Named functions must be mathematical Lambda definitions.')
    placeholders={}
    notes=[]
    syntactic_denominators=[]
    denominator_bindings=[]
    current_guard=sp.true
    current_guard_path=()
    def marker(obj):
        # Lark's multi-letter symbol syntax permits letters only.
        name='CalcObject'+('A'*(len(placeholders)+1))
        placeholders[name]=obj
        return '\\mathit{'+name+'}'
    def named_function(name,args,guard_path):
        if not function_callback:return functions[name](*args)
        return function_callback(name,args,sp.And(*guard_path),guard_path)
    def symbol_value(name,guard_path):
        if not symbol_callback:return symbols.get(name,sp.Symbol(name))
        return symbol_callback(name,sp.And(*guard_path),guard_path)
    class Transformer(TransformToSymPyExpr):
        def SYMBOL(self,token):
            name=str(token)
            return symbol_value(name,current_guard_path)
        def multi_letter_symbol(self,tokens):
            name=str(tokens[2])
            return placeholders[name] if name in placeholders else symbol_value(name,current_guard_path)
        def number(self,tokens):return sp.Rational(str(tokens[0]))
        def _ambig(self, candidates):
            # Identical parses can differ only in an unimportant grammar route.
            unique=[]
            for c in candidates:
                if not any(c==u for u in unique):unique.append(c)
            if len(unique)==1:return unique[0]
            known=[]
            for c in unique:
                apps=c.atoms(AppliedUndef) if isinstance(c,sp.Basic) else set()
                if apps and all(str(f.func) in functions for f in apps):known.append(c)
            if len(known)==1:return known[0]
            raise AmbiguousLatex(unique)
        def _denominator(self, base):
            original_base=base
            if isinstance(base,sp.Basic):denominator_bindings.append((base,current_guard_path))
            if current_guard is not sp.true:base=sp.Piecewise((base,current_guard),(1,True))
            if isinstance(base,sp.Basic) and base not in syntactic_denominators:
                syntactic_denominators.append(base)
            return sp.Pow(original_base,-1,evaluate=False)
        def mul(self,t):
            return t[0]*t[2] if any(isinstance(x,sp.MatrixBase) for x in (t[0],t[2])) else sp.Mul(t[0],t[2],evaluate=False)
        def add(self,t):
            return t[0]+t[2] if any(isinstance(x,sp.MatrixBase) for x in (t[0],t[2])) else sp.Add(t[0],t[2],evaluate=False)
        def sub(self,t):
            if len(t)==2:return sp.Mul(-1,t[1],evaluate=False)
            return sp.Add(t[0],sp.Mul(-1,t[2],evaluate=False),evaluate=False)
        def div(self,t):return sp.Mul(t[0],self._denominator(t[2]),evaluate=False)
        def superscript(self,t):
            if isinstance(t[2],sp.Basic) and t[2].is_negative:self._denominator(t[0])
            return sp.Pow(t[0],t[2],evaluate=False)
        def fraction(self,t):
            if isinstance(t[2],tuple):return super().fraction(t)
            return sp.Mul(t[1],self._denominator(t[2]),evaluate=False)
        def adjacent_expressions(self,t):
            if any(isinstance(x,sp.MatrixBase) for x in t):return t[0]*t[1]
            if t[0]==sp.Symbol('d') or isinstance(t[0],tuple):return super().adjacent_expressions(t)
            return sp.Mul(t[0],t[1],evaluate=False)
    # The angle policy runs before trig evaluation, including exact constants
    # and the inverse convention in sin^{-1}(x).
    def trig_method(name, inverse=False):
        def method(self,tokens):
            arg=tokens[1]
            if inverse:
                value=getattr(sp,name)(arg)
                return 180*value/sp.pi if angle=='deg' else value
            return getattr(sp,name)(arg*sp.pi/180 if angle=='deg' else arg)
        return method
    inverses={'sin':'asin','cos':'acos','tan':'atan','csc':'acsc','sec':'asec','cot':'acot'}
    for trig,inverse in inverses.items():
        setattr(Transformer,trig,trig_method(trig))
        setattr(Transformer,'arc'+trig,trig_method(inverse,True))
        def trig_power(self,tokens,_trig=trig,_inverse=inverse):
            exponent=tokens[2];arg=tokens[-1]
            if sp.simplify(exponent+1)==0:
                value=getattr(sp,_inverse)(arg)
                return 180*value/sp.pi if angle=='deg' else value
            value=getattr(sp,_trig)(arg*sp.pi/180 if angle=='deg' else arg)
            return sp.Pow(value,exponent,evaluate=False)
        setattr(Transformer,trig+'_power',trig_power)
    transformer=Transformer()
    def enclosed(text,start,opening='{',closing='}'):
        if start>=len(text) or text[start]!=opening:raise LatexInputError('A mathematical argument is missing its opening delimiter.')
        depth=1;i=start+1
        while i<len(text):
            if text[i]=='\\':
                token=re.match(r'\\(?:[A-Za-z]+|.)',text[i:]);i+=len(token.group(0)) if token else 1;continue
            if text[i]==opening:depth+=1
            elif text[i]==closing:
                depth-=1
                if not depth:return text[start+1:i],i+1
            i+=1
        raise LatexInputError('A mathematical argument has an unclosed delimiter.')
    colors={'red','orange','yellow','lime','green','teal','cyan','blue','indigo','purple','magenta','black','dark-grey','grey','light-grey','white'}
    def valid_color(value):
        return value.strip().lower() in colors or bool(re.fullmatch(r'#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?',value.strip()))
    def presentation_body(text,start):
        command=re.match(r'\\(textcolor|colorbox|boxed|bbox)(?![A-Za-z])\s*',text[start:])
        if not command:return None
        name=command.group(1);i=start+command.end()
        if name in ('textcolor','colorbox'):
            color,i=enclosed(text,i)
            if not valid_color(color):raise LatexInputError('Choose a supported color for this mathematical expression.')
        if name=='bbox' and i<len(text) and text[i]=='[':
            metadata,i=enclosed(text,i,'[',']')
            for option in metadata.split(','):
                option=option.strip()
                padding=re.fullmatch(r'(\d+(?:\.\d+)?)(px|pt|em|ex)',option)
                border=re.fullmatch(r'border:\s*(\d+(?:\.\d+)?)(px|pt|em|ex)\s+(solid|dashed|dotted)\s+(.+)',option)
                if padding and float(padding.group(1))<=1000:continue
                if border and float(border.group(1))<=1000 and valid_color(border.group(4)):continue
                if valid_color(option):continue
                raise LatexInputError('The box decoration contains unsupported formatting.')
        while i<len(text) and text[i].isspace():i+=1
        body,end=enclosed(text,i)
        return name,body,end
    def inline_mathematics(body):
        for _ in range(64):
            body=body.strip()
            if body.startswith('$') and body.endswith('$') and body.count('$')==2 and body[1:-1].strip():return body[1:-1]
            wrapper=presentation_body(body,0)
            if not wrapper or wrapper[2]!=len(body):break
            body=wrapper[1]
        raise LatexInputError('The colored box contains text. Enter one complete mathematical expression inside it.')
    menu_depth=0
    def menu_constructs(text,guard_path):
        # Vendor calculus operators have binding beyond the base Lark grammar.
        nonlocal menu_depth
        guard=sp.And(*guard_path)
        menu_depth+=1
        if menu_depth>64:raise LatexInputError('Mathematical arguments are limited to 64 nested structures.')
        i=0
        while i<len(text):
            if text.startswith(r'\begin{',i):
                environments=_environment_spans(text[i:])
                if environments and environments[0][0]==0:
                    i+=environments[0][1];continue
            presentation=presentation_body(text,i)
            if presentation:
                name,body,finish=presentation
                if name=='colorbox':body=inline_mathematics(body)
                elif body.strip().startswith('$'):body=inline_mathematics(body)
                text=text[:i]+marker(rec(body,guard_path))+text[finish:];continue
            fraction=re.match(r'\\(?:dfrac|frac|tfrac)\s*\{',text[i:])
            if fraction:
                numerator,end=enclosed(text,i+fraction.end()-1)
                j=end
                while j<len(text) and text[j].isspace():j+=1
                if j<len(text) and text[j]=='{':
                    denominator,end=enclosed(text,j)
                    order=re.fullmatch(r'(?:\\mathrm\{d\}|d)(?:\^\{(.*?)\})?',numerator.strip())
                    differential=re.fullmatch(r'(?:\\mathrm\{d\}\s*([A-Za-z]|\\[A-Za-z]+)|\\mathrm\{d\s*([A-Za-z]|\\[A-Za-z]+)\}|d\s*([A-Za-z]|\\[A-Za-z]+))(?:\^\{(.*?)\})?',denominator.strip())
                    if order and differential:
                        variable=rec(next(v for v in differential.groups()[:3] if v),guard_path)
                        if not isinstance(variable,sp.Symbol):raise LatexInputError('A derivative variable must be a symbol.')
                        numerator_order=rec(order.group(1),guard_path) if order.group(1) else sp.Integer(1)
                        denominator_order=rec(differential.group(4),guard_path) if differential.group(4) else sp.Integer(1)
                        if numerator_order!=denominator_order or numerator_order.is_Integer is not True or numerator_order<=0 or numerator_order>64:
                            raise LatexInputError('Derivative orders must agree and be integers from 1 to 64.')
                        depth=0;k=end;bar=None
                        while k<len(text):
                            if depth==0:
                                bar=re.match(r'\\(?:bigm|Bigm|big|Big|bigg|Bigg)\s*\|\s*_\s*\{',text[k:])
                                if bar:break
                            if text[k] in '{([':depth+=1
                            elif text[k] in '})]':depth-=1
                            k+=1
                        if not bar:raise LatexInputError('Complete the derivative evaluation point.')
                        assignment,finish=enclosed(text,k+bar.end()-1)
                        parts=_split_top(assignment,'=')
                        if len(parts)!=2 or rec(parts[0],guard_path)!=variable:raise LatexInputError('The evaluation point must name the derivative variable.')
                        point=rec(parts[1],guard_path)
                        binding_start=len(denominator_bindings);denominator_start=len(syntactic_denominators)
                        argument=binding_callback(variable,point,guard_path,lambda:rec(text[end:k],guard_path)) if binding_callback else rec(text[end:k],guard_path)
                        argument_denominators=denominator_bindings[binding_start:]
                        del denominator_bindings[binding_start:];del syntactic_denominators[denominator_start:]
                        for denominator,denominator_path in argument_denominators:
                            denominator_path=substitute_bound_guard_path(denominator_path,len(guard_path),{variable:point})
                            denominator_guard=sp.And(*denominator_path)
                            if denominator_guard is sp.false:continue
                            at_point=sp.simplify(denominator.subs(variable,point))
                            if at_point.is_zero is True and denominator_guard is sp.true:raise LatexInputError('The derivative evaluation point violates an original denominator restriction.')
                            denominator_bindings.append((at_point,denominator_path))
                            restriction=sp.Piecewise((at_point,denominator_guard),(1,True)) if denominator_guard is not sp.true else at_point
                            if restriction.free_symbols and restriction not in syntactic_denominators:syntactic_denominators.append(restriction)
                        # SymPy 1.13.3 Subs.doit fails when an unevaluated quotient
                        # simplifies its derivative to a nested Subs during evaluation.
                        derivative=sp.Derivative(argument,(variable,int(numerator_order)),evaluate=False).doit()
                        obj=sp.Subs(derivative,variable,point).doit()
                        text=text[:i]+marker(obj)+text[finish:];continue
            function=re.match(r'\\(arg|Re|Im)(?![A-Za-z])\s*(?:\\left\s*)?\(',text[i:])
            if function:
                body,finish=enclosed(text,i+function.end()-1,'(',')')
                body=re.sub(r'\\right\s*$','',body)
                obj={'arg':sp.arg,'Re':sp.re,'Im':sp.im}[function.group(1)](rec(body,guard_path))
                text=text[:i]+marker(obj)+text[finish:];continue
            absolute=re.match(r'\\lvert(?![A-Za-z])',text[i:])
            if absolute:
                start=i+absolute.end();j=start;level=1
                while j<len(text):
                    left=re.match(r'\\lvert(?![A-Za-z])',text[j:]);right=re.match(r'\\rvert(?![A-Za-z])',text[j:])
                    if left:level+=1;j+=left.end();continue
                    if right:
                        level-=1
                        if not level:break
                        j+=right.end();continue
                    j+=1
                if level:raise LatexInputError('An absolute value has an unclosed delimiter.')
                obj=sp.Abs(rec(text[start:j],guard_path));text=text[:i]+marker(obj)+text[j+right.end():];continue
            i+=1
        menu_depth-=1
        return text
    def rec(text,guard_path=()):
        nonlocal current_guard,current_guard_path
        guard=sp.And(*guard_path)
        text=text.strip()
        text=re.sub(r'\\pi(?![A-Za-z])',lambda _:marker(sp.pi),text)
        text=re.sub(r'\\mathrm\{e\}',lambda _:marker(sp.E),text)
        text=re.sub(r'\\mathrm\{i\}',lambda _:marker(sp.I),text)
        text=re.sub(r'\\operatorname\{(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh|arcsin|arccos|arctan|ln|log|exp)\}',lambda m:'\\'+m.group(1),text)
        text=menu_constructs(text,guard_path)
        spans=_environment_spans(text)
        for start,end,name,body in reversed(spans):
            rows=[r.strip() for r in _split_top(body,r'\\') if r.strip()]
            if name in _MATRIX_NAMES:
                if name=='Vmatrix':raise LatexInputError('A double-bar matrix norm requires an explicit norm choice.')
                data=[[rec(c,guard_path) for c in _split_top(row,'&')] for row in rows]
                if not data or len({len(row) for row in data})!=1:raise LatexInputError('Every matrix row must have the same number of cells.')
                if len(data)>12 or len(data[0])>12:raise LatexInputError('LaTeX matrix input is limited to 12 by 12 cells.')
                if any(isinstance(c,sp.MatrixBase) for row in data for c in row):
                    raise LatexInputError('Block matrices require the explicit matrix builder; scalar cells may contain cases.')
                obj=sp.ImmutableMatrix(data)
                if name=='vmatrix':
                    if obj.rows!=obj.cols:raise LatexInputError('A determinant requires a square matrix.')
                    obj=sp.Determinant(obj)
            elif name=='cases':
                pairs=[];previous=sp.false
                for row in rows:
                    columns=_split_top(row,'&')
                    if len(columns)!=2:raise LatexInputError('Each cases row needs an expression and a condition.')
                    condition=columns[1].strip().lstrip(',').strip()
                    if re.fullmatch(r'\\text\{\s*(?:otherwise|else)\s*\}',condition):cond=sp.true
                    else:
                        condition=re.sub(r'^\\text\{\s*(?:if|for)\s*\}\s*','',condition)
                        cond=rec(condition,guard_path+(sp.Not(previous),))
                        from sympy.logic.boolalg import Boolean
                        if not isinstance(cond,Boolean):raise LatexInputError('A cases condition must be a mathematical relation.')
                    expr=rec(columns[0],guard_path+(sp.Not(previous),cond))
                    previous=sp.Or(previous,cond)
                    if isinstance(expr,sp.MatrixBase):raise LatexInputError('Matrix-valued cases require selecting a scalar entry or an explicit matrix operation.')
                    pairs.append((expr,cond))
                obj=sp.Piecewise(*pairs,evaluate=False)
            else:raise LatexInputError('Unsupported LaTeX environment: '+name+'.')
            text=text[:start]+marker(obj)+text[end:]
        try:
            current_guard=guard
            current_guard_path=guard_path
            result=transformer.transform(_PARSER.doparse(text))
        except AmbiguousLatex:raise
        except Exception as exc:
            original=getattr(exc,'orig_exc',exc)
            if isinstance(original,AmbiguousLatex):raise original
            raise LatexInputError('Cannot read this LaTeX expression: '+str(original).split('\n')[0][:180]) from exc
        if isinstance(result,Tree):raise AmbiguousLatex(result.children)
        if isinstance(result,sp.Basic):
            for _ in range(12):
                apps={f:named_function(str(f.func),f.args,guard_path) for f in result.atoms(AppliedUndef) if str(f.func) in functions}
                if not apps:break
                new=result.xreplace(apps)
                if new==result:break
                result=new
        return result
    result=rec(source)
    # Record syntactic denominators before any later simplify/doit operation.
    expressions=list(result) if isinstance(result,sp.MatrixBase) else [result]
    denominators=list(syntactic_denominators)
    def collect(obj,guard=sp.true):
        if isinstance(obj,sp.MatrixBase):
            for entry in obj:collect(entry,guard)
        elif isinstance(obj,sp.Piecewise):
            previous=sp.false
            for value,condition in obj.args:
                available=sp.And(guard,sp.Not(previous));collect(condition,available)
                collect(value,sp.And(available,condition));previous=sp.Or(previous,condition)
        elif isinstance(obj,sp.Basic):
            if isinstance(obj,sp.Pow) and obj.exp.is_negative:
                base=obj.base if guard is sp.true else sp.Piecewise((obj.base,guard),(1,True))
                if base not in denominators:denominators.append(base)
            for child in obj.args:collect(child,guard)
    for expr in expressions:collect(expr)
    if denominators:notes.append('Original denominators must be nonzero; simplification does not remove these exclusions.')
    return ParsedLatex(original_source,result,denominators,notes)
