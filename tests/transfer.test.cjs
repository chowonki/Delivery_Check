const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const html=readFileSync(require('node:path').join(__dirname,'../transfer.html'),'utf8');
// Run the page's actual parsing and validation code without browser event bindings.
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1].split("$('errorsOnly').onchange=")[0];
const context=vm.createContext({});
vm.runInContext(source,context);
const run=code=>vm.runInContext(code,context,{timeout:1000});

test('documented whole-won formats preserve their exact value',()=>{
 for(const [text,want] of [['35,000원','35000'],['1000만원','10000000'],['천만원','10000000'],['1억 2천만원','120000000'],['금액: 10000000','10000000'],['₩35,000','35000'],['금액: 7,240,000원','7240000']]){
  assert.equal(context.parseKoreanAmount(text),want,text);
 }
});
test('signed, decimal and malformed amounts never become positive transfers',()=>{
 for(const value of ['-35000원','- 35000원','−35,000원','금액: -35000원','금액 -35000원','금액: -천만원','₩-35000','1.5만원','.5만원','35,000.50원','35,00원','35,00원 500원','1/2만원','1e5원','35000원 / 40000원']){
  assert.equal(context.parseKoreanAmount(value),'',value);
  const thread=`국민은행\n123-456-789012\n${value}`;
  assert.equal(context.parseOne(thread).items[0].amount,'',thread);
 }
});
test('manual edits use the same amount checks as extraction',()=>{
 for(const value of ['-35000','1.5만원','35,00원','35,00','₩-35000']){
  const amount=context.editedAmount(value);
  assert.ok(context.validate({bank:'국민은행',account:'123456789012',amount}).includes('금액 확인'),value);
 }
 for(const value of ['35000','35,000','35,000원','3만 5천원'])assert.equal(context.editedAmount(value),'35000');
});
test('bank validation accepts known aliases and rejects arbitrary names',()=>{
 for(const [bank,want] of [['KB','국민은행'],['국민은행','국민은행'],[' keb하나 ','하나은행'],['NH','농협은행'],['iM뱅크','iM뱅크']]){
  assert.equal(context.canonicalBank(bank),want);
  assert.ok(!context.validate({bank,account:'123456789012',amount:'35000'}).includes('은행명 확인'));
 }
 for(const bank of ['', '없는은행','국민은행오타'])assert.ok(context.validate({bank,account:'123456789012',amount:'35000'}).includes('은행명 확인'));
});
test('splits preserve totals and stop before allocating more than 100 rows',()=>{
 for(const amount of ['100000000','100000001','120000000','10000000000']){
  const rows=context.expandTransfer({amount});
  assert.ok(rows.length<=100);
  assert.equal(rows.reduce((sum,r)=>sum+BigInt(r.amount),0n),BigInt(amount));
  assert.ok(rows.every(r=>Number(r.amount)<=100000000));
 }
 for(const amount of ['10000000001','9007199254740991'])assert.throws(()=>run(`expandTransfer({amount:'${amount}'})`),/100건/);
 assert.throws(()=>run("expandTransfers([{amount:'10000000000'},{amount:'1'}])"),/100건/);
});
test('automatic split duplicates are allowed while independent duplicates are blocked',()=>{
 run("data=expandTransfer({bank:'국민은행',account:'123456789012',amount:'200000000',plate:''})");
 assert.equal(run('data.every(row=>validate(row).length===0)'),true);
 run("data.push({...data[0],splitGroup:''})");
 assert.equal(run("validate(data[2]).includes('동일 계좌·금액·차량번호 중복')"),true);
 run('data=[]');
});

