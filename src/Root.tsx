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
  const inputProps = getInputProps() as { root?: unknown };
  const data = inputProps.root as any;
  if (data) {
    // Dynamic composition from --props
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
  }

  // Static 10s placeholder composition for the studio UI
  return (
    <Composition
      id="Root"
      component={RootComposition as any}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{}}
    />
  );
};
