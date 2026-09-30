// Bounded REST transport for this import. All writes use a Firestore transaction;
// a commit with an ambiguous response is never automatically resubmitted.
import {Timestamp,FieldValue} from 'firebase-admin/firestore';
export function firestoreRest(app,projectId,fetchRequest=fetch){
  const base=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const timestamp=s=>{const [whole,fraction='']=s.replace('Z','').split('.');return new Timestamp(Date.parse(whole+'Z')/1000,Number(fraction.padEnd(9,'0')));};
  const iso=t=>new Date(t.seconds*1000).toISOString().replace('.000Z',`.${String(t.nanoseconds).padStart(9,'0')}Z`);
  function decode(v){for(const k of ['stringValue','booleanValue'])if(k in v)return v[k];if('timestampValue'in v)return timestamp(v.timestampValue);if('nullValue'in v)return null;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);throw Error('Unsupported Firestore field');}
  function encode(v,path=[],transforms=[]){
    if(v instanceof FieldValue){if(!v.isEqual(FieldValue.serverTimestamp()))throw Error('Unsupported transform');transforms.push({fieldPath:path.join('.'),setToServerValue:'REQUEST_TIME'});return undefined;}
    if(v instanceof Timestamp)return {timestampValue:iso(v)};
    if(v===null)return {nullValue:null};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};
    if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
    if(Array.isArray(v))return{arrayValue:{values:v.map(x=>encode(x,path,transforms))}};
    if(typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x,[...path,k],transforms)]).filter(([,x])=>x!==undefined))}};
    throw Error('Undefined Firestore value');
  }
  async function request(suffix,body,readOnly=true){
    for(let attempt=0;attempt<(readOnly?4:1);attempt++){
      try{
        const token=await app.options.credential.getAccessToken();
        const r=await fetchRequest(base+suffix,{method:'POST',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
        const result=await r.json();
        if(!r.ok){const e=Error(`Firestore REST ${r.status}: ${result.error?.message||'request failed'}`);e.httpStatus=r.status;throw e;}
        return result;
      }catch(e){if(attempt===(readOnly?3:0)||e.httpStatus&&e.httpStatus<500&&e.httpStatus!==429)throw e;}
    }
  }
  const doc=path=>({id:path.split('/').at(-1),path,get:async()=> (await getAll([doc(path)]))[0]});
  const snap=(path,d)=>({id:path.split('/').at(-1),ref:doc(path),exists:!!d,updateTime:d?timestamp(d.updateTime):undefined,
    data:()=>d?decode({mapValue:{fields:d.fields}}):undefined,get:key=>d?decode({mapValue:{fields:d.fields}})[key]:undefined});
  async function getAll(refs,transaction){
    const result=await request(':batchGet',{documents:refs.map(r=>`${base.slice('https://firestore.googleapis.com/v1/'.length)}/${r.path}`),...(transaction?{transaction}:{})});
    const found=new Map(result.map(r=>[(r.found?.name||r.missing).split('/documents/')[1],r.found]));
    return refs.map(r=>{if(!found.has(r.path))throw Error('Incomplete document read');return snap(r.path,found.get(r.path));});
  }
  async function query(q,transaction){
    const result=await request(':runQuery',{structuredQuery:{from:[{collectionId:q.collectionId}],where:{fieldFilter:{field:{fieldPath:q.field},op:'IN',value:encode(q.values)}}},...(transaction?{transaction}:{})});
    const docs=result.filter(r=>r.document).map(r=>snap(r.document.name.split('/documents/')[1],r.document));return{docs,size:docs.length};
  }
  return{doc,getAll:(...refs)=>getAll(refs),collection:collectionId=>({where:(field,op,values)=>{if(op!=='in')throw Error('Unsupported query');const q={collectionId,field,values};return{...q,get:()=>query(q)};}}),
    async runTransaction(callback){
      const {transaction}=await request(':beginTransaction',{options:{readWrite:{}}});
      const writes=[];
      const write=(ref,data,create)=>{
        const transforms=[];const fields=encode(data,[],transforms).mapValue.fields;
        writes.push({update:{name:`${base.slice('https://firestore.googleapis.com/v1/'.length)}/${ref.path}`,fields},
          ...(create?{currentDocument:{exists:false}}:{updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{exists:true}}),
          ...(transforms.length?{updateTransforms:transforms}:{})});
      };
      try{
        await callback({getAll:(...refs)=>getAll(refs,transaction),get:r=>r.collectionId?query(r,transaction):getAll([r],transaction).then(x=>x[0]),create:(r,d)=>write(r,d,true),update:(r,d)=>write(r,d,false)});
      }catch(e){await request(':rollback',{transaction},false).catch(()=>{});throw e;}
      await request(':commit',{transaction,writes},false);
    }};
}
