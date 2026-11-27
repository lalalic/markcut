import {describe,it,expect,afterEach} from "vitest";
import {mkdtempSync,existsSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {isLocalModelExecution} from "../src/config.mjs";
import {generateTTI,generateSTT} from "../src/render/cli-tools.ts";

const folders: string[]=[];
afterEach(async()=>{
  for(const home of folders.splice(0)) {
    const pidPath=join(home,'queue','worker.lock','pid');
    if(existsSync(pidPath)) {
      const pid=Number(readFileSync(pidPath,'utf8'));
      if(pid>1)try{process.kill(pid,'SIGTERM');}catch{}
      await new Promise(resolve=>setTimeout(resolve,180));
    }
    rmSync(home,{recursive:true,force:true});
  }
  delete process.env.MARKCUT_QUEUE_HOME;
  delete process.env.MARKCUT_QUEUE_ENABLED;
});
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'markcut-execution-kind-'));
  folders.push(root);
  process.env.MARKCUT_QUEUE_HOME=join(root,'queue');
  delete process.env.MARKCUT_QUEUE_ENABLED;
  return root;
}
function sql() {
  const db=join(process.env.MARKCUT_QUEUE_HOME!,'queue.sqlite');
  const program='const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(JSON.stringify(db.prepare("SELECT status,timeout,code FROM jobs").all()));db.close()';
  return JSON.parse(execFileSync(process.execPath,['-e',program,db],{encoding:'utf8'}));
}

describe('local model queue policy, independent of CLI template',()=>{
  it('honors explicit local or direct metadata; never detects by shell text',()=>{
    expect(isLocalModelExecution('TTI',false,{MARKCUT_TTI_EXECUTION:'local'})).toBe(true);
    expect(isLocalModelExecution('TTI',true,{MARKCUT_TTI_EXECUTION:'direct'})).toBe(false);
    expect(isLocalModelExecution('TTI',false,{})).toBe(false);
    expect(isLocalModelExecution('TTI',true,{})).toBe(true);
    expect(()=>isLocalModelExecution('TTI',false,{MARKCUT_TTI_EXECUTION:'other'})).toThrow(/Invalid/);
  });
  it('direct TTI and STT execute without ever opening the local queue',async()=>{
    const root=fixture();
    const png=join(root,'direct.png');
    expect(generateTTI('prompt',png,'printf direct > "{output}"',0,{localModel:false})).toBe(png);
    await generateSTT(join(root,'audio.wav'),root,'true',{localModel:false});
    expect(existsSync(join(root,'queue','queue.sqlite'))).toBe(false);
  });
  it('explicit local TTI and STT use same queue and store successful results',async()=>{
    const root=fixture();
    const png=join(root,'local.png');
    expect(generateTTI('prompt',png,'printf local > "{output}"',0,{localModel:true})).toBe(png);
    await generateSTT(join(root,'audio.wav'),root,'true',{localModel:true});
    expect(sql()).toEqual([
      {status:'completed',timeout:0,code:0},
      {status:'completed',timeout:0,code:0},
    ]);
  });
});
