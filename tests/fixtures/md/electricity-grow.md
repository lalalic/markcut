# video
seed:1793769080
width:640 height:480 fps:30 layout:series

## Title
layout:parallel
- component duration:3
  ~~~jsx jsx
  <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0c0c1d,#1a1a3e)'}}>
    <h1 style={{color:'#ffd700',fontSize:36,margin:0}}>Global Electricity Generation</h1>
    <p style={{color:'#88ccff',fontSize:20,marginTop:10}}>1985 → 2025</p>
    <p style={{color:'#aaa',fontSize:14,marginTop:20}}>Data: Ember / Energy Institute (Our World in Data)</p>
  </div>
  ~~~

## ChinaSurge
layout:parallel
- component duration:6
  ~~~jsx jsx
  <div style={{width:'100%',height:'100%',background:'#0c0c1d',padding:20,fontFamily:'Arial,sans-serif'}}>
    <h2 style={{color:'#ffd700',fontSize:18,textAlign:'center',margin:'0 0 10px 0'}}>China's Electricity Generation (TWh)</h2>
    <svg viewBox='0 0 580 380' width='100%' height='85%'>
      {[1985,1990,1995,2000,2005,2010,2015,2020,2025].map((year,i)=>(
        <g key={year}>
          <rect x={20+i*62} y={350-tween(0,{1985:42,1990:63,1995:97,2000:137,2005:253,2010:425,2015:625,2020:786,2025:1069}[year])} width={42} height={tween(0,{1985:42,1990:63,1995:97,2000:137,2005:253,2010:425,2015:625,2020:786,2025:1069}[year])} fill='#ff4444' rx={3} />
          <text x={20+i*62+21} y={365} textAnchor='middle' fill='#aaa' fontSize={9}>{year}</text>
          <text x={20+i*62+21} y={345-tween(0,{1985:42,1990:63,1995:97,2000:137,2005:253,2010:425,2015:625,2020:786,2025:1069}[year])} textAnchor='middle' fill='#ff8888' fontSize={9}>{Math.round({1985:411,1990:621,1995:928,2000:1356,2005:2500,2010:4207,2015:6186,2020:7779,2025:10583}[year])}</text>
        </g>
      ))}
      <text x={10} y={20} fill='#666' fontSize={10}>TWh</text>
    </svg>
  </div>
  ~~~

## World1985
layout:parallel
- component duration:5
  ~~~jsx jsx
  <div style={{width:'100%',height:'100%',background:'#0c0c1d',padding:20,fontFamily:'Arial,sans-serif'}}>
    <h2 style={{color:'#ffd700',fontSize:18,textAlign:'center',margin:'0 0 10px 0'}}>Electricity Generation in 1985 (TWh)</h2>
    <svg viewBox='0 0 580 380' width='100%' height='85%'>
      {[
        {name:'USA',val:2657,color:'#4477ff',scale:266},
        {name:'Russia',val:962,color:'#cc4444',scale:96},
        {name:'Japan',val:672,color:'#44cc44',scale:67},
        {name:'Germany',val:523,color:'#ffaa00',scale:52},
        {name:'Canada',val:459,color:'#ff66aa',scale:46},
        {name:'France',val:344,color:'#aa66ff',scale:34},
        {name:'UK',val:298,color:'#66cccc',scale:30},
        {name:'Brazil',val:194,color:'#66ff66',scale:19},
        {name:'India',val:186,color:'#ff8844',scale:19},
        {name:'China',val:411,color:'#ff4444',scale:41},
      ].map((c,i)=>(
        <g key={c.name}>
          <rect x={20+i*54} y={350-tween(0,c.scale)} width={40} height={tween(0,c.scale)} fill={c.color} rx={3}>
            <animate attributeName='opacity' values='0;1' dur='2s' fill='freeze'/>
          </rect>
          <text x={20+i*54+20} y={365} textAnchor='middle' fill='#aaa' fontSize={9}>{c.name}</text>
          <text x={20+i*54+20} y={345-tween(0,c.scale)} textAnchor='middle' fill='#fff' fontSize={9}>{c.val}</text>
        </g>
      ))}
    </svg>
  </div>
  ~~~

