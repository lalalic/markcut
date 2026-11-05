import {describe,expect,it} from "vitest";
import {remotionFolderName} from "../src/types/remotion-folder-name";

const accepted=/^[a-zA-Z0-9\u4E00-\u9FFF-]+$/;
describe("Remotion scene folder name",()=>{
 it("preserves valid authored names",()=>{
  expect(remotionFolderName("Opening-Long","a1")).toBe("Opening-Long");
  expect(remotionFolderName("湖边","a2")).toBe("湖边");
 });
 it("sanitizes names rejected by Remotion without altering source metadata",()=>{
  for(const [name,id] of [
   ["Opening_Long","xxvsny5a"],["Scene with spaces","id-1"],["emoji 🎬 !","scene-3"],
   ["シーン 一","scene-4"],["/","scene-5"],["","scene-6"],
  ]){
   const safe=remotionFolderName(name,id);
   expect(safe).toMatch(accepted);
   expect(safe).not.toContain("_");
   expect(remotionFolderName(name,id)).toBe(safe);
  }
  expect(remotionFolderName("Opening_Long","xxvsny5a")).toBe("Opening-Long-xxvsny5a");
 });
 it("keeps distinct invalid names distinct when IDs differ",()=>{
  expect(remotionFolderName("A_B","id1")).not.toBe(remotionFolderName("A B","id2"));
 });
});
