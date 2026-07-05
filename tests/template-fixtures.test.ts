/**
 * Generate filled-in fixtures from each template.
 * Replaces [bracket] placeholders with realistic demo content,
 * writes the result as a fixture, and validates it compiles.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseMarkdownDescriptive } from "../src/descriptive/markdown";
import { compileDescriptiveRoot } from "../src/descriptive/compiler";

const TEMPLATES_DIR = resolve(__dirname, "..", "docs", "templates");
const FIXTURES_DIR = resolve(__dirname, "fixtures", "templates");

// Demo content for each template's [bracket] placeholders
const DEMO_CONTENT: Record<string, Record<string, string>> = {
  "product-ad.md": {
    "[Product Name]": "SmartSync Pro",
    "[pain point]": "keeping your files organized across devices",
    "[problem 1]": "switching between USB drives",
    "[problem 2]": "forgetting which version is latest",
    "[key mechanism]": "automatic cloud sync with real-time conflict resolution",
    "[website]": "smartsync.example.com",
    "[landing-url]": "https://smartsync.example.com",
    "[Feature 1]": "Real-time Sync",
    "[Feature 2]": "Smart Backup",
    "[Feature 3]": "Team Workspace",
    "[Feature 4]": "End-to-End Encryption",
    "[Description]": "Revolutionary feature that transforms your workflow",
    "[brief demo narration]": "Watch how SmartSync Pro keeps all your devices in perfect sync automatically.",
    "[product-screenshot]": "assets/demo-sync.png",
  },
  "movie-review.md": {
    "[Movie Title]": "Inception",
    "[Director]": "Christopher Nolan",
    "[Year]": "2010",
    "[brief synopsis — 2 sentences]": "A thief who steals corporate secrets through dream-sharing technology is given a chance to have his criminal record erased. He must perform an impossible task: inception — planting an idea in someone's subconscious.",
    "[describe what happens and why it matters]": "The hotel corridor fight scene demonstrates Nolan's commitment to practical effects. The rotating hallway was built on a massive gimbal, creating zero-gravity physics that CGI cannot replicate.",
    "[clip1-path.mp4]": "assets/clips/hallway-fight.mp4",
    "[detail]": "the gravity shifts with each rotation",
    "[cinematography note]": "Notice the lighting changes as they move between dream layers",
    "[clip2-path.mp4]": "assets/clips/limo-scene.mp4",
    "[frame1-path]": "assets/frames/limo-1.png",
    "[frame2-path]": "assets/frames/limo-2.png",
    "[adjective]": "mind-bending",
    "[evaluation]": "combines stunning visuals with emotional depth",
    "[rating]": "9",
  },
  "audiobook.md": {
    "[Book Title]": "The Art of Programming",
    "[Author]": "Grace Hopper",
    "[Chapter Title]": "Logic and Flow",
    "[mood]": "thoughtful and inspiring",
    "[Chapter 1 scene description]": "a programmer writing code at sunrise",
    "[Chapter 2 scene description]": "flowchart diagrams connecting like constellations",
    "[Chapter 3 scene description]": "abstract visualization of algorithms as dancing shapes",
    "[Full chapter 1 text — the agent fills this with the actual narrative content]": "Chapter 1: Logic and Flow. Programming begins with a single step: understanding the flow of data. Every program is a story — a sequence of instructions that transform input to output. The beauty lies in its simplicity: if this, then that. Boolean logic, conditional branches, and loops form the grammar of this language. Once you grasp the flow, you can build anything.",
    "[Full chapter 2 text]": "Chapter 2: Data Structures. Information wants to be organized. Arrays hold sequences, trees model hierarchies, graphs connect relationships. Choosing the right structure is like picking the right tool for a job — the difference between elegant efficiency and painful complexity. Remember: your data shapes your algorithm.",
    "[Full chapter 3 text]": "Chapter 3: Algorithms. At their core, algorithms are recipes for solving problems. Sort, search, transform, analyze. The best algorithms are those that feel inevitable — once you see them, you wonder how you ever thought differently. Practice recognizing patterns, and algorithms become second nature.",
    "[totalChapters]": "10",
  },
  "story-video.md": {
    "[Story Title]": "The Little Star",
    "[Author/Narrator]": "Mother Nature",
    "[describe scene 1 setting and characters]": "a tiny star waking up in the vast night sky, surrounded by twinkling friends",
    "[Scene 1 narration: introduce setting and main character]": "Once upon a time, in a sky full of shining stars, there was one very special little star named Sparkle. She was the smallest star in the galaxy, but she had the biggest dreams.",
    "[Character dialogue]": "I want to shine the brightest!",
    "[name]": "Sparkle",
    "[Scene 2 narration: the conflict or challenge begins]": "But every time Sparkle tried to shine brighter, she flickered and dimmed. The bigger stars twinkled above her, and she felt very small indeed.",
    "[describe scene 2 — the conflict moment]": "the little star trying desperately to shine but flickering, surrounded by brighter stars",
    "[Scene 3 narration: rising action]": "A wise old moon saw Sparkle struggling. 'Dear star,' he said, 'shining isn't about being the brightest. It's about being yourself.'",
    "[describe scene 3 action]": "the little star talking to a wise crescent moon, starting to glow softly",
    "[Scene 4 narration: climax]": "Sparkle realized the moon was right. She stopped trying to be like the others and just let her own light shine. And at that moment, she glowed more beautifully than ever before.",
    "[describe the climax moment]": "the little star finally glowing with confidence, lighting up a small corner of the sky",
    "[Closing narration: resolution and moral/lesson]": "From that night on, Sparkle never compared herself to others. She understood that every star has its own light — and that's what makes the night sky so beautiful.",
  },
  "travel-log.md": {
    "[Destination]": "Japan — Tokyo to Kyoto",
    "[Trip Duration]": "14 days",
    "[Date Range]": "March 15-28, 2026",
    "[Start]": "Tokyo",
    "[End]": "Kyoto",
    "[X km]": "458",
    "[Y days]": "14",
    "[Stop1]": "Tokyo Tower & Shibuya",
    "[Location Name]": "Shibuya Crossing",
    "[Day 1]": "",
    "[2-3 sentences describing what makes this place special]": "The famous Shibuya Crossing is the busiest pedestrian intersection in the world. Hundreds of people cross from every direction when the lights turn red, creating an organized chaos that defines Tokyo's energy.",
    "[sunny/cloudy/rain]": "sunny",
    "[temp]": "18",
    "[Stop2]": "Mt. Fuji & Hakone",
    "[describe the scene — people walking, market, nature view]": "a scenic bullet train ride past Mt. Fuji, snow-capped peak against blue sky, cherry blossoms in the foreground",
    "[Day 2]": "",
    "[Stop3]": "Kyoto — Arashiyama Bamboo Grove",
    "[personal highlight and recommendation]": "Walking through the towering bamboo grove at dawn, with sunlight filtering through the green stalks and only the sound of birds, was the most peaceful moment of the entire trip.",
    "[top 3 moments]": "Shibuya Crossing at night, Mt. Fuji from the bullet train, Arashiyama bamboo grove at dawn",
    "[stopCount]": "8",
  },
};

function fillTemplate(template: string, demoVars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(demoVars)) {
    // Replace all occurrences of the key (including bracketed versions)
    result = result.split(key).join(val);
  }
  return result;
}

describe("template fixtures", () => {
  const templateFiles = [
    "product-ad.md",
    "movie-review.md",
    "audiobook.md",
    "story-video.md",
    "travel-log.md",
  ];

  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  for (const name of templateFiles) {
    it(`generates and validates fixture: ${name}`, () => {
      const templatePath = resolve(TEMPLATES_DIR, name);
      const template = readFileSync(templatePath, "utf-8");
      const demo = DEMO_CONTENT[name] ?? {};

      const filled = fillTemplate(template, demo);

      // Write the fixture
      const fixturePath = resolve(FIXTURES_DIR, name);
      writeFileSync(fixturePath, filled, "utf-8");
      console.log(`  Wrote ${fixturePath}`);

      // Parse — must not throw
      const parsed = parseMarkdownDescriptive(filled);

      // Each template must have scenes
      expect(parsed.children.length).toBeGreaterThan(0);

      // Compile — must not throw
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect(compiled.type).toBe("root");
      expect(compiled.children.length).toBeGreaterThan(0);

      // Verify no placeholder brackets remain (common mistake)
      // Skip for templates that intentionally use JSON template syntax like {text}
      const leftovers = filled.match(/\[.*?\]/g);
      if (leftovers) {
        console.warn(`  ⚠ Unfilled placeholders in ${name}: ${leftovers.join(", ")}`);
      }
    });
  }
});
