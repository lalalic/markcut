---
title: 人工智能入门课程
description: 讲解人工智能的初步课程
width: 1920 
height: 1080 
fps: 30 
---
# video
layout:series
~~~js imports
export { default as ReactMarkdown } from 'npm:react-markdown';
~~~

## Hook
instruction: "an AI video to attract audience"
- video prompt:"在一个荒凉的山头上，远处是荒漠，破败的城市天际线。动画小黄人摇头晃脑，对着wallet机器人，说‘看看这个世界吧，都是人工智能惹的祸’"

## Slides 
layout:transitionSeries transition:fade transitionTime:0.5

### TitleSlide
layout:parallel
script:"欢迎来到机器学习导论课程。今天我们将深入探讨机器学习的三大范式，并通过具体实例理解每种方法的核心思想。让我们开始吧。"
- component isBackground:true jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
  ~~~md source
  # 机器学习导论

  Introduction to Machine Learning

  **Dr. AI** | 人工智能入门课程
  ~~~

### WhatIsML
layout:series
- parallel
  - component isBackground:true jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
    ~~~md source
    ## 什么是机器学习？

    - 🤖 **从数据中学习规律** — **无需人工编写规则**
    - 📊 **数据驱动** — 从样本中自动总结模式
    - 🔄 **持续改进** — 更多数据 = 更好表现

    > 传统编程：规则 + 数据 = 答案
    > 机器学习：答案 + 数据 = 规则
    ~~~
  - script "在机器学习中，我们通常将数据分为训练集、验证集和测试集。训练集用于模型学习，验证集用于调参，测试集用于评估最终性能。通过这种方式，我们可以确保模型不仅在已知数据上表现良好，也能在未知数据上保持准确性。"
- parallel
  - component isBackground:true jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
    ~~~md source
    ## 什么是机器学习？

    - 🤖 **从数据中学习规律** — 无需人工编写规则
    - 📊 **数据驱动** — **从样本中自动总结模式**
    - 🔄 **持续改进** — **更多数据 = 更好表现**

    > 传统编程：规则 + 数据 = 答案
    > 机器学习：答案 + 数据 = 规则
    ~~~
  - script "机器学习的核心目标是让计算机能够从数据中提取有用的信息，并在面对新情况时做出合理的预测或决策。这种能力在各个领域都有广泛应用，从图像识别到自然语言处理，再到推荐系统和自动驾驶。"

### SupervisedLearning
layout:parallel
- component isBackground:true jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
  script:"监督学习是机器学习中最常用的范式。它的核心是使用已标注的数据进行训练——每个训练样本都配有正确答案。模型学习从输入特征到输出标签的映射函数。例如在垃圾邮件检测中，输入是邮件内容，输出是'垃圾邮件'或'正常邮件'。模型通过数万个已标注样本的训练，最终能够准确分类从未见过的新邮件。监督学习还广泛应用于图像识别、房价预测和医疗诊断等领域。"
  ~~~md source
  ## 监督学习

  Supervised Learning

  - 🏷️ **标注数据训练** — 每个样本都有正确答案
  - 🔗 **输入 → 输出映射** — 学习特征到标签的函数
  - 📋 **典型应用**：

    | 应用领域 | 输入 | 输出 |
    |----------|------|------|
    | 垃圾邮件检测 | 邮件内容 | 垃圾 / 正常 |
    | 房价预测 | 房屋特征 | 价格 |
    | 医学诊断 | 影像数据 | 疾病类别 |

  - ⚡ **核心算法**：线性回归、决策树、支持向量机、神经网络
  ~~~
- image prompt:"supervised learning diagram showing input features mapping to output labels, training data flow with labeled examples, clean educational style, blue color scheme" duration:12 start:4 fit:cover

