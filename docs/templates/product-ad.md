---
# Product Ad Template — 产品广告模板
# Use when: product launch, feature showcase, app demo, promotional video
# Structure: Hook → Problem → Solution → Features → CTA
# Short, punchy scenes with fast transitions. 15-45 seconds total.

# Key decisions for the agent:
# 1. Hook scene: grab attention in first 3 seconds
# 2. Product visuals: generated images or device mockup components
# 3. Features: use animation-in effects for each feature reveal
# 4. CTA: clear call to action with url/QR code
# 5. BGM: energetic background music throughout

# Required external packages/components:
#   - npm:device-mockup — renders phone/laptop/browser mockup with screenshot overlay
#   - npm:text-reveal — animated text reveal with typing or fade-in effects
#   - npm:particle-background — animated particle/confetti background
#   - npm:qr-code — renders QR code component
#   - npm:countdown-timer — animated countdown for limited-time offers

# Missing capabilities to add:
#   - TTI: generate product hero images from description
#   - TTV: generate short product clip from prompt (product in use)
#   - Device mockup with video overlay inside screen

tts:
  cli: 'edge-tts --voice "zh-CN-XiaoxiaoNeural" --rate "+10%" --text "{text}" --write-media "{output}"'
tti:
  cli: 'pi --model agnes-2.0-flash --print "generate image: {prompt}" --output "{output}"'
ttv:
  cli: 'pi --model agnes-2.0-flash --print "generate video: {prompt}" --output "{output}"'
---
# video
width:1080 height:1920 fps:30 layout:series

## Hook
layout:parallel script:"Struggling with [pain point]? Meet [Product Name]."
duration:3
- image src:auto prompt:"dramatic product hero shot, dark background with spotlight" duration:3 fit:cover
- component duration:3 jsx:"<TextReveal text='[Product Name]' animation='slideUp' />"
- audio src:bgm/product-intro.mp3 duration:3 volume:0.3 isBackground:true

## Problem
layout:parallel script:"Tired of [problem 1]? Fed up with [problem 2]?"
duration:4
- image src:auto prompt:"frustrated person looking at broken/wrong solution, warm colors" duration:4 fit:cover
- component duration:4 jsx:"<TextReveal text='There has to be a better way...' animation='fadeIn' />"

## Solution
layout:parallel script:"[Product Name] solves this with [key mechanism]."
duration:5
- image src:auto prompt:"clean product showcase, bright lighting, professional" duration:5 fit:cover
- component duration:5 jsx:"<TextReveal text='Introducing [Product Name]' animation='scaleUp' />"

## Feature1
layout:transitionSeries transition:fade transitionTime:0.3
duration:4
- component duration:2 jsx:"<FeatureCard title='[Feature 1]' description='[Description]' icon='⚡' />" effects:[fadeInRight]
- component duration:2 jsx:"<FeatureCard title='[Feature 2]' description='[Description]' icon='🎯' />" effects:[fadeInLeft]

## Feature2
layout:transitionSeries transition:fade transitionTime:0.3
duration:4
- component duration:2 jsx:"<FeatureCard title='[Feature 3]' description='[Description]' icon='🔒' />" effects:[zoomIn]
- component duration:2 jsx:"<FeatureCard title='[Feature 4]' description='[Description]' icon='📊' />" effects:[zoomIn]

## Demo
layout:parallel script:"See it in action — [brief demo narration]"
duration:5
- video src:auto prompt:"clean app demo: user opens [Product Name], taps [feature], sees result" duration:5 volume:0
- component duration:5 jsx:"<DeviceMockup device='phone' screenshot='[product-screenshot]' />"

## CTA
layout:parallel script:"Get [Product Name] today. Visit [website] or scan the QR code below."
duration:5
- image src:auto prompt:"clean gradient background with call-to-action feel, brand colors" duration:5 fit:cover
- component duration:5 jsx:"<TextReveal text='Start Free Trial' animation='bounceIn' size={64} />"
- component duration:5 jsx:"<QRCode url='[landing-url]' size={200} />"

~~~js imports
import { TextReveal } from "npm:text-reveal"
import { DeviceMockup } from "npm:device-mockup"
import { FeatureCard } from "npm:product-ad-kit"
import { QRCode } from "npm:qr-code"

export function FeatureCard({ title, description, icon }) {
  return (
    <div style={{background:'rgba(255,255,255,0.1)', borderRadius:16, padding:24, textAlign:'center'}}>
      <div style={{fontSize:48}}>{icon}</div>
      <h2 style={{color:'#fff', fontSize:28, margin:'12px 0'}}>{title}</h2>
      <p style={{color:'rgba(255,255,255,0.7)', fontSize:18}}>{description}</p>
    </div>
  )
}
~~~
