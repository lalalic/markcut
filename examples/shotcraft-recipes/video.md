# video
seed:2210396671
width:720 height:1280 fps:30 layout:series

## PaperTitle
- component duration:1.833333 jsx:"<PaperTitleCardDemo />"

## Multiplane
- component duration:5.5 jsx:"<MultiplaneDemo />"

## FreezeAnnotate
- component duration:5.266667 jsx:"<FreezeAnnotateDemo />"

~~~js imports
import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate, Easing} from 'remotion';

// Adapted from video-shotcraft recipe paper-title-card, 55 frames.
const FONT = "'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif";
const SERIF = "'Songti SC', 'Noto Serif CJK SC', Georgia, serif";
const ease = Easing.bezier(0.2, 0.75, 0.3, 1);
const out = Easing.bezier(0.45, 0, 0.18, 1);
const bounded = (f, a, b, ev = Easing.linear) => interpolate(f, [a, b], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ev
});
const SWATCH = {paper:'#f4efe5', ink:'#20292a', muted:'#697579', accent:'#b96a49', blue:'#2c637e'};
const badge = (num, name, light=false) => (
  <div style={{position:'absolute',left:42,top:56,display:'flex',gap:14,alignItems:'center',zIndex:12}}>
    <span style={{width:38,height:38,border:'1px solid '+(light?'#d6dedf':'#879395'),borderRadius:19,
      display:'flex',alignItems:'center',justifyContent:'center',
      fontFamily:FONT,fontSize:16,color:light?'#fff':SWATCH.muted}}>{num}</span>
    <span style={{fontSize:20,fontWeight:600,letterSpacing:2,color:light?'#fff':SWATCH.muted,fontFamily:FONT}}>{name}</span>
  </div>
);
const ScenicCard = ({name,kind=0,large=false}) => {
  const palettes=[
    ['#83b0bc','#ddd3bc','#3a5964'],
    ['#a4b4c7','#dbdfd5','#667d7c'],
    ['#bbad92','#e4cba7','#876d60'],
    ['#96b3b1','#dce2d9','#3e6b65']
  ];
  const p=palettes[kind%palettes.length];
  return <div style={{width:'100%',height:'100%',position:'relative',overflow:'hidden',
    background:'linear-gradient(180deg,'+p[0]+' 0%,'+p[1]+' 70%)'}}>
    <svg viewBox="0 0 420 450" preserveAspectRatio="xMidYMid slice" style={{height:'100%',width:'100%',position:'absolute'}}>
      <circle cx={300-kind*35} cy={90+kind*12} r="46" fill="#fff8dc" opacity=".62"/>
      <path d="M0 290 Q90 205 185 265 T420 230 L420 450 L0 450Z" fill={p[2]} opacity=".5"/>
      <path d="M0 345 Q135 270 240 340 T420 315 L420 450 L0 450Z" fill={p[2]} opacity=".75"/>
      <path d="M0 395 Q180 360 420 390 L420 450 L0 450Z" fill="#1f4049" opacity=".8"/>
      {kind%2===0 ? <>
        <path d="M100 375 L115 205 M98 258 L66 235 M112 255 L150 220 M114 300 L170 265" fill="none" stroke="#384d4e" strokeWidth="8" strokeLinecap="round"/>
        <path d="M310 395 L323 150 M321 220 L285 192 M322 260 L360 230" fill="none" stroke="#304c4b" strokeWidth="7" strokeLinecap="round"/>
      </> : <>
        <path d="M20 380 L110 230 L210 380 M105 380 L205 200 L332 380 M234 380 L330 250 L420 380" stroke="#e6dbc7" strokeWidth="8" fill="none" opacity=".7"/>
        <path d="M0 390 Q170 345 420 380" stroke="#f6f0dd" strokeWidth="5" fill="none" opacity=".9"/>
      </>}
    </svg>
    <div style={{position:'absolute',bottom:0,left:0,right:0,padding:large?'28px 26px':'20px 22px',
      background:'linear-gradient(0deg,rgba(15,32,37,.85),transparent)',color:'#fff',fontFamily:FONT,
      fontWeight:650,fontSize:large?39:27}}>{name}</div>
  </div>;
};

