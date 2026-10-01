const assert = require('node:assert/strict');
const {test} = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const src = fs.readFileSync('web/app.js','utf8');
const code = src.slice(src.indexOf('function loadPlayback('),src.indexOf("$('#quality').onchange"));
function fixture(quality='smooth', currentSrc='') {
  const video = {src:currentSrc,currentTime:12,duration:60,paused:false,loads:0,plays:0,
    getAttribute(){return this.src;}, pause(){this.paused=true;}, load(){this.loads++;}, play(){this.plays++;return Promise.resolve();}};
  const ctx = {video,$:id=>({value:id==='#quality'?quality:'0.5'}),updateReference(){}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {video,load:ctx.loadPlayback};
}
const clip = {filename:'source.mp4',playback_filename:'source-replay.mp4'};
test('default playback buffers the smaller copy before play',()=>{
  const {video,load}=fixture();load(clip);assert.equal(video.src,'/media/source-replay.mp4');assert.equal(video.preload,'auto');assert.equal(video.loads,1);
});
test('reopening a loaded clip does not reload or discard its buffer',()=>{
  const {video,load}=fixture('smooth','/media/source-replay.mp4');load(clip);assert.equal(video.loads,0);assert.equal(video.currentTime,12);
});
test('full-detail switch preserves position, speed and playback',()=>{
  const {video,load}=fixture('original','/media/source-replay.mp4');load(clip,true);video.onloadedmetadata();
  assert.equal(video.src,'/media/source.mp4');assert.equal(video.currentTime,12);assert.equal(video.playbackRate,.5);assert.equal(video.plays,1);
});
test('older clips fall back to their original file',()=>{
  const {video,load}=fixture();load({filename:'source.mp4'});assert.equal(video.src,'/media/source.mp4');
});