const filenameSource=html.match(/<script>([\s\S]*?)<\/script>/)[1].split("let lastExportStamp=")[1].split('function excel()')[0];
function filenameContext(){
 const fresh=vm.createContext({});
 vm.runInContext(source+"\nlet lastExportStamp="+filenameSource,fresh);
 return fresh;
}
test('download names identify the exported vehicles and exact total without extra input',()=>{
 const now=new Date('2026-10-31T05:20:35Z');
 const cases=[
  [[{plate:'123가4567',amount:'35000'}],'123가4567_35,000원_1031_142035.xlsx'],
  [[{plate:'123가4567',amount:'50000'},{plate:'45나6789',amount:'400000'},{plate:'234다5678',amount:'400000'}],'123가4567외2대_총850,000원_1031_142035.xlsx'],
  [[{amount:'50000'},{amount:'400000'},{amount:'400000'}],'송금3건_총850,000원_1031_142035.xlsx'],
  [[{plate:'123가4567',amount:'100000000'},{plate:'123가4567',amount:'20000000'}],'123가4567_총120,000,000원_1031_142035.xlsx'],
  [[{plate:'123가4567',commentPlates:['123가4567','45나6789','234다5678'],amount:'850000'}],'123가4567외2대_총850,000원_1031_142035.xlsx'],
  [[{plate:'45나6789',commentPlates:['123가4567'],amount:'35000'}],'45나6789_35,000원_1031_142035.xlsx']
 ];
 for(const [rows,want] of cases)assert.equal(filenameContext().uniqueTransferFilename(rows,now),want);
});
test('same-second exports get a suffix and dates use Korean time across midnight',()=>{
 const fresh=filenameContext(),rows=[{plate:'123가4567',amount:'35000'}],now=new Date('2026-10-31T15:00:00Z');
 assert.equal(fresh.uniqueTransferFilename(rows,now),'123가4567_35,000원_1101_000000.xlsx');
 assert.equal(fresh.uniqueTransferFilename(rows,now),'123가4567_35,000원_1101_000000_2.xlsx');
 assert.equal(fresh.uniqueTransferFilename(rows,now),'123가4567_35,000원_1101_000000_3.xlsx');
 assert.equal(fresh.uniqueTransferFilename(rows,new Date('2026-10-31T15:00:01Z')),'123가4567_35,000원_1101_000001.xlsx');
});


function slackContext(){
 const fresh=vm.createContext({URL,URLSearchParams,AbortController,setTimeout,clearTimeout});
 vm.runInContext(source,fresh);return fresh;
}
const permalink='https://company.slack.com/archives/C123ABC/p1793448000123456';
const ok=body=>({ok:true,status:200,json:async()=>({ok:true,...body})});
test('Slack links preserve six-digit timestamps and prefer the parent thread',()=>{
 const c=slackContext();
 assert.equal(c.slackLink(permalink).ts,'1793448000.123456');
 assert.equal(c.slackLink(permalink+'?thread_ts=1793447000.000001&cid=C123ABC').ts,'1793447000.000001');
 assert.equal(c.slackLink('<'+permalink+'|열기>').channel,'C123ABC');
 for(const bad of ['https://evil.example/archives/C123ABC/p1793448000123456',permalink.replace('slack.com','slack.com.evil.example'),permalink.replace('https:','http:'),permalink+'?thread_ts=bad','https://company.slack.com/archives/C123ABC',permalink.replace('https://','https://user:secret@')])assert.equal(c.slackLink(bad),null,bad);
});
test('Slack fetch reads every page and feeds parent and workflow reply fields to the real parser',async()=>{
 const c=slackContext(),calls=[];
 const request=async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.body.get('token'),'test-token');
  assert.equal(options.body.get('channel'),'C123ABC');
  assert.equal(options.body.get('ts'),'1793448000.123456');
  assert.equal(options.credentials,'omit');
  return calls.length===1?ok({messages:[{ts:'1793448000.123456',text:'123가4567'}],has_more:true,response_metadata:{next_cursor:'page2'}}):ok({messages:[{ts:'1793448001.000001',text:'',attachments:[{fields:[{title:'은행',value:'국민은행'},{title:'계좌',value:'123-456-789012'},{title:'금액',value:'35,000원'}]}]}]});
 };
 const chunks=await c.resolveThreadInput(permalink,'test-token',new Map(),request);
 assert.equal(calls.length,2);assert.equal(calls[1].options.body.get('cursor'),'page2');
 assert.equal(chunks[0].result.items[0].bank,'국민은행');
 assert.equal(chunks[0].result.items[0].account,'123456789012');
 assert.equal(chunks[0].result.items[0].amount,'35000');
 assert.equal(chunks[0].result.plates[0],'123가4567');
 assert.equal(calls[0].url,'https://slack.com/api/conversations.replies');
});
test('text input and embedded reference links work without Slack authentication or requests',async()=>{
 const c=slackContext();let count=0;
 const chunks=await c.resolveThreadInput('123가4567\n'+permalink+'\n국민은행\n123-456-789012\n35,000원','',new Map(),async()=>{count++;throw Error('must not fetch')});
 assert.equal(count,0);assert.equal(chunks[0].result.items[0].amount,'35000');
 await assert.rejects(c.resolveThreadInput(permalink,'',new Map(),async()=>{count++}),/토큰/);
 assert.equal(count,0);
});
test('permission errors, rate limits and incomplete pagination never return partial payment data',async()=>{
 const c=slackContext(),link=c.slackLink(permalink);
 for(const code of ['invalid_auth','missing_scope','channel_not_found','thread_not_found']){
  await assert.rejects(c.fetchSlackThread(link,'secret',async()=>ok({ok:false,error:code})),/토큰|권한|스레드/);
 }
 await assert.rejects(c.fetchSlackThread(link,'secret',async()=>({ok:false,status:429,headers:{get:()=> '60'}})),/60초/);
 await assert.rejects(c.fetchSlackThread(link,'secret',async()=>ok({messages:[{ts:'1',text:'35,000원'}],has_more:true})),/끝까지/);
 let calls=0;
 await assert.rejects(c.fetchSlackThread(link,'secret',async()=>{if(++calls===1)return ok({messages:[{ts:'1',text:'35,000원'}],has_more:true,response_metadata:{next_cursor:'next'}});throw Error('offline secret')}),/연결/);
 assert.equal(calls,2);
});
test('Slack workflow blocks and rich text expose fields while token stays outside snapshots',()=>{
 const c=slackContext();
 const text=c.slackMessageText({text:'',blocks:[{type:'section',fields:[{type:'mrkdwn',text:'국민은행'},{type:'mrkdwn',text:'123-456-789012'}]},{type:'rich_text',elements:[{type:'rich_text_section',elements:[{type:'text',text:'금액: 35,000원'}]}]}]});
 assert.equal(c.parseOne(text).items[0].amount,'35000');
 assert.ok(!html.slice(html.indexOf('function snapshot(){'),html.indexOf('function rememberUndo')).includes('slackToken'));
 assert.ok(!/localStorage|sessionStorage/.test(html));
});

