---
width: 1080
height: 1920
fps: 30
---
# video
seed:3438203482
layout:series
title:"Reusable motion capabilities · vertical"

## cinematic-push
id:cinematic-push
- component duration:3 jsx:"<CinematicPush eyebrow='SHOT 01' title='Arrive at the idea' tone='#64d9c6' />"

## tilted-panel-glide
id:tilted-panel-glide
- component duration:3 jsx:"<TiltedPanelGlide title='A fixed camera. A moving panel.' detail='Use for a deliberate product or place reveal.' tone='#ffbd66' />"

## layered-card-reveal
id:layered-card-reveal
- component duration:3 jsx:"<LayeredCardReveal title='One system, three parts' items={['Plan','Build','Ship']} />"

## kinetic-caption
id:kinetic-caption
- component duration:3 jsx:"<KineticCaption words={['Make','the','key','idea','land.']} accent='#64d9c6' />"

## bar-chart-reveal
id:bar-chart-reveal
- component duration:3 jsx:"<BarChartReveal title='Weekly reach' labels={['Mon','Wed','Fri']} values={[32,58,91]} />"

## metric-count-up
id:metric-count-up
- component duration:3 jsx:"<MetricCountUp value={84} label='minutes saved each week' suffix=' min' />"

~~~js imports
import {interpolate, useCurrentFrame} from "remotion"

const shell = {width:'100%',height:'100%',boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',padding:72,background:'linear-gradient(155deg,#101722,#1c2938 58%,#0d1118)',color:'#f5f3ec',fontFamily:'Arial,sans-serif'}
const card = {width:'100%',padding:56,borderRadius:36,background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.2)',boxShadow:'0 28px 90px rgba(0,0,0,.32)'}

export function CinematicPush({eyebrow,title,tone='#64d9c6'}) {
  const f=useCurrentFrame(); const p=interpolate(f,[0,90],[0,1],{extrapolateRight:'clamp'});
  return <div style={{...shell,overflow:'hidden'}}><div style={{...card,transform:`scale(${1.22-.22*p}) translateY(${36-36*p}px)`,borderColor:tone}}><div style={{color:tone,fontSize:26,letterSpacing:5}}>{eyebrow}</div><div style={{fontSize:82,lineHeight:1.05,fontWeight:700,marginTop:32}}>{title}</div><div style={{height:5,width:`${25+55*p}%`,background:tone,marginTop:42,borderRadius:5}} /></div></div>
}

export function TiltedPanelGlide({title,detail,tone='#ffbd66'}) {
  const f=useCurrentFrame(); const x=interpolate(f,[0,90],[240,-100],{extrapolateRight:'clamp'});
  return <div style={{...shell,overflow:'hidden',perspective:1100}}><div style={{...card,transform:`translateX(${x}px) rotateY(-28deg) rotateZ(-2deg)`,transformOrigin:'left center',borderLeft:`12px solid ${tone}`}}><div style={{fontSize:67,lineHeight:1.1,fontWeight:700}}>{title}</div><div style={{fontSize:30,lineHeight:1.4,opacity:.76,marginTop:38}}>{detail}</div></div></div>
}

export function LayeredCardReveal({title,items}) {
  const f=useCurrentFrame(); const p=interpolate(f,[0,55],[0,1],{extrapolateRight:'clamp'});
  return <div style={{...shell,flexDirection:'column',gap:24}}><div style={{fontSize:54,fontWeight:700,marginBottom:26,textAlign:'center'}}>{title}</div>{items.map((item,i)=>{const y=(2-i)*90*(1-p);const rotate=(i-1)*8*(1-p);return <div key={item} style={{...card,padding:38,width:'86%',transform:`translateY(${y}px) rotate(${rotate}deg)`,background:['#21443f','#293850','#49384f'][i],fontSize:48,fontWeight:700}}><span style={{color:'#64d9c6',marginRight:24}}>0{i+1}</span>{item}</div>})}</div>
}

export function KineticCaption({words,accent='#64d9c6'}) {
  const f=useCurrentFrame();
  return <div style={{...shell,background:'linear-gradient(180deg,#101722 10%,#202c3b 100%)'}}><div style={{...card,textAlign:'center',fontSize:88,lineHeight:1.25,fontWeight:700}}>{words.map((word,i)=>{const opacity=interpolate(f,[i*12,i*12+10],[.15,1],{extrapolateRight:'clamp'});return <span key={`${word}-${i}`} style={{opacity,color:opacity>.9?accent:'#f5f3ec',marginRight:18}}>{word}</span>})}</div></div>
}

export function BarChartReveal({title,labels,values}) {
  const f=useCurrentFrame();
  return <div style={{...shell,flexDirection:'column',alignItems:'stretch'}}><div style={{fontSize:64,fontWeight:700,marginBottom:52}}>{title}</div><div style={{height:760,display:'flex',alignItems:'end',justifyContent:'space-around',borderBottom:'2px solid rgba(255,255,255,.35)',padding:'0 20px'}}>{values.map((value,i)=>{const h=interpolate(f,[0,75],[0,value*6],{extrapolateRight:'clamp'});return <div key={labels[i]} style={{height:h,width:190,background:['#64d9c6','#78a8ff','#ffbd66'][i],borderRadius:'18px 18px 0 0',display:'flex',alignItems:'start',justifyContent:'center',paddingTop:18,fontSize:30,fontWeight:700,color:'#101722'}}>{value}%</div>})}</div><div style={{display:'flex',justifyContent:'space-around',fontSize:30,marginTop:22}}>{labels.map(label=><span key={label}>{label}</span>)}</div></div>
}

export function MetricCountUp({value,label,suffix=''}) {
  const f=useCurrentFrame(); const count=Math.round(interpolate(f,[0,75],[0,value],{extrapolateRight:'clamp'}));
  return <div style={{...shell,flexDirection:'column',textAlign:'center'}}><div style={{fontSize:210,fontWeight:800,color:'#64d9c6',lineHeight:1}}>{count}{suffix}</div><div style={{fontSize:48,marginTop:32,maxWidth:720,lineHeight:1.25}}>{label}</div><div style={{fontSize:24,letterSpacing:5,opacity:.58,marginTop:58}}>A MOTION STUDY</div></div>
}
~~~
