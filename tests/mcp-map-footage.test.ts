import {describe,it,expect} from "vitest";
import {findMapScenes,renderMapFootage} from "../src/mcp/map-footage.mjs";

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
