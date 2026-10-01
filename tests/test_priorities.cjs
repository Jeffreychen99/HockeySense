const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const src=fs.readFileSync('web/app.js','utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('function priorityIssues('),src.indexOf('function issueSummaryHTML(')),ctx);
const moment=(title,impact='medium')=>({title,impact,confidence:'high',assessment:'supported_correction',evidence:'Visible lane closes',game_situation:'Open outlet disappears',time:1});
test('impact outranks repetition and titles come from actual findings',()=>{
 const r=ctx.priorityIssues({moments:[...Array(9).fill(moment('Small adjustment','low')),moment('Use the open outlet','high')]});
 assert.equal(r[0].title,'Use the open outlet');assert.equal(r.length,2);
});
test('unsupported and legacy moments never become priorities',()=>{
 const r=ctx.priorityIssues({moments:[{title:'Scan more'}, {...moment('Uncertain'),assessment:'uncertain'}, {...moment('Invisible'),evidence:''}]});assert.equal(r.length,0);
});
test('summary is capped at five without padding',()=>{
 assert.equal(ctx.priorityIssues({moments:Array.from({length:8},(_,i)=>moment(`Correction ${i}`))}).length,5);
 assert.equal(ctx.priorityIssues({moments:[]}).length,0);
});
