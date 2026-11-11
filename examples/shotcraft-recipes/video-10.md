# video
seed:2210396671
width:720 height:1280 fps:30 layout:series

## PaperTitle
- component duration:1.833333 jsx:"<PaperTitleCardDemo />"

## Multiplane
- component duration:5.5 jsx:"<MultiplaneDemo />"

## FreezeAnnotate
- component duration:5.266667 jsx:"<FreezeAnnotateDemo />"

## Letterspace
- component duration:3.7333333333333334 jsx:"<LetterspaceDemo />"

## BlurSlide
- component duration:4.0 jsx:"<BlurSlideDemo />"

## MosaicReframe
- component duration:7.133333333333334 jsx:"<MosaicReframeDemo />"

## CardFlip
- component duration:5.0 jsx:"<CardFlipDemo />"

## PageTurn
- component duration:5.0 jsx:"<PageTurnDemo />"

## CraneRise
- component duration:5.5 jsx:"<CraneRiseDemo />"

## GrainDissolve
- component duration:3.0 jsx:"<GrainDissolveDemo />"

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

// Shotcraft "letterspace-materialize": shared path-length pen progress,
// large letter spacing, 15f pre-hold and >30f final stillness.
export function LetterspaceDemo() {
  const f=useCurrentFrame();
  const pen=bounded(f,16,68,Easing.inOut(Easing.cubic));
  const paths=[
    'M12 18 L46 112 L80 18',
    'M12 18 L12 112 L83 112',
    'M47 18 C-12 18 -12 112 47 112 C106 112 106 18 47 18 Z',
    'M84 43 C65 10 9 11 7 65 C6 126 69 130 84 93 L84 78 L49 78'
  ];
  return <AbsoluteFill style={{background:'linear-gradient(145deg,#182d37 0%,#315767 54%,#b38d76 100%)',
    fontFamily:FONT,color:'#f6eee1',overflow:'hidden'}}>
    <div style={{position:'absolute',left:0,top:550,right:0,height:620,
      background:'linear-gradient(175deg,transparent,rgba(16,27,34,.6))'}}/>
    <svg style={{position:'absolute',width:720,height:650,bottom:0}} viewBox="0 0 720 650">
      <path d="M0 425 L105 340 L205 385 L348 295 L515 395 L600 335 L720 412 L720 650 L0 650Z" fill="#102934" opacity=".55"/>
      <path d="M0 495 L180 408 L330 470 L555 385 L720 460 L720 650 L0 650Z" fill="#143b45" opacity=".7"/>
      <path d="M0 560 Q210 530 365 565 T720 550" stroke="#efe3ca" strokeWidth="3" opacity=".4" fill="none"/>
    </svg>
    {badge('04','LETTERSPACE',true)}
    <svg viewBox="0 0 720 210" style={{position:'absolute',top:420,left:0,width:720,height:210,overflow:'visible'}}>
      {paths.map((d,i)=><path key={i} d={d} transform={'translate('+(105+i*145)+' 0) scale(1.05 1.05)'}
        fill="none" stroke="#f3e9dc" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round"
        pathLength={1} strokeDasharray={1} strokeDashoffset={1-pen}
        opacity={.18+.82*pen}/>)}
    </svg>
    <div style={{position:'absolute',top:675,left:0,right:0,textAlign:'center',
      fontSize:32,letterSpacing:6,opacity:bounded(f,64,83),fontWeight:350}}>给生活加点料</div>
    <div style={{position:'absolute',bottom:87,left:0,right:0,textAlign:'center',
      fontSize:19,letterSpacing:4,opacity:bounded(f,74,91)}}>SIMULTANEOUS STROKE REVEAL</div>
  </AbsoluteFill>;
}

