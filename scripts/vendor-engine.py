import json,pathlib,urllib.request,hashlib,concurrent.futures
root=pathlib.Path('public/engine');lock=json.loads((root/'pyodide-lock.json').read_text());names=set()
def include(name):
 if name in names:return
 names.add(name)
 for dependency in lock['packages'][name]['depends']:include(dependency)
for package in ['sympy','scipy','networkx','lark']:include(package)
def fetch(n):
 p=lock['packages'][n];dest=root/p['file_name']
 if not dest.exists():
  data=urllib.request.urlopen('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'+p['file_name'],timeout=120).read()
  assert hashlib.sha256(data).hexdigest()==p['sha256'],n
  dest.write_bytes(data)
 return n,dest.stat().st_size
with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
 for result in pool.map(fetch,names): print(result,flush=True)
