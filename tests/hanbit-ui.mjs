import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../hanbit.js',import.meta.url),'utf8');
function fixture(result, records=[{vendor:'A'}]) {
  const old={name:'old.xlsx',hanbitAuto:true}, manual={name:'manual.xlsx'}, other={name:'openmile.xlsx'};
  const files=[old,manual,other], listeners=new Set(), elements=new Map();
  const status={style:{},setAttribute(k,v){this[k]=v;}}, button={};
  const fileList={get children(){return files.map(f=>({querySelector(){return {click(){files.splice(files.indexOf(f),1);}};}}));}};
  elements.set('hanbitStatus',status); elements.set('fileList',fileList);
  const app={getFiles:()=>files,readFile:async()=>({records})};
  elements.set('fileInput',{onchange:async e=>{files.push({name:e.target.files[0].name,records});}});
  const doc={readyState:'complete',body:{classList:{contains:()=>false}},
    getElementById:id=>elements.get(id),createElement:()=>({style:{},set innerHTML(value){elements.set('hanbitToday',button);}}),
    querySelector:()=>({after(){}})};
  class File {constructor(parts,name){this.name=name;}}
  const frame={contentDocument:doc,contentWindow:{DispatchApp:app,File},addEventListener(){}};
  const location={origin:'https://chowonki.github.io'};
  const window={addEventListener:(type,listener)=>listeners.add(listener),removeEventListener:(type,listener)=>listeners.delete(listener),
    postMessage(m){queueMicrotask(()=>{for(const listener of [...listeners]) listener({source:window,origin:location.origin,
      data:{source:'worktool-hanbit-connector',id:m.id,result:m.type==='HANBIT_PING'?{ok:true}:result}});});}};
  vm.runInNewContext(source,{document:{querySelector:()=>frame},window,location,Date,Promise,Error,Uint8Array,atob,setTimeout,clearTimeout});
  return {button,status,files,old,manual,other,listeners};
}
const login=fixture({ok:false,code:'LOGIN_REQUIRED'});
await login.button.onclick();
assert.match(login.status.textContent,/한빛탁송 로그인 필요/); assert.equal(login.status.role,'alert');
assert.deepEqual(login.files,[login.old,login.manual,login.other]); assert.equal(login.button.disabled,false);
const payload={ok:true,name:'한빛탁송_2026-10-31.xlsx',date:'2026-10-31',base64:btoa('PKdata')};
const success=fixture(payload); await success.button.onclick();
assert.equal(success.files.length,3); assert(!success.files.includes(success.old));
assert(success.files.includes(success.manual)); assert(success.files.includes(success.other));
assert.equal(success.files.filter(f=>f.hanbitAuto).length,1); assert.match(success.status.textContent,/자동 첨부 완료/);
await success.button.onclick(); assert.equal(success.files.length,3); assert.equal(success.files.filter(f=>f.hanbitAuto).length,1);
assert.equal(success.listeners.size,0);
const wrong=fixture(payload,[{vendor:'B'}]);await wrong.button.onclick();assert.equal(wrong.files.length,3);assert(wrong.files.includes(wrong.old));assert.match(wrong.status.textContent,/양식/);
const failed=fixture({ok:false,code:'NETWORK',message:'연결 실패'});await failed.button.onclick();assert.equal(failed.files.length,3);assert.equal(failed.status.textContent,'연결 실패');
console.log('로그인 오류 표시·정상 자동첨부·반복 교체·기존 업체 자료 보존·잘못된 양식 차단 검사 통과');
