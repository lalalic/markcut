import { Composition, getInputProps } from "remotion";
import { RemotionEngine } from "./entry";
import { resolveTheme } from "./themes";
import { getDurationInSeconds } from "./utils";
import { root as rootSchema } from "./schema";

const RootComposition = (props: any) => (
  <RemotionEngine
    {...props}
    compose={{
      ...(props.compose ?? {}),
      components: props.compose?.components ?? {},
    }}
  />
);

export const RemotionRoot: React.FC = () => {
  const props = getInputProps() as { root?: unknown };
  const data = props.root as any;
  if (!data) return null;

  const parsed = rootSchema.parse(data);
  const fps = parsed.fps;
  const width = parsed.width;
  const height = parsed.height;
  const durationInSeconds = getDurationInSeconds(parsed as any, true) || 1;
  const durationInFrames = Math.max(1, Math.ceil(durationInSeconds * fps));

  const theme = resolveTheme((data as any).theme);

  return (
    <Composition
      id="Root"
      component={RootComposition as any}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
      defaultProps={{
        root: data,
        theme,
      } as any}
    />
  );
};
