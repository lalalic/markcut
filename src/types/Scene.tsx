/**
 * SceneLeaf — renders a descriptive container node for storyboarding.
 *
 * A scene is purely a visual grouping node with metadata (name, description)
 * that renders its children like a folder. It exists so UI tools can display
 * high-level storyboard cards without needing to parse the full stream tree.
 *
 * The engine treats it identically to a folder at render time.
 */
import * as React from "react";
import { Folder } from "remotion"
import { ComposeContext, AudioContext } from "../context/index";
import { cssJS, toClassName } from "../utils/index";
import type { Scene as SceneStream } from "../schema/index";
import { FolderLeaf } from "./Folder";

export function SceneLeaf({ stream }: { stream: SceneStream }) {
  const { Container } = React.useContext(ComposeContext);
  const parentAudio = React.useContext(AudioContext);

  const audioCtx = React.useMemo(
    () => ({ id: stream.id, parent: parentAudio }),
    [stream.id, parentAudio],
  );

  return (
    <AudioContext.Provider value={audioCtx as any}>
      <Container
        id={stream.id}
        type="scene"
        style={cssJS(stream.style) as React.CSSProperties}
        className={`scene ${toClassName(stream.name ?? "")}`}
      >
        <Folder name={stream.name ?? ""}>
          <FolderLeaf stream={stream as any} />
        </Folder>
      </Container>
    </AudioContext.Provider>
  );
}
