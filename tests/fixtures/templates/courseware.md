---
title: Introduction to AI
description: A beginner's course on artificial intelligence
version: 1.0
---
# video
layout:series subtitle:{fontSize:"20px"} width:1920 height:1080 fps:30 tts:"edge-tts --voice 'en-US-GuyNeural' --text '{input}' --write-media '{output}'"
~~~js imports
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { delayRender, continueRender } from 'remotion'
import React from "react"

// Initialize mermaid once. Theme matches the slide deck's dark scheme.
mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })

/**
 * Renders a mermaid diagram as inline SVG.
 * Uses Remotion's delayRender/continueRender so the diagram is guaranteed
 * to be ready before the frame is captured.
 */
export function Mermaid({ source }) {
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (!source || !ref.current) return
    const handle = delayRender('Mermaid rendering')
    mermaid.render('mmd-' + Math.random().toString(36).slice(2), source)
      .then((result) => {
        if (ref.current) ref.current.innerHTML = result.svg
        continueRender(handle)
      })
      .catch((err) => {
        console.error('Mermaid error:', err)
        continueRender(handle)
      })
  }, [source])

  return (
    <div
      ref={ref}
      style={{ width: '100%', maxWidth: 960, margin: '20px auto' }}
    />
  )
}

/**
 * Courseware slide component.
 * - Renders markdown via react-markdown
 * - Highlights the Nth bullet when `current=N`
 * - Renders mermaid code blocks ( ```mermaid ...``` ) as inline diagrams
 */
export function Slide({ current = 0, children }) {
  let idx = 1
  return (
    <div className="slide">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        components={{
          li: ({ children }) => {
            const highlight = idx === current; idx++
            return <li className={highlight ? 'highlight' : ''}>{children}</li>
          },
          // Fenced code blocks — detect mermaid, render as diagram
          pre: ({ children }) => {
            const code = React.Children.toArray(children)[0]
            if (code?.props?.className === 'language-mermaid') {
              return <Mermaid source={String(code.props.children)} />
            }
            return <pre>{children}</pre>
          },
        }}>{children}</ReactMarkdown>
    </div>
  )
}
~~~
~~~css stylesheet
/* Container sizing for a perfect 16:9 widescreen presentation slide */
.slide {
  color: #f5f5f7;
  padding: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 30px;

  /* Typography rules optimized for visibility from a distance */
  h1 {
    font-size: 2.8em;
    color: #61dafb;
    margin-top: 0;
    margin-bottom: 20px;
    line-height: 1.2;
  }

  h2 {
    font-size: 2em;
    color: #a8dadc;
    margin-top: 0;
    margin-bottom: 15px;
  }

  p {
    font-size: 1.3em;
    line-height: 1.6;
    color: #e0e0e6;
    margin-bottom: 15px;
  }

  /* List styling specific to presentation bullet points */
  ul, ol {
    margin-left: 25px;
    margin-bottom: 20px;
  }

  li {
    font-size: 1.3em;
    line-height: 1.8;
    margin-bottom: 10px;
    color: #e0e0e6;
    list-style-type: none; /* Remove default bullets for custom styling */

    /* Highlighted list item for event-driven bullet reveal */
    &.highlight {
      color: red;
      font-weight: 700;
    }
  }

  /* Code block handling inside slides */
  pre {
    background-color: #2d2d34;
    padding: 15px;
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: auto;
  }

  code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 1.1em;
    color: #ffb703;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;

      th, td {
        border: 1px solid #444;
        padding: 10px;
        text-align: left;
      }
  }
}

~~~

## Hook
- image duration:3 
  prompt:"On a barren hilltop, with desert in the distance and a ruined city skyline. An animated Minion shakes its head and says to the wallet robot, 'Look at this world — it's all AI's fault'. /${variant}"

## Slides 
layout:transitionSeries transition:fade(0.5)

### TitleSlide
layout:parallel
- script "Welcome to the Introduction to Machine Learning course. Today we'll dive into the three major paradigms of machine learning and understand the core ideas of each method through concrete examples. Let's get started." 
  zh:"欢迎来到机器学习入门课程。今天我们将深入探讨机器学习的三大范式，通过具体案例理解每种方法的核心思想。让我们开始吧。"
