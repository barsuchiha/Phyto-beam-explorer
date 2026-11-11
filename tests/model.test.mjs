import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../src/calculator.html',import.meta.url),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(code); // Syntax validation includes the UI code.
const ctx=vm.createContext({});
for(const [marker,name] of [['HARDWARE MODEL','hardware'],['PHOTOMETRY','photometry'],['PLANT MODEL','plantModel']]){
  const part=code.slice(code.indexOf('// '+marker+' START'),code.indexOf('// '+marker+' END'));
  vm.runInContext(part+`;globalThis.${name}Export=${name};`,ctx);
}
const h=ctx.hardwareExport,p=ctx.photometryExport,plant=ctx.plantModelExport;
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
for(const [id,m] of Object.entries(h.modules))for(const [i,v,f] of m.rows){const q=h.point(id,i);near(q.voltage,v);near(q.ppf,f);assert.equal(q.exact,true);}
assert.equal(h.point('linear98',100),null);
assert.equal(h.point('square50',1500),null);
near(h.point('square50',525).ppf,(19.15+36.98)/2);
assert.equal(h.fit('square50','lcm25',700,2).ok,false); // 38.18V exceeds 36V.
assert.equal(h.fit('square50','lcm40',700,2).ok,true);
assert.equal(h.fit('square50','lcm40',350,4).ok,true);
assert.equal(h.fit('square50','ldd',700,4).ok,false); // 60W supply budget with losses.
assert.equal(h.fit('square50','ldd',1050,2).ok,false); // LDD-1050H is not offered.
const base={source:'square50',driver:'ldd',current:700,count:2,dim:100,dim2:100};
near(h.operate(base).flux,73.96);
near(h.operate(base).watts,26.726);
near(h.operate({...base,dim:70,dim2:70}).flux,51.772);
near(h.operate({...base,dim:0,dim2:100}).flux,36.98);
near(h.operate({...base,dim:0,dim2:0}).flux,0);
const analog=h.operate({...base,driver:'lcm40',dim:50});
near(analog.flux,38.3);assert.notEqual(analog.flux,73.96*.5);
assert.equal(h.operate({...base,driver:'lcm40',dim:5}).ok,false);
assert.equal(h.operate({...base,driver:'lcm40',dim:10}).ok,false);
assert.equal(h.operate({...base,driver:'lcm40',dim:0}).ok,true);
assert.equal(h.operate({...base,source:'linear98',driver:'lcm40',dim:25}).ok,false);
near(p.nativeAngle,118.04878048780488);
near(p.relative(Math.PI/3),.484);
let norm=0;const da=Math.PI/2/10000;
for(let i=0;i<10000;i++){const a=(i+.5)*da;norm+=2*Math.PI*p.curveNorm*p.relative(a)*Math.sin(a)*da;}
near(norm,1,1e-6);
const point=[{x:0,y:0,z:.4,weight:1}];
near(p.fieldAt(0,0,point,120,0,10),10/(Math.PI*.16));
near(p.fieldAt(0,0,point,'lm301b',0,10),10*p.curveNorm/.16);
near(p.fieldAt(0,0,[{...point[0],z:.8}],'lm301b',0,10)*4,p.fieldAt(0,0,point,'lm301b',0,10));
const group=[{x:-.18,y:0,w:.05,d:.05,weight:.5},{x:.18,y:0,w:.05,d:.05,weight:.5}];
const standard=p.summarize(group,.4,0,'lm301b',51.772),dense=p.summarize(group,.4,0,'lm301b',51.772,2);
assert.ok(Math.abs(standard.mean/dense.mean-1)<.01);
assert.ok(Math.abs(standard.center/dense.center-1)<.01);
const leftOff=p.sampleEmitters([{...group[0],weight:0},{...group[1],weight:1}],.4,0);
assert.ok(p.fieldAt(.18,0,leftOff,'lm301b',0,36.98)>p.fieldAt(-.18,0,leftOff,'lm301b',0,36.98));
near(p.summarize(group,.4,0,'lm301b',0).mean,0);
near(plant.dli(100,12),4.32);
const a=plant.evaluate(standard.samples.map(s=>s.value),12,'medium');near(a.percentages.reduce((x,y)=>x+y,0),100);
console.log('PASS: module tables, interpolation limits, driver voltage/power checks, analog/PWM distinction, channel independence, angular normalization, PPFD, convergence and DLI.');
console.log(JSON.stringify({defaultPPF:51.772,defaultPPFD:standard.mean,defaultDLI:plant.dli(standard.mean,12),convergencePercent:100*Math.abs(standard.mean/dense.mean-1)},null,2));
