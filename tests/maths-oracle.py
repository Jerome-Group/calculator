import json
from maths_assertions import assert_fixture

results=[]
for f in fixtures:
 try:
  result=json.loads(compute(json.dumps(f['request'])))
  if mutation==f['id']:result['text']='999';result['details']={};result['display']={'type':'text','text':'999'}
  assert_fixture(f,result);results.append({'id':f['id'],'status':'pass','assertions':len(f['assertions'])})
 except Exception as e:results.append({'id':f['id'],'status':'fail','error':str(e),'actualStatus':result.get('status'),'actualText':result.get('text','')[:700]})
json.dumps({'schemaVersion':1,'suite':'independent-math','status':'fail' if any(r['status']!='pass' for r in results) else 'pass','checks':results})