- component isBackground:true jsx:"<Slide>{source}</Slide>"
  ~~~md source
  # Introduction to Machine Learning

  Introduction to Machine Learning

  **Dr. AI** | AI Introductory Course
  ```mermaid
    graph TD;
      A-->B;
      A-->C;
      B-->D;
      C-->D;
  ```
  ~~~
  ~~~md zh-source
  # 机器学习导论

  机器学习导论

  **AI博士** | AI入门课程
  ~~~

### WhatIsML
layout:transitionSeries transition:fade(0.5)
- component id:slide1 isBackground:true jsx:"<Slide current={current}>{source}</Slide>"
  ~~~md source
  ## What is Machine Learning?

  - 🤖 **Learning patterns from data** — No manual rules needed
  - 📊 **Data-driven** — Automatically summarize patterns from samples
  - 🔄 **Continuous improvement** — More data = Better performance

  > Traditional programming: Rules + Data = Answers
  > Machine Learning: Answers + Data = Rules
  ~~~
  ~~~md zh-source
  ## 什么是机器学习？

  - 🤖 **从数据中学习模式** — 无需人工规则
  - 📊 **数据驱动** — 自动从样本中总结规律
  - 🔄 **持续改进** — 更多数据 = 更好性能

  > 传统编程：规则 + 数据 = 答案
  > 机器学习：答案 + 数据 = 规则
  ~~~
- script "In machine learning, we typically split data into training, validation, and test sets. The training set is used for model learning, the validation set for tuning parameters, and the test set for evaluating final performance. This way, we ensure the model performs well not only on known data but also maintains accuracy on unseen data." on:(start, slide1.current=1) 
  zh:"在机器学习中，我们通常将数据分为训练集、验证集和测试集。训练集用于模型学习，验证集用于调参，测试集用于评估最终性能。这样，我们确保模型不仅在已知数据上表现良好，也能在未知数据上保持准确性。"

- script "The core goal of machine learning is to enable computers to extract useful information from data and make reasonable predictions or decisions when faced with new situations. This capability is widely applied across various fields, from image recognition to natural language processing, recommendation systems, and autonomous driving." on:(start, slide1.current=2) 
  zh:"机器学习的核心目标是让计算机能够从数据中提取有用信息，并在面对新情况时做出合理的预测或决策。这一能力广泛应用于各个领域，从图像识别到自然语言处理，从推荐系统到自动驾驶。"

### SupervisedLearning
layout:parallel
- component isBackground:true jsx:"<Slide>{source}</Slide>"
  ~~~md source
  ## Supervised Learning

  Supervised Learning

  - 🏷️ **Labeled data training** — Each sample has a correct answer
  - 🔗 **Input → Output mapping** — Learning the function from features to labels
  - 📋 **Typical Applications**:

    | Application | Input | Output |
    |-------------|-------|--------|
    | Spam Detection | Email content | Spam / Normal |
    | House Price Prediction | House features | Price |
    | Medical Diagnosis | Medical images | Disease category |

  - ⚡ **Core Algorithms**: Linear Regression, Decision Trees, SVM, Neural Networks
  ~~~
  ~~~md zh-source
  ## 监督学习

  监督学习

  - 🏷️ **有标签数据训练** — 每个样本都有正确答案
  - 🔗 **输入→输出映射** — 学习从特征到标签的函数
  - 📋 **典型应用**:

    | 应用 | 输入 | 输出 |
    |------|------|------|
    | 垃圾邮件检测 | 邮件内容 | 垃圾/正常 |
    | 房价预测 | 房屋特征 | 价格 |
    | 医学诊断 | 医学影像 | 疾病类别 |

  - ⚡ **核心算法**: 线性回归、决策树、SVM、神经网络
  ~~~
