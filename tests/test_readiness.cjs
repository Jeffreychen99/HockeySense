const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const source = fs.readFileSync('web/app.js', 'utf8');
const readiness = source.slice(source.indexOf('function updateAnalyze()'), source.indexOf('async function refresh()'));
function check(overrides = {}) {
  const nodes = {'#start': {value:'0'}, '#end':{value:'30'}, '#analyze':{dataset:{}}, '#analysis-readiness':{}};
  const ctx = {clip:{status:'uploaded',duration:60}, uploading:false, state:{configured:true,ffmpeg:true}, profile:()=>({id:'me'}), updateIdentity:()=>true, $:id=>nodes[id], ...overrides};
  vm.runInNewContext(readiness+'\nupdateAnalyze();', ctx);
  return {button:nodes['#analyze'], message:nodes['#analysis-readiness'].textContent};
}
test('identified player without a profile gets an enabled profile action',()=>{
  const {button,message}=check({profile:()=>null});
  assert.equal(button.disabled,false); assert.equal(button.dataset.action,'profile'); assert.match(message,/profile.*missing/);
});
test('identified player without a clip gets an enabled upload action',()=>{
  const {button}=check({clip:null}); assert.equal(button.disabled,false); assert.equal(button.dataset.action,'upload');
});
test('ready player can analyze',()=>{
  const {button}=check(); assert.equal(button.disabled,false); assert.equal(button.dataset.action,'analyze');
});
test('unidentified player can open selection',()=>{
  const {button}=check({updateIdentity:()=>false}); assert.equal(button.disabled,false); assert.equal(button.dataset.action,'identify');
});
test('missing API configuration explains why analysis is blocked',()=>{
  const {button,message}=check({state:{configured:false,ffmpeg:true}}); assert.equal(button.disabled,true); assert.match(message,/OPENAI_API_KEY/);
});
test('in-progress review cannot be submitted again',()=>{
  const {button}=check({clip:{status:'analyzing',duration:60}}); assert.equal(button.disabled,true); assert.equal(button.dataset.action,'wait');
});
test('interval beyond the uploaded clip is explained',()=>{
  const {button,message}=check({clip:{status:'uploaded',duration:10}}); assert.equal(button.disabled,true); assert.equal(button.dataset.action,'interval'); assert.match(message,/duration/);
});
