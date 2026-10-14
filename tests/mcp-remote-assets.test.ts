import {describe,it,expect} from "vitest";
import {externalizePreviewMedia,resolveMountedFile,resolvePreviewSource,resolvePreviewPath,publishPlayerBundle,publicOrigin,EXPORT_ROOT} from "../src/mcp/remote-assets.mjs";
import {readFileSync,rmSync,writeFileSync,mkdirSync,mkdtempSync,symlinkSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
const id="11111111-2222-4333-8444-555555555555";
describe("NeoY backed preview files",()=>{
  it("publishes generated media as persistent files under NeoY export root",()=>{
    const input={root:{children:[
      {type:"audio",src:"data:audio/wav;base64,UklGRg=="},
      {type:"scene",children:[{type:"component",jsx:"<img src='data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E' />"}]}
    ]}};
    try{
      const {compiled,assets}=externalizePreviewMedia(input,id,"https://example.org");
      expect(assets).toEqual(["0.wav","1.svg"]);
      expect(compiled.root.children[0].src).toBe("https://example.org/files/_neoy/markcut/generated/"+id+"/0.wav");
      expect(compiled.root.children[1].children[0].jsx).toContain("https://example.org/files/_neoy/markcut/generated/"+id+"/1.svg");
      expect(readFileSync(join(EXPORT_ROOT,"generated",id,"0.wav")).toString("hex")).toBe("52494646");
      expect(JSON.stringify(compiled)).not.toContain("data:");
      expect(input.root.children[0].src).toContain("data:audio/");
    }finally{rmSync(join(EXPORT_ROOT,"generated",id),{recursive:true,force:true});}
  });
  it("rejects a local HTTP media reference",()=>{
    expect(()=>externalizePreviewMedia({src:"http://127.0.0.1:4571/asset"},id,"https://example.org")).toThrow(/HTTPS|local media URL/);
  });
  it("resolves files below NeoY mounts",()=>{
    expect(resolveMountedFile("/tmp/vlog/README.md","https://example.org",{vlog:"/tmp/vlog"})).toBe("https://example.org/files/vlog/README.md");
  });
  it("maps video and image references relative to mounted markdown",()=>{
    const url=resolvePreviewSource("./assets/shot.mp4","/tmp/vlog/runs/20260909","https://example.org",{vlog:"/tmp/vlog"});
    expect(url).toBe("https://example.org/files/vlog/runs/20260909/assets/shot.mp4");
    expect(()=>resolvePreviewSource("../secret.mp4","/tmp/vlog","https://example.org",{vlog:"/tmp/vlog"})).toThrow(/mounted root/);
  });
  it("resolves only allowlisted NeoY Markdown URLs to absolute files",()=>{
    const base=mkdtempSync(join(tmpdir(),"markcut-mount-"));
    const file=join(base,"video.md");
    const outside=join(base,"..","secret.md");
    writeFileSync(file,"# video");
    symlinkSync("/etc/hosts",join(base,"escape.md"));
    try{
      const roots={vlog:base};
      expect(resolvePreviewPath("https://example.org/files/vlog/video.md","https://example.org",roots)).toBe(realpathSync(file));
      expect(resolvePreviewPath("/files/vlog/video.md","https://example.org",roots)).toBe(realpathSync(file));
      expect(()=>resolvePreviewPath("https://other.org/files/vlog/video.md","https://example.org",roots)).toThrow(/Only NeoY/);
      expect(()=>resolvePreviewPath("/files/vlog/escape.md","https://example.org",roots)).toThrow(/escapes/);
      expect(()=>resolvePreviewPath("/files/_neoy/markcut/generated/a.md","https://example.org",roots)).toThrow(/Invalid/);
    }finally{rmSync(base,{recursive:true,force:true});}
  });
  it("publishes hashed player script under NeoY exports",()=>{
    const script=join(EXPORT_ROOT,"test-fixture.js");
    mkdirSync(EXPORT_ROOT,{recursive:true});
    writeFileSync(script,"console.log('test')");
    try{
      const url=publishPlayerBundle(script,"https://example.org");
      expect(url).toMatch(/^https:\/\/example.org\/files\/_neoy\/markcut\/player\/[a-f0-9]{20}\.js$/);
      expect(readFileSync(join(EXPORT_ROOT,"player",url.split("/").pop()!)).toString()).toBe("console.log('test')");
    }finally{rmSync(script,{force:true});}
  });
});