// Shotcraft "blur-slide": semantic word groups share identical progress for
// blur, Y lift and opacity. Secondary text overlaps title entrance.
export function BlurSlideDemo() {
  const f=useCurrentFrame();
  const words=[['平凡','的','周末'],['也','值得','记录']];
  const parts=['走走','看看','听听风声','再记下来'];
  const main=words.flat();
  let i=0;
  const qw=(word,index,isHero=false)=>{
    const p=bounded(f,10+index*4,32+index*4,Easing.out(Easing.poly(5)));
    return <span key={index} style={{display:'inline-block',opacity:p,
      transform:'translateY('+((1-p)*64)+'px)',filter:'blur('+((1-p)*18)+'px)',
      fontStyle:isHero?'italic':'normal',color:isHero?SWATCH.accent:SWATCH.ink}}>{word}</span>;
  };
  return <AbsoluteFill style={{background:'#f6eee1',fontFamily:SERIF,color:SWATCH.ink,overflow:'hidden'}}>
    {badge('05','BLUR SLIDE')}
    <div style={{position:'absolute',right:-45,top:120,fontFamily:SERIF,fontSize:500,
      color:'rgba(32,41,42,.055)',transform:'translateX('+(-32*bounded(f,0,120))+')'}}>05</div>
    <div style={{position:'absolute',top:338,left:57,right:38}}>
      <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:92,fontWeight:680,lineHeight:1.5}}>
        {words[0].map(word=>qw(word,i++))}
      </div>
      <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:92,fontWeight:680,lineHeight:1.48}}>
        {words[1].map(word=>qw(word,i++,word==='记录'))}
      </div>
      <div style={{display:'flex',gap:15,flexWrap:'wrap',marginTop:47,fontSize:34,fontFamily:FONT,
        color:SWATCH.muted,maxWidth:585,lineHeight:1.65}}>
        {parts.map((word,j)=>{
          const p=bounded(f,34+j*4,54+j*4,Easing.out(Easing.poly(5)));
          return <span key={j} style={{opacity:p,transform:'translateY('+((1-p)*26)+'px)',
            filter:'blur('+((1-p)*9)+'px)'}}>{word}</span>;
        })}
      </div>
      <div style={{height:2,background:SWATCH.accent,marginTop:45,
        transformOrigin:'left',transform:'scaleX('+bounded(f,72,95)+')'}}/>
    </div>
    <div style={{position:'absolute',bottom:73,left:57,fontSize:19,
      color:SWATCH.muted,fontFamily:FONT,letterSpacing:2}}>WORD STAGGER · BLUR + LIFT + OPACITY</div>
  </AbsoluteFill>;
}

// Shotcraft "mosaic-reframe": 12 independent layout interpolations,
// A=regular grid, B=feature mosaic, C=diagonal waterfall with hold windows.
export function MosaicReframeDemo() {
  const f=useCurrentFrame();
  const names=['晨光','脚步','街角','路灯','树影','河流','小桥','晚霞','晴空','林间','远山','归程'];
  const mix=(a,b,t)=>a+(b-a)*t;
  return <AbsoluteFill style={{background:'#dce5df',fontFamily:FONT,overflow:'hidden'}}>
    {badge('06','MOSAIC REFRAME')}
    <div style={{position:'absolute',top:158,left:50,fontSize:63,fontWeight:760,color:'#243c3c'}}>把片段排成故事</div>
    <div style={{position:'absolute',top:239,left:50,fontSize:23,color:SWATCH.muted}}>
      {f<96?'GRID → FEATURE':f<175?'FEATURE → CASCADE':'CASCADE · HOLD'}</div>
    {names.map((name,i)=>{
      const col=i%3,row=Math.floor(i/3);
      const a={x:49+col*207,y:310+row*191,w:194,h:175,rot:0};
      const b=i===0?{x:50,y:305,w:394,h:391,rot:0}
        :i===1?{x:463,y:305,w:206,h:185,rot:0}
        :i===2?{x:463,y:511,w:206,h:185,rot:0}
        :{x:50+((i-3)%3)*207,y:710+Math.floor((i-3)/3)*155,w:194,h:141,rot:0};
      const c={x:20+i*49,y:185+i*80,w:275,h:335,rot:-17+i*2.3};
      const p1=bounded(f,56+i*.7,82+i*.7,Easing.inOut(Easing.cubic));
      const p2=bounded(f,132+i*1.1,162+i*1.1,Easing.inOut(Easing.cubic));
      const trans=k=>mix(mix(a[k],b[k],p1),c[k],p2);
      return <div key={name} style={{position:'absolute',left:trans('x'),top:trans('y'),
        width:trans('w'),height:trans('h'),borderRadius:14,overflow:'hidden',
        border:'5px solid #f9f6ee',boxShadow:'0 10px 25px rgba(30,45,43,.24)',
        transform:'rotate('+trans('rot')+'deg)',zIndex:i+1}}>
        <ScenicCard name={name} kind={i} />
      </div>;
    })}
  </AbsoluteFill>;
}