function parsingPage(values,token,request){
 const inputs=values.map(value=>({value,disabled:false,dataset:{},focus(){}}));
 const controls={parse:{disabled:false,textContent:''},slackToken:{value:token,disabled:false},parseNotice:{textContent:''}};
 const alerts=[];
 const c=slackContext();
 c.document={getElementById:id=>controls[id],querySelectorAll:selector=>selector==='.threadRaw'?inputs:selector.startsWith('main ')?[...inputs,...Object.values(controls)]:[]};
 c.fetch=request;c.alert=message=>alerts.push(message);
 vm.runInContext('render=()=>{};refresh=()=>{};renumberThreads=()=>{};',c);
 return {c,inputs,controls,alerts};
}
test('page keeps failed links while adding and clearing successful text inputs',async()=>{
 const {c,inputs,controls,alerts}=parsingPage([permalink,'국민은행\n123-456-789012\n35,000원'],'',async()=>{throw Error('must not call')});
 await c.parse();
 assert.equal(vm.runInContext('data.length',c),1);
 assert.equal(inputs[0].value,permalink);assert.equal(inputs[1].value,'');
 assert.equal(controls.parse.disabled,false);assert.ok(inputs.every(el=>!el.disabled));
 assert.ok(alerts.some(message=>message.includes('토큰')));
});
test('page extracts a loaded Slack thread, retains its source and unlocks controls',async()=>{
 const {c,inputs,controls}=parsingPage([permalink],'test-token',async()=>ok({messages:[{ts:'1793448000.123456',text:'123가4567\n국민은행\n123-456-789012\n35,000원'}]}));
 await c.parse();
 assert.equal(vm.runInContext('data[0].amount',c),'35000');
 assert.ok(vm.runInContext('data[0].source',c).includes('국민은행'));
 assert.equal(inputs[0].value,'');assert.equal(controls.parse.disabled,false);
 assert.ok(controls.parseNotice.textContent.includes('신규 1건'));
});
test('complete page script remains syntactically valid',()=>{
 assert.doesNotThrow(()=>new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]));
});
