import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../src/calculator.html',import.meta.url),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(code); // Syntax validation includes the UI code.
const ctx=vm.createContext({});
for(const [marker,name] of [['HARDWARE MODEL','hardware'],['PHOTOMETRY','photometry'],['PLANT MODEL','plantModel'],['ESTIMATE MODEL','estimateModel']]){
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
const e=ctx.estimateModelExport;
near(e.output('mf193').base[0],120.224);
near(e.output('mf193').base[1],158.73);
near(e.output('mf193').base[2],204);
near(e.output('mf194').base[0],123.76);
near(e.output('mf194').base[1],163.17);
near(e.output('mf194').base[2],209.44);
for(const id of ['mf193','mf194']){
  const output=e.output(id,1,70),layout=e.layout(1);
  const result=e.summarize(layout,.4,0,output.fluxes);
  assert.equal(result.scenarios.length,9);
  for(const key of ['mean','center']){
    assert.ok(result.range[key][0]<result[key]&&result[key]<result.range[key][1]);
    for(const s of result.scenarios)assert.ok(s[key]>=result.range[key][0]-1e-8&&s[key]<=result.range[key][1]+1e-8);
  }
  near(result.mean,result.samples.reduce((sum,s)=>sum+s.value,0)/result.samples.length);
  const half=e.summarize(layout,.4,0,e.output(id,1,35).fluxes);
  near(half.mean,result.mean/2);
  near(half.range.mean[0],result.range.mean[0]/2);
  near(half.range.mean[1],result.range.mean[1]/2);
  const off=e.summarize(layout,.4,0,e.output(id,1,0).fluxes);
  near(off.mean,0);near(off.range.mean[0],0);near(off.range.mean[1],0);
  const higher=e.summarize(layout,.8,0,output.fluxes);
  assert.ok(higher.range.mean[1]<result.range.mean[1]);
  const tilted=e.summarize(layout,.4,20*Math.PI/180,output.fluxes);
  assert.ok(tilted.mean>0&&Number.isFinite(tilted.range.center[1]));
  const dense=e.summarize(layout,.4,0,output.fluxes,2);
  assert.ok(Math.abs(result.mean/dense.mean-1)<.01);
  const four=e.layout(4);
  assert.equal(four.length,4);
  for(let i=1;i<four.length;i++)assert.ok(four[i].y-four[i-1].y>four[i].d);
  near(e.output(id,4,70).flux,output.flux*4);
  console.log(id,JSON.stringify({PPF:output.fluxes,mean:result.range.mean,nominal:result.mean,center:result.range.center,DLI:result.range.mean.map(v=>plant.dli(v,12))}));
}
// Each assumed angular profile conserves the same hemispherical photon flux.
for(const angle of e.angles){
  const n=Math.log(.5)/Math.log(Math.cos(angle*Math.PI/360));
  let flux=0;
  for(let i=0;i<10000;i++){const a=(i+.5)*da;flux+=(n+1)*Math.pow(Math.cos(a),n)*Math.sin(a)*da;}
  near(flux,1,1e-6);
}
console.log('PASS: module tables, interpolation limits, driver voltage/power checks, analog/PWM distinction, channel independence, angular normalization, PPFD, convergence and DLI.');
console.log('PASS: MiniFermer conditional PPF, nine-scenario envelopes, linear PWM including zero, height/tilt, layout and angular normalization.');
console.log(JSON.stringify({defaultPPF:51.772,defaultPPFD:standard.mean,defaultDLI:plant.dli(standard.mean,12),convergencePercent:100*Math.abs(standard.mean/dense.mean-1)},null,2));
