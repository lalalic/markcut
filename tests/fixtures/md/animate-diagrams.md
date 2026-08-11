# video
seed:2660286133
width:640 height:480 fps:30 layout:series

## Title
layout:parallel
- component duration:3
  ~~~jsx jsx
  <div style={{position:'absolute',top:0,left:0,width:640,height:480,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#1a1a2e,#16213e)'}}>
    <h1 style={{color:'#00d4ff',fontSize:28,margin:0}}>Animated Diagrams</h1>
    <p style={{color:'#aaa',fontSize:16,marginTop:10}}>Mermaid Diagrams with Dynamic Highlight</p>
  </div>
  ~~~

## FlowChart
layout:series
- component id:flowChart isBackground:true 
  ~~~jsx
  <div style={{position:'absolute',top:0,left:0,width:640,height:480,background:'#1a1a2e',padding:10,fontFamily:'monospace',boxSizing:'border-box',display:'flex',flexDirection:'column'}}>
    <p style={{color:'#00d4ff',fontSize:12,textAlign:'center',margin:'0 0 4px 0',flexShrink:0}}>Flow — {highlight}</p>
    <div style={{flex:1,display:'flex',justifyContent:'center',alignItems:'center',overflow:'hidden'}}>
      <Mermaid highlight={highlight} animateEdges={animateEdges} theme='dark' source={mermaid}/>
    </div>
  </div>
  ~~~
  ~~~mermaid
  graph TD
    A["Receive Request"] --> B["Validate Input"]
    B --> C{"Valid?"}
    C -->|Yes| D["Process Data"]
    C -->|No| E["Return Error"]
    D --> F["Format Response"]
    F --> G["Send Response"]
    classDef highlight fill:#ffd700,stroke:#ff6600,stroke-width:3px,color:#000
  ~~~
- script on:(start, flowChart.highlight="A")
  ~~~script
  
  ~~~
- script on:(start, flowChart.highlight="B")
- script on:(start, flowChart.highlight="C")
- script on:(start, flowChart.highlight=["D","G"])