// Shotcraft "card-flip-reveal": 4f prep -> 16f flip 194deg overshoot
// -> 12f spring-like settle, staggered 12f, 3D faces and angle-linked shading.
export function CardFlipDemo() {
  const f=useCurrentFrame();
  const details=[['出发','01','走出去'],['沿途','02','看风景'],['回味','03','再出发']];
  const start=24;
  return <AbsoluteFill style={{background:'linear-gradient(180deg,#19242d 0%,#31434c 65%,#192932 100%)',
    fontFamily:FONT,color:'#f8f2e8',overflow:'hidden'}}>
    {badge('07','CARD FLIP',true)}
    <div style={{position:'absolute',top:165,left:47,right:47,fontWeight:740,fontSize:66}}>把一天，翻成三页。</div>
    <div style={{position:'absolute',top:280,left:48,fontSize:27,color:'#bfc9c5'}}>每张卡片都藏着下一段故事</div>
    {details.map(([front,num,back],i)=>{
      const st=start+12*i;
      const pre=bounded(f,st,st+4,Easing.out(Easing.cubic));
      const flip=bounded(f,st+4,st+20,Easing.bezier(.55,0,.3,1));
      const settle=bounded(f,st+20,st+32,Easing.out(Easing.cubic));
      const angle=f<st+4?-10*pre:f<st+20?-10+204*flip:194-14*settle;
      const shade=.38*(1-Math.abs(Math.cos(angle*Math.PI/180)));
      return <div key={num} style={{position:'absolute',left:42+i*214,top:438,
        width:204,height:402,perspective:1300}}>
        <div style={{width:'100%',height:'100%',position:'relative',
          transformStyle:'preserve-3d',
          transform:'rotateY('+angle+'deg) translateZ('+(55*Math.abs(Math.sin(angle*Math.PI/180)))+'px)',
          borderRadius:18,boxShadow:'0 20px 30px rgba(0,0,0,.28)'}}>
          <div style={{position:'absolute',inset:0,backfaceVisibility:'hidden',
            borderRadius:18,overflow:'hidden',border:'5px solid #63747b'}}>
            <ScenicCard name={front} kind={i} />
          </div>
          <div style={{position:'absolute',inset:0,backfaceVisibility:'hidden',
            transform:'rotateY(180deg)',background:'#f1ecdf',
            border:'5px solid #fdf7e8',borderRadius:18,
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            color:'#223d47'}}>
            <div style={{fontFamily:SERIF,fontSize:112,fontWeight:800}}>{num}</div>
            <div style={{marginTop:20,fontSize:27,fontWeight:700}}>{back}</div>
          </div>
          <div style={{position:'absolute',inset:0,borderRadius:18,pointerEvents:'none',
            background:'rgba(5,18,23,'+shade+')',
            backfaceVisibility:'hidden'}}/>
          <div style={{position:'absolute',top:10,bottom:10,left:'49%',width:9,
            opacity:Math.max(0,1-Math.abs(angle-90)/36),
            background:'linear-gradient(90deg,transparent,#fff9cb,transparent)',
            transform:'translateZ(4px)'}}/>
        </div>
      </div>;
    })}
    <div style={{position:'absolute',bottom:174,left:60,right:60,height:2,background:'#6b8086',opacity:.4}}/>
    <div style={{position:'absolute',bottom:116,left:48,right:48,textAlign:'center',
      fontSize:21,letterSpacing:3,color:'#d6d4c9'}}>FRONT → SPINE HIGHLIGHT → REVEAL</div>
  </AbsoluteFill>;
}

