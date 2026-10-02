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

def normalize_compact_roots(source, max_depth=64):
    """Add TeX-equivalent braces around one-token radical arguments.

    This preserves TeX token boundaries: sqrt17 means sqrt(1)*7. It also handles
    nested radicals, control-sequence symbols and fixed-arity fraction/style
    macros. It does not infer the meaning of incomplete mathematical notation.
    """
    if len(source)>8000:
        raise LatexInputError('The LaTeX input exceeds the 8,000-character limit.')
    def root_at(text,i):
        return text.startswith(r'\sqrt',i) and (i+5==len(text) or not text[i+5].isalpha())
    def skip_space(text,i):
        while i<len(text) and text[i].isspace():i+=1
        return i
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
        raise LatexInputError('A radical contains an unclosed '+opening+' group.')
    def braced(value):
        return value if value.startswith('{') and value.endswith('}') else '{'+value+'}'
    def atom(text,i,depth):
        if depth>max_depth:raise LatexInputError('Radicals are limited to 64 nested structures.')
        i=skip_space(text,i)
        if i>=len(text):raise LatexInputError('A radical needs a radicand.')
        if text[i]=='{':
            body,end=group(text,i,'{','}')
            if not body.strip():raise LatexInputError('A radical needs a radicand.')
            return '{'+scan(body,depth+1)+'}',end
        if root_at(text,i):return radical(text,i,depth+1)
        if text[i]=='\\':
            match=re.match(r'\\([A-Za-z]+|.)',text[i:])
            if not match:raise LatexInputError('Incomplete control sequence in a radical.')
            name=match.group(1);value=match.group(0);end=i+len(value)
            arity=2 if name in ('frac','dfrac','tfrac','binom','dbinom','tbinom') else 1 if name in ('mathrm','mathit','mathbf','mathsf','mathtt','operatorname') else 0
            for _ in range(arity):
                argument,end=atom(text,end,depth+1);value+=braced(argument)
            return value,end
        if text[i].isalnum():return text[i],i+1
        raise LatexInputError('Put the radical expression inside braces, for example \\sqrt{x+1}.')
    def radical(text,i,depth):
        if depth>max_depth:raise LatexInputError('Radicals are limited to 64 nested structures.')
        end=skip_space(text,i+5);index=''
        if end<len(text) and text[end]=='[':
            body,end=group(text,end,'[',']');index='['+scan(body,depth+1)+']'
        radicand,end=atom(text,end,depth+1)
        return r'\sqrt'+index+braced(radicand),end
    def scan(text,depth):
        if depth>max_depth:raise LatexInputError('Radicals are limited to 64 nested structures.')
        result=[];i=0
        while i<len(text):
            if root_at(text,i):
                value,i=radical(text,i,depth+1);result.append(value)
                j=skip_space(text,i)
                # The base grammar omits adjacency after a radical; retain TeX
                # multiplication when the next token visibly starts an operand.
                follows=j<len(text) and (text[j].isalnum() or text[j]=='(')
                command=re.match(r'\\([A-Za-z]+)',text[j:])
                if command and command.group(1) in ('pi','alpha','beta','gamma','delta','epsilon','theta','lambda','mu','nu','xi','rho','sigma','tau','phi','chi','psi','omega','sqrt','frac','dfrac','tfrac','sin','cos','tan','log','ln','exp','left','mathrm','mathit'):
                    follows=True
                if follows:result.append(r'\cdot ')

            elif text[i]=='\\':
                match=re.match(r'\\(?:[A-Za-z]+|.)',text[i:]);value=match.group(0) if match else text[i];result.append(value);i+=len(value)
            else:result.append(text[i]);i+=1
        return ''.join(result)
    return scan(source,0)