## World2025
layout:parallel
- component duration:5
  ~~~jsx jsx
  <div style={{width:'100%',height:'100%',background:'#0c0c1d',padding:20,fontFamily:'Arial,sans-serif'}}>
    <h2 style={{color:'#ffd700',fontSize:18,textAlign:'center',margin:'0 0 10px 0'}}>Electricity Generation in 2025 (TWh)</h2>
    <svg viewBox='0 0 580 380' width='100%' height='85%'>
      {[
        {name:'China',val:10583,color:'#ff4444',scale:280},
        {name:'USA',val:4520,color:'#4477ff',scale:120},
        {name:'India',val:2082,color:'#ff8844',scale:55},
        {name:'Russia',val:1193,color:'#cc4444',scale:32},
        {name:'Japan',val:1030,color:'#44cc44',scale:27},
        {name:'Brazil',val:751,color:'#66ff66',scale:20},
        {name:'Canada',val:652,color:'#ff66aa',scale:17},
        {name:'S.Korea',val:625,color:'#66cccc',scale:17},
        {name:'Germany',val:500,color:'#ffaa00',scale:13},
        {name:'France',val:570,color:'#aa66ff',scale:15},
      ].map((c,i)=>(
        <g key={c.name}>
          <rect x={20+i*54} y={350-tween(0,c.scale)} width={40} height={tween(0,c.scale)} fill={c.color} rx={3}/>
          <text x={20+i*54+20} y={365} textAnchor='middle' fill='#aaa' fontSize={9}>{c.name}</text>
          <text x={20+i*54+20} y={345-tween(0,c.scale)} textAnchor='middle' fill='#fff' fontSize={9}>{c.val}</text>
        </g>
      ))}
    </svg>
  </div>
  ~~~

## GrowthComparison
layout:parallel
- component duration:6
  ~~~jsx jsx
  <div style={{width:'100%',height:'100%',background:'#0c0c1d',padding:20,fontFamily:'Arial,sans-serif'}}>
    <h2 style={{color:'#ffd700',fontSize:18,textAlign:'center',margin:'0 0 10px 0'}}>Growth: 1985 → 2025 (TWh)</h2>
    <svg viewBox='0 0 580 380' width='100%' height='85%'>
      {[
        {name:'China',v1985:411,v2025:10583,growth:'+10172',color:'#ff4444',s1985:11,s2025:280},
        {name:'USA',v1985:2657,v2025:4520,growth:'+1863',color:'#4477ff',s1985:70,s2025:120},
        {name:'India',v1985:186,v2025:2082,growth:'+1896',color:'#ff8844',s1985:5,s2025:55},
        {name:'Brazil',v1985:194,v2025:751,growth:'+557',color:'#66ff66',s1985:5,s2025:20},
      ].map((c,i)=>(
        <g key={c.name}>
          <text x={20} y={50+i*80} fill='#aaa' fontSize={14}>{c.name}</text>
          <rect x={20} y={58+i*80} width={tween(0,c.s1985)} height={14} fill={c.color} opacity={0.6} rx={2}/>
          <rect x={20+tween(0,c.s1985)} y={58+i*80} width={tween(0,c.s2025-c.s1985)} height={14} fill={c.color} rx={2}/>
          <text x={20+tween(0,c.s2025)+5} y={70+i*80} fill='#fff' fontSize={11}>{c.v1985} → {c.v2025}</text>
          <text x={20} y={86+i*80} fill='#ffd700' fontSize={10}>Growth: {c.growth} TWh</text>
        </g>
      ))}
      <text x={20} y={370} fill='#666' fontSize={9}>1985 bar (dim) → 2025 bar (bright)</text>
    </svg>
  </div>
  ~~~

## Closing
layout:parallel
- component duration:3
  ~~~jsx jsx
  <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#0c0c1d,#1a1a3e)'}}>
    <h2 style={{color:'#ffd700',fontSize:24,margin:0}}>China leads at 10,583 TWh</h2>
    <p style={{color:'#88ccff',fontSize:16,marginTop:10}}>nearly 25x growth since 1985</p>
    <p style={{color:'#aaa',fontSize:12,marginTop:30}}>Data: Our World in Data · Ember (2026) / Energy Institute (2025)</p>
  </div>
  ~~~