### UnsupervisedLearning
layout:parallel 
script:"无监督学习则完全不同——它处理的是没有标签的数据，模型自主探索数据中的结构和模式。一个经典案例是客户分群：电商平台分析用户的购买历史和浏览行为，自动将用户划分为'价格敏感型''品牌忠诚型'等群体，无需预先定义这些类别。无监督学习还广泛应用于异常检测，比如识别信用卡欺诈交易，以及推荐系统中的协同过滤算法。"
- component isBackground:true jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
  ~~~md source
  ## 无监督学习

  Unsupervised Learning

  - 🧩 **无标签数据** — 让数据自己"说话"
  - 🔍 **发现隐藏结构** — 模式、群组、关联规则
  - 📋 **典型应用**：

    | 应用领域 | 方法 | 目的 |
    |----------|------|------|
    | 客户分群 | K-Means 聚类 | 细分市场 |
    | 异常检测 | 孤立森林 | 识别欺诈 |
    | 推荐系统 | 协同过滤 | 个性化推荐 |

  - 💡 **核心思想**：从混沌中发现秩序
  ~~~
- image src:auto prompt:"unsupervised learning clustering visualization, data points grouped into colored clusters, t-SNE or UMAP style projection, data science infographic, green and purple color scheme" duration:14 start:4 fit:cover

### ReinforcementLearning
layout:parallel script:"强化学习是一种通过试错来学习的方法。智能体在环境中探索，采取行动，环境反馈奖励或惩罚。通过不断尝试，智能体学会哪些行动能带来最大的累积奖励。AlphaGo击败围棋世界冠军李世石就是强化学习的里程碑。在训练中，AlphaGo与自己下了数百万盘棋，每一步都得到反馈，最终超越了人类顶尖水平。强化学习还被广泛应用于机器人控制、自动驾驶和游戏AI等领域。"
- component isBackground:true jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
  ~~~md source
  ## 强化学习

  Reinforcement Learning

  - 🎮 **智能体 + 环境 + 奖励** — 三位一体
  - 🔄 **试错学习** — 从反馈中不断优化策略
  - 🏆 **里程碑成就**：

    | 成就 | 年份 | 意义 |
    |------|------|------|
    | AlphaGo 击败李世石 | 2016 | AI 掌握围棋 |
    | OpenAI Five 击败 Dota 2 职业选手 | 2019 | 团队协作 |
    | ChatGPT 强化学习对齐 | 2022 | 人类偏好学习 |

  - 🔬 **核心要素**：策略网络、价值函数、奖励信号
  ~~~
- video  start:5 volume:0
  prompt:"animation of AI playing a strategy board game like Go or chess, pieces moving on board, strategic gameplay visualization, cinematic lighting"

### Summary
layout:parallel 
script:"让我们回顾一下今天的内容。监督学习适合有标注数据的预测任务，从垃圾邮件检测到医疗诊断都能胜任。无监督学习善于发现数据中的隐藏模式，在客户分群和异常检测中发挥重要作用。强化学习通过与环境交互来学习最优策略，是游戏AI和机器人控制的核心技术。三种范式各有特色，选择合适的方法取决于你的数据条件和问题类型。感谢观看本次课程！"
- component isBackground:true jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
  ~~~md source
  ## 总结

  Summary

  ### 三大范式对比

  | 范式 | 数据要求 | 典型任务 | 代表算法 |
  |------|----------|----------|----------|
  | 🔵 监督学习 | 标注数据 | 分类 / 回归 | 决策树、SVM |
  | 🟢 无监督学习 | 无标签数据 | 聚类 / 降维 | K-Means、PCA |
  | 🟠 强化学习 | 环境交互 | 决策 / 控制 | Q-Learning、PPO |

  ### 选择指南

  - 有标注数据？ → **监督学习**
  - 想发现模式？ → **无监督学习**
  - 需要自主决策？ → **强化学习**
  ~~~

## Thanks
- component duration:6 jsx:"<ReactMarkdown>{source}</ReactMarkdown>"
  ~~~md source
  ## Thanks

  - Q&A
  - Thanks
  ~~~