def parse_math_latex(source, *, symbols=None, functions=None, max_length=8000, angle="rad", function_callback=None, symbol_callback=None):
    """Return ParsedLatex. functions maps names to SymPy Lambda, not Python code.

    Matrices, determinants (vmatrix), cases and nested occurrences are supported.
    Vmatrix norms and partial derivative glyphs are deliberately rejected because
    the base parser cannot preserve their semantics. Use explicit diff templates.
    """
    if not isinstance(source,str) or not source.strip():raise LatexInputError('Enter a mathematical expression.')
    if len(source)>max_length:raise LatexInputError('The LaTeX input exceeds the 8,000-character limit.')
    if '\\partial' in source:raise LatexInputError('Partial-derivative LaTeX is not accepted by this parser. Use the derivative operation with explicit variables and orders.')
    original_source=source
    source=normalize_compact_roots(source)
    symbols={} if symbols is None else symbols
    functions={} if functions is None else functions
    if any(not isinstance(f,sp.Lambda) for f in functions.values()):raise LatexInputError('Named functions must be mathematical Lambda definitions.')
    placeholders={}
    notes=[]
    syntactic_denominators=[]
    current_guard=sp.true
    def marker(obj):
        # Lark's multi-letter symbol syntax permits letters only.
        name='CalcObject'+('A'*(len(placeholders)+1))
        placeholders[name]=obj
        return '\\mathit{'+name+'}'
    class Transformer(TransformToSymPyExpr):
        def SYMBOL(self,token):
            name=str(token)
            return symbol_callback(name,current_guard) if symbol_callback else symbols.get(name,sp.Symbol(name))
        def multi_letter_symbol(self,tokens):
            name=str(tokens[2])
            return placeholders[name] if name in placeholders else symbol_callback(name,current_guard) if symbol_callback else symbols.get(name,sp.Symbol(name))
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
    def rec(text,guard=sp.true):
        nonlocal current_guard
        text=text.strip()
        text=re.sub(r'\\pi(?![A-Za-z])',lambda _:marker(sp.pi),text)
        text=re.sub(r'\\mathrm\{e\}',lambda _:marker(sp.E),text)
        text=re.sub(r'\\mathrm\{i\}',lambda _:marker(sp.I),text)
        text=re.sub(r'\\operatorname\{(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh|arcsin|arccos|arctan|ln|log|exp)\}',lambda m:'\\'+m.group(1),text)
        spans=_environment_spans(text)
        for start,end,name,body in reversed(spans):
            rows=[r.strip() for r in _split_top(body,r'\\') if r.strip()]
            if name in _MATRIX_NAMES:
                if name=='Vmatrix':raise LatexInputError('A double-bar matrix norm requires an explicit norm choice.')
                data=[[rec(c,guard) for c in _split_top(row,'&')] for row in rows]
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
                        cond=rec(condition,sp.And(guard,sp.Not(previous)))
                        from sympy.logic.boolalg import Boolean
                        if not isinstance(cond,Boolean):raise LatexInputError('A cases condition must be a mathematical relation.')
                    expr=rec(columns[0],sp.And(guard,sp.Not(previous),cond))
                    previous=sp.Or(previous,cond)
                    if isinstance(expr,sp.MatrixBase):raise LatexInputError('Matrix-valued cases require selecting a scalar entry or an explicit matrix operation.')
                    pairs.append((expr,cond))
                obj=sp.Piecewise(*pairs,evaluate=False)
            else:raise LatexInputError('Unsupported LaTeX environment: '+name+'.')
            text=text[:start]+marker(obj)+text[end:]
        try:
            current_guard=guard
            result=transformer.transform(_PARSER.doparse(text))
        except AmbiguousLatex:raise
        except Exception as exc:
            original=getattr(exc,'orig_exc',exc)
            if isinstance(original,AmbiguousLatex):raise original
            raise LatexInputError('Cannot read this LaTeX expression: '+str(original).split('\n')[0][:180]) from exc
        if isinstance(result,Tree):raise AmbiguousLatex(result.children)
        if isinstance(result,sp.Basic):
            for _ in range(12):
                apps={f:(function_callback(str(f.func),f.args,guard) if function_callback else functions[str(f.func)](*f.args)) for f in result.atoms(AppliedUndef) if str(f.func) in functions}
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
