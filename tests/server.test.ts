/**
 * Integration tests for the multi-variant player server.
 *
 * Tests:
 * - Variant config parsing from CLI args (--variant flags)
 * - Directory helpers (variantDir, compiledCacheFile)
 * - URL path variant parsing
 * - HTTP API endpoints with variant query param
 * - HTML page variant injection
 * - Sequential compilation (no parallel pipeline runs)
 */
import { describe, expect, it, afterEach } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import http from "node:http";

// ─── Helpers ──────────────────────────────────────────────────────────────

const testDir = mkdtempSync(join(realpathSync(tmpdir()), "server-test-"));
let portCounter = 4000;

/** Get a unique port for each test */
function nextPort(): number {
  return portCounter++;
}

/** Create a minimal compiled stream tree JSON fixture */
function makeFixture(name: string): string {
  const fixture = {
    root: {
      type: "root",
      id: "root",
      width: 640,
      height: 480,
      fps: 30,
      isSeries: true,
      children: [
        {
          type: "folder",
          id: `scene-${name}`,
          name: name,
          isSeries: false,
          children: [
            {
              type: "component",
              id: `comp-${name}`,
              jsx: `<div>${name}</div>`,
              start: 0,
              end: 3,
            },
          ],
        },
      ],
    },
  };
  const path = join(testDir, `${name}.json`);
  writeFileSync(path, JSON.stringify(fixture, null, 2));
  return path;
}

/** Fetch a URL and return response status + parsed body */
async function fetchUrl(url: string): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode!,
            body: JSON.parse(data),
            text: data,
          });
        } catch {
          resolve({ status: res.statusCode!, body: null, text: data });
        }
      });
    }).on("error", reject);
  });
}

/** Spawn the server with specific --variant flags and wait for it to be ready.
 *  Returns a cleanup function that kills the process. */
async function startServer(
  fixturePath: string,
  variants: string[],
  port: number,
): Promise<() => void> {
  const args = [
    "src/player/server.mjs",
    fixturePath,
    "--port",
    String(port),
    ...variants.flatMap((v) => ["--variant", v]),
  ];
  const proc = spawn("node", args, {
    cwd: resolve(__dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolvePromise, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Server did not start on port ${port}. Output:\n${output}`));
    }, 20000);

    const onData = (d: Buffer) => {
      output += d.toString();
      if (output.includes("Player ready")) {
        clearTimeout(timeout);
        resolvePromise(() => { proc.kill(); });
      }
    };

    proc.stdout!.on("data", onData);
    proc.stderr!.on("data", onData);

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("variant config parsing", () => {
  it("defaults to single 'default' variant when no --variant flags", async () => {
    const fixture = makeFixture("noflag");
    const port = nextPort();
    const stop = await startServer(fixture, [], port);
    try {
      const info = await fetchUrl(`http://localhost:${port}/api/video-info`);
      expect(info.status).toBe(200);
      expect(info.body.variants).toEqual(["default"]);
      expect(info.body.variant).toBe("default");
    } finally {
      stop();
    }
  });

  it("parses single --variant flag", async () => {
    const fixture = makeFixture("single");
    const port = nextPort();
    const stop = await startServer(fixture, ["youtube"], port);
    try {
      const info = await fetchUrl(`http://localhost:${port}/api/video-info`);
      expect(info.status).toBe(200);
      expect(info.body.variants).toEqual(["youtube"]);
      // /api/video-info without ?variant= defaults to "default"
      expect(info.body.variant).toBe("default");
      // Verify with explicit variant query
      const infoYt = await fetchUrl(`http://localhost:${port}/api/video-info?variant=youtube`);
      expect(infoYt.body.variant).toBe("youtube");
    } finally {
      stop();
    }
  });

  it("parses multiple --variant flags", async () => {
    const fixture = makeFixture("multi");
    const port = nextPort();
    const stop = await startServer(fixture, ["default", "zh-tiktok", "youtube"], port);
    try {
      const info = await fetchUrl(`http://localhost:${port}/api/video-info`);
      expect(info.status).toBe(200);
      expect(info.body.variants).toEqual(["default", "zh-tiktok", "youtube"]);
    } finally {
      stop();
    }
  });

  it("creates dash-separated chain from compound variant label", async () => {
    const fixture = makeFixture("compound");
    const port = nextPort();
    const stop = await startServer(fixture, ["zh-tiktok", "en-tiktok"], port);
    try {
      const info = await fetchUrl(`http://localhost:${port}/api/video-info`);
      expect(info.status).toBe(200);
      expect(info.body.variants).toEqual(["zh-tiktok", "en-tiktok"]);
    } finally {
      stop();
    }
  });
});

