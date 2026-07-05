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
layout:parallel script:"Struggling with keeping your files organized across devices? Meet SmartSync Pro."
duration:3
- image src:auto prompt:"dramatic product hero shot, dark background with spotlight" duration:3 fit:cover
- component duration:3 jsx:"<TextReveal text='SmartSync Pro' animation='slideUp' />"
- audio src:bgm/product-intro.mp3 duration:3 volume:0.3 isBackground:true

## Problem
layout:parallel script:"Tired of switching between USB drives? Fed up with forgetting which version is latest?"
duration:4
- image src:auto prompt:"frustrated person looking at broken/wrong solution, warm colors" duration:4 fit:cover
- component duration:4 jsx:"<TextReveal text='There has to be a better way...' animation='fadeIn' />"

## Solution
layout:parallel script:"SmartSync Pro solves this with automatic cloud sync with real-time conflict resolution."
duration:5
- image src:auto prompt:"clean product showcase, bright lighting, professional" duration:5 fit:cover
- component duration:5 jsx:"<TextReveal text='Introducing SmartSync Pro' animation='scaleUp' />"

## Feature1
layout:transitionSeries transition:fade transitionTime:0.3
duration:4
- effect animation:fadeInRight duration:2
  - component duration:2 jsx:"<FeatureCard title='Real-time Sync' description='Revolutionary feature that transforms your workflow' icon='⚡' />"
- effect animation:fadeInLeft duration:2
  - component duration:2 jsx:"<FeatureCard title='Smart Backup' description='Revolutionary feature that transforms your workflow' icon='🎯' />"

## Feature2
layout:transitionSeries transition:fade transitionTime:0.3
duration:4
- effect animation:zoomIn duration:2
  - component duration:2 jsx:"<FeatureCard title='Team Workspace' description='Revolutionary feature that transforms your workflow' icon='🔒' />"
- effect animation:zoomIn duration:2
  - component duration:2 jsx:"<FeatureCard title='End-to-End Encryption' description='Revolutionary feature that transforms your workflow' icon='📊' />"

## Demo
layout:parallel script:"See it in action — Watch how SmartSync Pro keeps all your devices in perfect sync automatically."
duration:5
- video src:auto prompt:"clean app demo: user opens SmartSync Pro, taps [feature], sees result" duration:5 volume:0
- component duration:5 jsx:"<DeviceMockup device='phone' screenshot='assets/demo-sync.png' />"

## CTA
layout:parallel script:"Get SmartSync Pro today. Visit smartsync.example.com or scan the QR code below."
duration:5
- image src:auto prompt:"clean gradient background with call-to-action feel, brand colors" duration:5 fit:cover
- component duration:5 jsx:"<TextReveal text='Start Free Trial' animation='bounceIn' size={64} />"
- component duration:5 jsx:"<QRCode url='https://smartsync.example.com' size={200} />"

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
