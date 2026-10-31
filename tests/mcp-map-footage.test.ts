import {describe,it,expect} from "vitest";
import {findMapScenes,renderMapFootage,mapVisualOnlyScene,replaceMapWithFootage} from "../src/mcp/map-footage.mjs";

const root=()=>({type:"root",children:[
 {type:"scene",name:"Opening",visible:true,children:[{type:"component"}]},
 {type:"scene",name:"Route",visible:true,durationInSeconds:3,
  children:[{id:"map-one",type:"map",view:"route",start:0,end:3,visible:true}]},
 {type:"scene",name:"Cinematic",visible:true,durationInSeconds:3,
  children:[{id:"map-two",type:"map",view:"cinematic",start:0,end:3,visible:true}]}
]});

describe("Remotion map-footage precompilation",()=>{
 it("discovers the existing Google route and cinematic scenes",()=>{
  expect(findMapScenes(root()).map(x=>x.name)).toEqual(["Route","Cinematic"]);
 });
 it("retains live Google Maps unchanged when a render key is unavailable",async()=>{
  const compiled=root(),before=JSON.stringify(compiled);
  const result=await renderMapFootage(compiled,{generatedDir:"/tmp/no-render",key:""});
  expect(result.rendered).toBe(0);
  expect(result.skipped).toBe(2);
  expect(JSON.stringify(result.compiled)).toBe(before);
  expect(findMapScenes(compiled)).toHaveLength(2);
 });
});


describe('map footage narration retention',()=>{
 it('renders map pixels without baking a separate voice into video',()=>{
  const scene={type:'scene',durationInSeconds:8,children:[{type:'map',view:'route',children:[{type:'image',src:'photo.jpg'}]},{type:'audio',src:'voice.mp3',volume:0.9},{type:'audio',src:'bgm.mp3',volume:0.2,isBackground:true}]};
  const video=mapVisualOnlyScene(scene);
  expect(video.children).toHaveLength(1);
  expect(video.children[0].type).toBe('map');
  expect(video.children[0].children[0].src).toBe('photo.jpg');
  expect(scene.children).toHaveLength(3);
 });
 it('replaces the map only, retaining speech, BGM and source sound',()=>{
  const scene={type:'scene',children:[{id:'map',type:'map',children:[]},{id:'narrator',type:'audio',src:'voice.mp3',volume:1},{id:'music',type:'audio',src:'bgm.mp3',isBackground:true,volume:0.2},{id:'ambience',type:'audio',src:'river.wav',volume:0.7}]};
  replaceMapWithFootage(scene,'render.mp4',12,0);
  expect(scene.children.map(c=>c.type)).toEqual(['video','audio','audio','audio']);
  expect(scene.children.map(c=>c.src)).toEqual(['render.mp4','voice.mp3','bgm.mp3','river.wav']);
  expect(scene.children[0].volume).toBe(0);
 });
});
