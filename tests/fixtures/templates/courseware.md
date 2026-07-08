---
title: Introduction to AI
description: A beginner's course on artificial intelligence
width: 1920 
height: 1080 
fps: 30 
subtitle:
  type: Waving
---
# video
layout:series
~~~js imports
import ReactMarkdown from 'npm:react-markdown';
import remarkGfm from 'npm:remark-gfm'
export {Solid} from 'npm:remotion';
export {checkerboard} from 'npm:@remotion/effects'



export function Slide(props) {
  return <div className="slide"><ReactMarkdown remarkPlugins={[remarkGfm]} {...props}/></div>;
}
~~~
~~~css stylesheet
/* Container sizing for a perfect 16:9 widescreen presentation slide */
.slide {
  width: 80%;
  height: 80%;
  margin: auto;
  color: #f5f5f7;
  padding: 40px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  overflow: hidden;
}

/* Typography rules optimized for visibility from a distance */
.slide h1 {
  font-size: 2.8rem;
  color: #61dafb;
  margin-top: 0;
  margin-bottom: 20px;
  line-height: 1.2;
}

.slide h2 {
  font-size: 2rem;
  color: #a8dadc;
  margin-top: 0;
  margin-bottom: 15px;
}

.slide p {
  font-size: 1.3rem;
  line-height: 1.6;
  color: #e0e0e6;
  margin-bottom: 15px;
}

/* List styling specific to presentation bullet points */
.slide ul, .slide ol {
  margin-left: 25px;
  margin-bottom: 20px;
}

.slide li {
  font-size: 1.3rem;
  line-height: 1.8;
  margin-bottom: 8px;
  color: #e0e0e6;
}

/* Code block handling inside slides */
.slide pre {
  background-color: #2d2d34;
  padding: 15px;
  border-radius: 6px;
  width: 100%;
  box-sizing: border-box;
  overflow-x: auto;
}

.slide code {
  font-family: 'Courier New', Courier, monospace;
  font-size: 1.1rem;
  color: #ffb703;
}

.slide table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
}

.slide th, .slide td {
  border: 1px solid #444;
  padding: 10px;
  text-align: left;
}

~~~

## Hook
instruction: "an AI video to attract audience"
- component duration:6 
  ~~~jsx
    <Solid
        width={1280}
        height={720}
        
      />
  ~~~
- video effects:[fadeIn, fadeOut]
  prompt:"On a barren hilltop, with desert in the distance and a ruined city skyline. An animated Minion shakes its head and says to the wallet robot, 'Look at this world — it's all AI's fault'"

## Slides 
layout:transitionSeries transition:fade transitionTime:0.5

### TitleSlide
layout:parallel
script:"Welcome to the Introduction to Machine Learning course. Today we'll dive into the three major paradigms of machine learning and understand the core ideas of each method through concrete examples. Let's get started."
- component isBackground:true jsx:"<Slide>{source}</Slide>"
  ~~~md source
  # Introduction to Machine Learning

  Introduction to Machine Learning

  **Dr. AI** | AI Introductory Course
  ~~~

### WhatIsML
layout:series
- parallel
  - component isBackground:true jsx:"<Slide>{source}</Slide>"
    ~~~md source
    ## What is Machine Learning?

    - 🤖 **Learning patterns from data** — **No manual rules needed**
    - 📊 **Data-driven** — Automatically summarize patterns from samples
    - 🔄 **Continuous improvement** — More data = Better performance

    > Traditional programming: Rules + Data = Answers
    > Machine Learning: Answers + Data = Rules
    ~~~
  - script "In machine learning, we typically split data into training, validation, and test sets. The training set is used for model learning, the validation set for tuning parameters, and the test set for evaluating final performance. This way, we ensure the model performs well not only on known data but also maintains accuracy on unseen data."
- parallel
  - component isBackground:true jsx:"<Slide>{source}</Slide>"
    ~~~md source
    ## What is Machine Learning?

    - 🤖 **Learning patterns from data** — No manual rules needed
    - 📊 **Data-driven** — **Automatically summarize patterns from samples**
    - 🔄 **Continuous improvement** — **More data = Better performance**

    > Traditional programming: Rules + Data = Answers
    > Machine Learning: Answers + Data = Rules
    ~~~
  - script "The core goal of machine learning is to enable computers to extract useful information from data and make reasonable predictions or decisions when faced with new situations. This capability is widely applied across various fields, from image recognition to natural language processing, recommendation systems, and autonomous driving."

### SupervisedLearning
layout:parallel
- component isBackground:true jsx:"<Slide>{source}</Slide>"
  script:"Supervised learning is the most commonly used paradigm in machine learning. Its core is training with labeled data — each training sample comes with a correct answer. The model learns a mapping function from input features to output labels. For example, in spam detection, the input is email content and the output is 'spam' or 'not spam'. After training on tens of thousands of labeled samples, the model can accurately classify never-before-seen emails. Supervised learning is also widely used in image recognition, housing price prediction, and medical diagnosis."
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
- image prompt:"supervised learning diagram showing input features mapping to output labels, training data flow with labeled examples, clean educational style, blue color scheme" duration:12 start:4 fit:cover

### UnsupervisedLearning
layout:parallel 
script:"Unsupervised learning is completely different — it deals with unlabeled data, and the model autonomously explores structures and patterns in the data. A classic example is customer segmentation: e-commerce platforms analyze users' purchase history and browsing behavior to automatically group users into categories like 'price-sensitive' or 'brand-loyal' without predefining these groups. Unsupervised learning is also widely used in anomaly detection, such as identifying credit card fraud, and collaborative filtering in recommendation systems."
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
- image src:auto prompt:"unsupervised learning clustering visualization, data points grouped into colored clusters, t-SNE or UMAP style projection, data science infographic, green and purple color scheme" duration:14 start:4 fit:cover

### ReinforcementLearning
layout:parallel script:"Reinforcement learning is a method of learning through trial and error. An agent explores its environment, takes actions, and receives rewards or penalties as feedback. Through continuous trial and error, the agent learns which actions yield the greatest cumulative reward. AlphaGo defeating Go world champion Lee Sedol was a milestone for reinforcement learning. During training, AlphaGo played millions of games against itself, receiving feedback at every move, and ultimately surpassed human top-level play. Reinforcement learning is also widely used in robot control, autonomous driving, and game AI."
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
- video  start:5 volume:0
  prompt:"animation of AI playing a strategy board game like Go or chess, pieces moving on board, strategic gameplay visualization, cinematic lighting"

### Summary
layout:parallel 
script:"Let's review what we covered today. Supervised learning is suitable for prediction tasks with labeled data, from spam detection to medical diagnosis. Unsupervised learning excels at discovering hidden patterns in data, playing a key role in customer segmentation and anomaly detection. Reinforcement learning learns optimal policies through interaction with the environment and is the core technology behind game AI and robot control. Each of the three paradigms has its own strengths — choosing the right method depends on your data conditions and problem type. Thank you for watching this course!"
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

## Thanks
- component duration:6 jsx:"<Slide>{source}</Slide>"
  ~~~md source
  ## Thanks

  - Q&A
  - Thanks
  ~~~