- script "Supervised learning is the most commonly used paradigm in machine learning. Its core is training with labeled data — each training sample comes with a correct answer. The model learns a mapping function from input features to output labels. For example, in spam detection, the input is email content and the output is 'spam' or 'not spam'. After training on tens of thousands of labeled samples, the model can accurately classify never-before-seen emails. Supervised learning is also widely used in image recognition, housing price prediction, and medical diagnosis." 
  zh:"监督学习是机器学习中最常用的范式。其核心是使用有标签数据进行训练——每个训练样本都有正确答案。模型学习从输入特征到输出标签的映射函数。例如，在垃圾邮件检测中，输入是邮件内容，输出是'垃圾邮件'或'正常邮件'。经过数万有标签样本的训练后，模型可以准确分类从未见过的邮件。监督学习还广泛应用于图像识别、房价预测和医学诊断等领域。"

### UnsupervisedLearning
layout:parallel 
- script "Unsupervised learning is completely different — it deals with unlabeled data, and the model autonomously explores structures and patterns in the data. A classic example is customer segmentation: e-commerce platforms analyze users' purchase history and browsing behavior to automatically group users into categories like 'price-sensitive' or 'brand-loyal' without predefining these groups. Unsupervised learning is also widely used in anomaly detection, such as identifying credit card fraud, and collaborative filtering in recommendation systems." 
  zh:"无监督学习则完全不同——它处理的是无标签数据，模型自主探索数据中的结构和模式。一个典型例子是客户分群：电商平台分析用户的购买历史和浏览行为，自动将用户分为'价格敏感型'或'品牌忠诚型'等类别，而无需预先定义这些群体。无监督学习还广泛应用于异常检测（如识别信用卡欺诈）和推荐系统中的协同过滤。"
- component isBackground:true jsx:"<Slide>{source}</Slide>"
  ~~~md source
  ## Unsupervised Learning

  Unsupervised Learning

  - 🧩 **Unlabeled data** — Let the data speak for itself
  - 🔍 **Discover hidden structures** — Patterns, groups, association rules
  - 📋 **Typical Applications**:

    | Application | Method | Purpose |
    |-------------|--------|---------|
    | Customer Segmentation | K-Means Clustering | Market Segmentation |
    | Anomaly Detection | Isolation Forest | Fraud Detection |
    | Recommendation Systems | Collaborative Filtering | Personalized Recommendations |

  - 💡 **Core Idea**: Finding order from chaos
  ~~~
  ~~~md zh-source
  ## 无监督学习

  无监督学习

  - 🧩 **无标签数据** — 让数据自己说话
  - 🔍 **发现隐藏结构** — 模式、群组、关联规则
  - 📋 **典型应用**:

    | 应用 | 方法 | 目的 |
    |------|------|------|
    | 客户分群 | K-Means聚类 | 市场细分 |
    | 异常检测 | 孤立森林 | 欺诈检测 |
    | 推荐系统 | 协同过滤 | 个性化推荐 |

  - 💡 **核心思想**: 从混沌中找到秩序
  ~~~

### ReinforcementLearning
layout:parallel
- script "Reinforcement learning is a method of learning through trial and error. An agent explores its environment, takes actions, and receives rewards or penalties as feedback. Through continuous trial and error, the agent learns which actions yield the greatest cumulative reward. AlphaGo defeating Go world champion Lee Sedol was a milestone for reinforcement learning. During training, AlphaGo played millions of games against itself, receiving feedback at every move, and ultimately surpassed human top-level play. Reinforcement learning is also widely used in robot control, autonomous driving, and game AI." 
  zh:"强化学习是一种通过试错来学习的方法。智能体探索环境、采取行动，并通过奖励或惩罚获得反馈。通过不断试错，智能体学会哪些行动能获得最大累计奖励。AlphaGo击败围棋世界冠军李世石是强化学习的里程碑。在训练过程中，AlphaGo与自己下了数百万盘棋，每一步都获得反馈，最终超越了人类顶尖水平。强化学习还广泛应用于机器人控制、自动驾驶和游戏AI等领域。"