const StoryPage=({second})=><div style={{position:'absolute',inset:0,fontFamily:FONT,
  background:second?'#e1ece7':'#ede4d3',overflow:'hidden'}}>
  <div style={{position:'absolute',top:215,left:60,right:60,fontSize:60,fontWeight:800,
    color:SWATCH.ink}}>{second?'暮色，慢慢落下来':'天亮，街道还很静'}</div>
  <div style={{position:'absolute',top:318,left:60,fontSize:27,
    color:SWATCH.muted}}>{second?'THE EVENING WALK':'THE MORNING WALK'}</div>
  <div style={{position:'absolute',top:400,left:47,width:626,height:615,
    border:'12px solid #faf7ee',borderRadius:24,overflow:'hidden',
    boxShadow:'0 27px 60px rgba(20,40,35,.24)'}}>
    <ScenicCard name={second?'最后一段路':'第一段路'} kind={second?2:0} large/>
  </div>
  <div style={{position:'absolute',bottom:145,left:60,fontSize:32,color:SWATCH.muted}}>不是赶路，是记录。</div>
</div>;

// Shotcraft "page-turn-transitions" — barn door split with seam cue,
// 24f accelerated exit and 36f incoming-page settle.
export function PageTurnDemo() {
  const f=useCurrentFrame();
  const seam=bounded(f,20,45,Easing.out(Easing.cubic));
  const open=bounded(f,44,68,Easing.bezier(.42,0,.8,.25));
  const settle=bounded(f,46,82,Easing.out(Easing.cubic));
  const slide=900*open;
  return <AbsoluteFill style={{background:'#dde8e3',overflow:'hidden',fontFamily:FONT}}>
    <div style={{position:'absolute',inset:0,transform:'scale('+(1.08-.08*settle)+')'}}>
      <StoryPage second/>
    </div>
    <div style={{position:'absolute',inset:0,clipPath:'inset(0 50% 0 0)',
      transform:'translateX('+(-slide)+'px)'}}><StoryPage/></div>
    <div style={{position:'absolute',inset:0,clipPath:'inset(0 0 0 50%)',
      transform:'translateX('+slide+'px)'}}><StoryPage/></div>
    <div style={{position:'absolute',left:359,top:0,width:4,height:1280,
      transform:'scaleY('+seam+')',transformOrigin:'center',opacity:1-open,
      background:'#f3dfb3',boxShadow:'0 0 30px 7px rgba(242,212,159,.6)'}}/>
    <div style={{position:'absolute',left:0,top:0,width:720,height:1280,
      pointerEvents:'none',opacity:.5*(1-bounded(f,68,95))*open,
      background:'radial-gradient(ellipse at 50% 50%,rgba(255,247,216,.85),transparent 73%)'}}/>
    {badge('08','BARN DOOR')}
    <div style={{position:'absolute',bottom:55,left:60,fontSize:20,fontWeight:650,
      letterSpacing:2,color:SWATCH.ink}}>PAGE SPLIT · LIGHT SEAM · NEW SCENE</div>
  </AbsoluteFill>;
}

// Shotcraft "crane-rise-reveal": a single 3x→1x 102f camera move about
// a tracked row, anchored camera translation and a >30f final hold.
export function CraneRiseDemo() {
  const f=useCurrentFrame();
  const fly=bounded(f,24,126,Easing.bezier(.2,0,.25,1));
  const scale=3-2*fly;
  const tx=360-360*scale;
  const ty=720-720*scale;
  const names=['踏出家门','安静的街道','在桥上停留','看一眼河面','沿着路回家'];
  const focus=bounded(f,24,50,Easing.out(Easing.cubic));
  return <AbsoluteFill style={{background:'#cddcda',overflow:'hidden',fontFamily:FONT}}>
    <div style={{position:'absolute',inset:0,transformOrigin:'top left',
      transform:'translate('+tx+'px,'+ty+'px) scale('+scale+')'}}>
      <div style={{position:'absolute',left:38,top:170,width:644,height:940,
        background:'#f5f2e8',boxShadow:'0 25px 65px rgba(35,69,72,.28)',borderRadius:24}}>
        <div style={{position:'absolute',top:39,left:35,fontSize:36,fontWeight:780,color:SWATCH.ink}}>一段路的五个瞬间</div>
        <div style={{position:'absolute',top:97,left:35,fontSize:20,color:SWATCH.muted}}>WALK JOURNAL / 5 MOMENTS</div>
        {names.map((name,i)=><div key={name} style={{position:'absolute',left:28,right:28,
          top:161+i*146,height:130,borderRadius:17,overflow:'hidden',
          display:'flex',alignItems:'center',gap:23,padding:12,
          background:i===2?'#d8e7e4':'#eae8e0',
          opacity:i===2?1:.38+.62*focus,
          boxShadow:i===2?'0 0 0 2px #2c637e':'none'}}>
          <div style={{width:115,height:105,flexShrink:0,borderRadius:12,overflow:'hidden'}}><ScenicCard name="" kind={i}/></div>
          <div><div style={{fontSize:30,fontWeight:750,color:SWATCH.ink}}>{name}</div>
            <div style={{fontSize:18,marginTop:12,color:SWATCH.muted}}>MOMENT 0{i+1}</div></div>
          {i===2&&<div style={{marginLeft:'auto',width:14,height:14,borderRadius:7,background:'#2c637e',
            boxShadow:'0 0 0 7px rgba(44,99,126,.13)'}}/>}
        </div>)}
      </div>
    </div>
    {badge('09','CRANE RISE')}
    <div style={{position:'absolute',bottom:63,left:48,right:48,fontSize:21,
      color:SWATCH.muted,letterSpacing:2,opacity:bounded(f,125,148)}}>
      ONE CAMERA MOVE · 3.0× TO 1.0×
    </div>
  </AbsoluteFill>;
}