export function PaperTitleCardDemo() {
  const f = useCurrentFrame();
  const words = [{t:'给生活',br:true},{t:'加点料',accent:true}];
  const fadeOut=interpolate(f,[47,55],[1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const under=bounded(f,16,34,Easing.bezier(.3,0,.2,1));
  return <AbsoluteFill style={{background:SWATCH.paper,opacity:fadeOut,
    backgroundImage:'radial-gradient(700px 780px at 47% 42%,#fffdf7,transparent 80%)',
    display:'flex',alignItems:'center',justifyContent:'center',fontFamily:SERIF,color:SWATCH.ink}}>
    {badge('01','PAPER TITLE')}
    <div style={{width:625,textAlign:'center',marginTop:-55}}>
      <div style={{fontSize:96,fontWeight:700,lineHeight:1.35,display:'flex',flexWrap:'wrap',
        justifyContent:'center',columnGap:18}}>
        {words.map((w,i)=>{
          const t=bounded(f,4+i*4,13+i*4,ease);
          return <React.Fragment key={i}><span style={{opacity:t,display:'inline-block',
            transform:'scale('+(1.28-.28*t)+')',filter:'blur('+((1-t)*7)+'px)',
            color:w.accent?SWATCH.accent:SWATCH.ink,
            fontStyle:w.accent?'italic':'normal'}}>{w.t}</span>
            {w.br&&<span style={{flexBasis:'100%',height:0}}/>}</React.Fragment>;
        })}
      </div>
      <div style={{height:6,width:220,background:SWATCH.accent,borderRadius:3,margin:'35px auto',
        transform:'scaleX('+under+')'}}/>
      <div style={{fontSize:27,letterSpacing:4,fontFamily:FONT,color:SWATCH.muted,
        opacity:bounded(f,12,25)}}>加拿大 · 周末散步</div>
    </div>
    <div style={{position:'absolute',bottom:72,fontFamily:FONT,fontSize:18,letterSpacing:2,color:SWATCH.muted}}>
      WORD-BY-WORD LETTERPRESS
    </div>
  </AbsoluteFill>;
}

// Adapted from video-shotcraft depth-layer-moves: drive * 0.35 / 0.7 / 1.4, fixed type.
export function MultiplaneDemo() {
  const f=useCurrentFrame();
  const travel=bounded(f,6,136,out);
  const drive=1030*travel;
  const lift=bounded(f,122,144,Easing.out(Easing.cubic));
  const cards=['清晨的街道','沿着小路走','河边的风景','停下来看看','把日子记下来'];
  return <AbsoluteFill style={{background:'#e5e1d7',overflow:'hidden',fontFamily:FONT}}>
    {badge('02','2.5D PARALLAX')}
    <div style={{position:'absolute',inset:0,overflow:'hidden',opacity:.28,filter:'blur(5px) saturate(.7)',
      transform:'translateX('+(-drive*.35)+'px) scale(1.18)'}}>
      <div style={{position:'absolute',top:0,left:-180,width:1800,height:1280,
        background:'linear-gradient(110deg,#a9b4ab,#ebd8b6 40%,#9db9b7 65%,#d3c9ad)'}}/>
      {Array.from({length:10},(_,i)=><div key={i} style={{position:'absolute',
        left:i*200-50,top:390+(i%3)*30,width:120,height:370,background:'#8b9991',borderRadius:20}} />)}
    </div>
    <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(245,242,231,.92),rgba(231,224,209,.7) 70%,rgba(211,197,176,.8))'}}/>
    <div style={{position:'absolute',top:300,left:-316,display:'flex',gap:40,
      transform:'translateX('+(-drive*.7)+'px)'}}>
      {cards.map((name,i)=><div key={name} style={{width:365,height:575,background:'#e7e1d6',
        border:'8px solid #fcf8ed',borderRadius:28,overflow:'hidden',
        transform:i===3?'translateY('+(-18*lift)+'px) scale('+(1+.035*lift)+')':undefined,
        boxShadow:i===3?'0 0 0 '+(4*lift)+'px #b96a49,0 32px 75px rgba(32,41,42,.24)':'0 17px 38px rgba(32,41,42,.18)'}}>
        <ScenicCard name={name} kind={i} large/>
      </div>)}
    </div>
    <div style={{position:'absolute',inset:0,filter:'blur(7px)',opacity:.68,transform:'translateX('+(-drive*1.4)+'px)'}}>
      {['WINTER','WALK','OTTAWA','VLOG'].map((tag,i)=><div key={tag} style={{position:'absolute',
        left:700+i*620,top:860+(i%2)*160,background:i%2?'#2d4c52':'#b96a49',color:'white',
        borderRadius:70,padding:'20px 45px',fontSize:54,whiteSpace:'nowrap'}}>{tag}</div>)}
    </div>
    <div style={{position:'absolute',top:165,left:45,right:45,pointerEvents:'none',zIndex:5}}>
      <div style={{fontSize:70,fontWeight:750,lineHeight:1.14,color:SWATCH.ink,
        textShadow:'0 1px 0 #fff'}}>从街道，<br/>走到河边。</div>
      <div style={{fontSize:27,marginTop:20,color:SWATCH.muted}}>镜头滑行 · 三层视差 · 主角落定</div>
    </div>
    <div style={{position:'absolute',bottom:72,left:45,right:45,fontSize:19,
      color:SWATCH.muted,letterSpacing:1,zIndex:8}}>FAR 0.35×　MID 0.7×　NEAR 1.4×</div>
    {lift>.01&&<div style={{position:'absolute',right:70,top:910,zIndex:10,
      background:SWATCH.accent,color:'white',padding:'13px 23px',borderRadius:30,
      opacity:lift,transform:'translateY('+((1-lift)*25)+'px)',fontSize:21}}>IN FOCUS</div>}
  </AbsoluteFill>;
}

// Adapted from video-shotcraft speed-ramp-freeze: abrupt 70-frame stop,
// 3-frame shutter flash, 10-frame pen circle, smootherstep resume.
export function FreezeAnnotateDemo() {
  const f=useCurrentFrame();
  const freezeStart=43, freezeEnd=113;
  const resume=Math.max(0,Math.min(1,(f-freezeEnd)/25));
  const smooth=resume*resume*resume*(resume*(resume*6-15)+10);
  const sourceFrame=f<freezeStart?f*1.28:f<freezeEnd?freezeStart*1.28:freezeStart*1.28+smooth*52+(f-freezeEnd>25?(f-freezeEnd-25)*1.6:0);
  const x=225-sourceFrame*14;
  const paused=f>=freezeStart&&f<freezeEnd;
  const inkOut=f<freezeEnd-8?1:1-bounded(f,freezeEnd-8,freezeEnd);
  const mark=bounded(f,53,63);
  const note=bounded(f,69,80,Easing.out(Easing.cubic))*inkOut;
  return <AbsoluteFill style={{background:'#edf3f3',overflow:'hidden',fontFamily:FONT}}>
    {badge('03','FREEZE & ANNOTATE')}
    <div style={{position:'absolute',top:170,left:42,fontWeight:800,fontSize:72,lineHeight:1.15,
      color:SWATCH.ink}}>拍到这一刻，<br/><span style={{color:SWATCH.blue}}>停一下。</span></div>
    <div style={{position:'absolute',top:385,left:42,fontSize:25,color:SWATCH.muted}}>流动 → 定格圈注 → 解冻</div>
    <div style={{position:'absolute',top:540,left:0,height:440,display:'flex',gap:26,
      transform:'translateX('+x+'px)'}}>
      {['路口','雪后的公园','河边','日落','回家的路'].map((name,i)=><div key={i}
        style={{width:355,height:430,borderRadius:25,overflow:'hidden',background:'white',
          boxShadow:i===2&&paused?'0 15px 65px rgba(44,99,126,.31)':'0 12px 33px rgba(30,49,53,.17)',
          transform:i===2&&paused?'translateY(-12px) scale(1.04)':undefined,
          opacity:paused&&i!==2?.62:1,filter:paused&&i!==2?'saturate(.5)':'none'}}>
        <ScenicCard name={name} kind={i} large />
      </div>)}
    </div>
    <div style={{position:'absolute',top:500,left:42,right:42,display:'flex',justifyContent:'space-between',
      fontSize:23,fontFamily:'monospace',fontWeight:700,color:paused?SWATCH.blue:SWATCH.accent}}>
      <span>{paused?'❚❚ PAUSED':'● LIVE'}</span>
      <span>{paused?'00:00:01:13':'REC • '+String(Math.floor(f/30)).padStart(2,'0')+':'+String(f%30).padStart(2,'0')}</span>
    </div>
    {paused&&<svg viewBox="0 0 720 1280" style={{position:'absolute',inset:0,zIndex:6,width:'100%',height:'100%',pointerEvents:'none'}}>
      <rect x="142" y="575" width="436" height="370" fill="none" stroke="#2c637e" strokeWidth="4" strokeDasharray="14 13" opacity=".42"/>
      <path d="M155 600 C175 510 535 520 560 660 C610 820 520 970 330 960 C130 965 110 810 155 600"
        fill="none" stroke="#2c637e" strokeWidth="12" strokeLinecap="round"
        strokeDasharray="1450" strokeDashoffset={1450*(1-mark)} opacity={inkOut}/>
      <path d="M560 870 Q620 875 625 970 L604 950 M625 970 L639 945"
        fill="none" stroke="#2c637e" strokeWidth="8" strokeLinecap="round"
        strokeDasharray="200" strokeDashoffset={200*(1-bounded(f,68,77))} opacity={inkOut}/>
    </svg>}
    {paused&&<div style={{position:'absolute',bottom:110,left:60,right:60,opacity:note,
      transform:'translateY('+((1-note)*20)+'px)',textAlign:'center',color:SWATCH.blue,zIndex:8}}>
      <div style={{fontSize:59,fontWeight:800}}>这一帧值得留下</div>
      <div style={{height:7,width:240,background:SWATCH.blue,margin:'16px auto',borderRadius:8}}/>
      <div style={{fontSize:24,marginTop:23,color:SWATCH.muted}}>FREEZE THE MOMENT</div>
    </div>}
    {f>=freezeStart&&f<freezeStart+3&&<div style={{position:'absolute',inset:0,background:'white',
      opacity:(1-(f-freezeStart)/3)*.62,zIndex:11}}/>}
    {!paused&&<div style={{position:'absolute',bottom:70,left:45,fontSize:21,color:SWATCH.muted}}>
      {f<freezeStart?'MOTION →':'→ RESUME'}
    </div>}
  </AbsoluteFill>;
}
~~~