- component isBackground:true jsx:"<Slide>{source}</Slide>"
  ~~~md source
  ## Reinforcement Learning

  Reinforcement Learning

  - 🎮 **Agent + Environment + Reward** — The Trinity
  - 🔄 **Trial-and-error learning** — Continuously optimize strategy from feedback
  - 🏆 **Milestone Achievements**:

    | Achievement | Year | Significance |
    |-------------|------|-------------|
    | AlphaGo beats Lee Sedol | 2016 | AI masters Go |
    | OpenAI Five beats Dota 2 pros | 2019 | Team collaboration |
    | ChatGPT RL alignment | 2022 | Human preference learning |

  - 🔬 **Core Elements**: Policy network, value function, reward signal
  ~~~
  ~~~md zh-source
  ## 强化学习

  强化学习

  - 🎮 **智能体+环境+奖励** — 三位一体
  - 🔄 **试错学习** — 从反馈中不断优化策略
  - 🏆 **里程碑成就**:

    | 成就 | 年份 | 意义 |
    |------|------|------|
    | AlphaGo击败李世石 | 2016 | AI掌握围棋 |
    | OpenAI Five击败Dota 2职业选手 | 2019 | 团队协作 |
    | ChatGPT RL对齐 | 2022 | 人类偏好学习 |

  - 🔬 **核心要素**: 策略网络、价值函数、奖励信号
  ~~~
- video  start:5 volume:0
  prompt:"animation of AI playing a strategy board game like Go or chess, pieces moving on board, strategic gameplay visualization, cinematic lighting"

### Summary
layout:parallel 
- script "Let's review what we covered today. Supervised learning is suitable for prediction tasks with labeled data, from spam detection to medical diagnosis. Unsupervised learning excels at discovering hidden patterns in data, playing a key role in customer segmentation and anomaly detection. Reinforcement learning learns optimal policies through interaction with the environment and is the core technology behind game AI and robot control. Each of the three paradigms has its own strengths — choosing the right method depends on your data conditions and problem type. Thank you for watching this course!" 
  zh:"让我们回顾今天的内容。监督学习适用于有标签数据的预测任务，从垃圾邮件检测到医学诊断。无监督学习擅长发现数据中的隐藏模式，在客户分群和异常检测中发挥关键作用。强化学习通过与环境的交互学习最优策略，是游戏AI和机器人控制的核心技术。三种范式各有优势——选择合适的方法取决于你的数据条件和问题类型。感谢观看本课程！"
- component isBackground:true jsx:"<Slide>{source}</Slide>"
  ~~~md source
  ## Summary

  Summary

  ### Three Paradigms Comparison

  | Paradigm | Data Requirement | Typical Task | Representative Algorithm |
  |----------|-----------------|--------------|--------------------------|
  | 🔵 Supervised Learning | Labeled data | Classification / Regression | Decision Trees, SVM |
  | 🟢 Unsupervised Learning | Unlabeled data | Clustering / Dimensionality Reduction | K-Means, PCA |
  | 🟠 Reinforcement Learning | Environment interaction | Decision / Control | Q-Learning, PPO |

  ### Selection Guide

  - Have labeled data? → **Supervised Learning**
  - Want to discover patterns? → **Unsupervised Learning**
  - Need autonomous decisions? → **Reinforcement Learning**
  ~~~
  ~~~md zh-source
  ## 总结

  总结

  ### 三种范式对比

  | 范式 | 数据需求 | 典型任务 | 代表算法 |
  |------|----------|----------|----------|
  | 🔵 监督学习 | 有标签数据 | 分类/回归 | 决策树、SVM |
  | 🟢 无监督学习 | 无标签数据 | 聚类/降维 | K-Means、PCA |
  | 🟠 强化学习 | 环境交互 | 决策/控制 | Q-Learning、PPO |

  ### 选择指南

  - 有标签数据？→ **监督学习**
  - 想发现模式？→ **无监督学习**
  - 需要自主决策？→ **强化学习**
  ~~~

## Thanks
- component duration:6 jsx:"<Slide>{source}</Slide>"
  ~~~md source
  ## Thanks

  - Q&A
  - Thanks
  ~~~
  ~~~md zh-source
  ## 感谢

  - 问答环节
  - 谢谢
  ~~~

# zh
tts:"edge-tts --voice 'zh-CN-YunxiNeural' --text '{input}' --write-media '{output}'"