// Shotcraft "grain-dissolve": turbulence + displacement + gaussian blur,
// swap the statement at peak noise and settle into a crisp short wordmark.
export function GrainDissolveDemo() {
  const f=useCurrentFrame();
  const burst=bounded(f,9,19,Easing.out(Easing.cubic));
  const lock=bounded(f,47,62,Easing.inOut(Easing.cubic));
  const cross=bounded(f,42,52,Easing.inOut(Easing.cubic));
  const scale=52*burst*(1-lock);
  const grainBlur=1.1*burst*(1-lock);
  const selected=bounded(f,10,18)*(1-bounded(f,40,49));
  return <AbsoluteFill style={{background:'radial-gradient(ellipse at 49% 47%,#233f4a,#111b25 80%)',
    fontFamily:FONT,overflow:'hidden'}}>
    {badge('10','GRAIN DISSOLVE',true)}
    <svg viewBox="0 0 720 1280" width="720" height="1280" style={{position:'absolute',inset:0}}>
      <defs>
        <filter id="shotcraftGrain10" x="-30%" y="-90%" width="160%" height="280%">
          <feTurbulence baseFrequency={.9+.4*burst} type="fractalNoise"
            numOctaves={1} seed={Math.floor(f*.85)} result="grain"/>
          <feDisplacementMap in="SourceGraphic" in2="grain"
            scale={scale} xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation={grainBlur}/>
        </filter>
        <pattern id="shotcraftStripe10" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#d5d8d4" strokeWidth="4" opacity=".5"/>
        </pattern>
      </defs>
      <rect x="65" y="505" width="590" height="206" fill="url(#shotcraftStripe10)" opacity={selected*.13}/>
      <rect x="65" y="505" width="590" height="206" stroke="#dbe8e7"
        strokeWidth="2" fill="none" strokeDasharray="8 8" opacity={selected*.8}/>
      <g filter="url(#shotcraftGrain10)" textAnchor="middle" fill="#f1f7f5" fontWeight="750">
        <text x="360" y="643" fontSize="59" opacity={1-cross}>今天的路，记住了</text>
        <text x="360" y="648" fontSize="108" opacity={cross}
          style={{filter:'drop-shadow(0 0 14px rgba(238,250,249,.6))'}}>下次见</text>
      </g>
      <circle cx="360" cy="658" r={160*burst*(1-lock)} fill="none" stroke="#d7e8e3"
        opacity={.18*burst*(1-lock)} strokeWidth="2"/>
    </svg>
    <div style={{position:'absolute',bottom:160,left:0,right:0,textAlign:'center',
      fontSize:29,color:'#e6e5d9',opacity:bounded(f,58,75)}}>生活，还在继续。</div>
    <div style={{position:'absolute',bottom:84,left:0,right:0,textAlign:'center',
      fontSize:19,color:'#94b2af',letterSpacing:2}}>NOISE → DISPLACE → REFORM</div>
  </AbsoluteFill>;
}

~~~