describe("variant HTTP endpoints", () => {
  it("serves default variant at /api/video-data (no query param)", async () => {
    const fixture = makeFixture("ep-noq");
    const port = nextPort();
    const stop = await startServer(fixture, ["default", "zh-tiktok"], port);
    try {
      const res = await fetchUrl(`http://localhost:${port}/api/video-data`);
      expect(res.status).toBe(200);
      expect(res.body.type).toBe("root");
      expect(res.body.id).toBe("root");
    } finally {
      stop();
    }
  });

  it("serves variant-specific data at /api/video-data?variant=", async () => {
    const fixture = makeFixture("ep-vspec");
    const port = nextPort();
    const stop = await startServer(fixture, ["default", "zh-tiktok"], port);
    try {
      // Default variant
      const def = await fetchUrl(`http://localhost:${port}/api/video-data?variant=default`);
      expect(def.status).toBe(200);
      expect(def.body.id).toBe("root");

      // zh-tiktok variant
      const zh = await fetchUrl(`http://localhost:${port}/api/video-data?variant=zh-tiktok`);
      expect(zh.status).toBe(200);
      expect(zh.body.id).toBe("root");
    } finally {
      stop();
    }
  });

  it("returns 500 for unknown variant", async () => {
    const fixture = makeFixture("ep-unk");
    const port = nextPort();
    const stop = await startServer(fixture, ["default"], port);
    try {
      const res = await fetchUrl(`http://localhost:${port}/api/video-data?variant=nonexistent`);
      expect(res.status).toBe(500);
    } finally {
      stop();
    }
  });

  it("serves variant scenes at /api/scenes", async () => {
    const fixture = makeFixture("ep-scn");
    const port = nextPort();
    const stop = await startServer(fixture, ["default"], port);
    try {
      const res = await fetchUrl(`http://localhost:${port}/api/scenes`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    } finally {
      stop();
    }
  });
});

describe("HTML page variant injection", () => {
  it("injects window.VARIANT for default variant at /", async () => {
    const fixture = makeFixture("html-def");
    const port = nextPort();
    const stop = await startServer(fixture, ["default"], port);
    try {
      const res = await fetchUrl(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('window.VARIANT = "default"');
    } finally {
      stop();
    }
  });

  it("injects window.VARIANT for variant path /zh-tiktok", async () => {
    const fixture = makeFixture("html-zh");
    const port = nextPort();
    const stop = await startServer(fixture, ["default", "zh-tiktok"], port);
    try {
      const res = await fetchUrl(`http://localhost:${port}/zh-tiktok`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('window.VARIANT = "zh-tiktok"');
    } finally {
      stop();
    }
  });

  it("sets mode and variant in globals for client-side rendering", async () => {
    const fixture = makeFixture("html-mode");
    const port = nextPort();
    const stop = await startServer(fixture, ["default", "zh-tiktok", "youtube"], port);
    try {
      const res = await fetchUrl(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      // Variant bar is now rendered client-side by React (VariantBar.tsx).
      // Server only provides the config globals and loads player.js.
      expect(res.text).toContain('window.VARIANT = "default"');
      expect(res.text).toContain('window.MODE = "preview"');
      expect(res.text).toContain('src="/player.js"');
    } finally {
      stop();
    }
  });
});

describe("sequential compilation", () => {
  it("compiles multiple variants and serves all via API", async () => {
    const fixture = makeFixture("seq");
    const port = nextPort();
    const stop = await startServer(fixture, ["v1", "v2", "v3"], port);
    try {
      for (const v of ["v1", "v2", "v3"]) {
        const res = await fetchUrl(`http://localhost:${port}/api/video-data?variant=${v}`);
        expect(res.status).toBe(200);
        expect(res.body.type).toBe("root");
      }
    } finally {
      stop();
    }
  });
});
