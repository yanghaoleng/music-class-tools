import React from "react";
import { registerRoot, Composition } from "remotion";
import { Film } from "./Film";
import type { FilmProps } from "./types";
const defaults: FilmProps = {
  src: "",
  notes: [],
  title: "我的演奏",
  duration: 12,
  offset: 0,
  theme: "paper",
  labels: true,
};
function Root() {
  return (
    <Composition
      id="NoteType"
      component={Film}
      width={960}
      height={1280}
      fps={30}
      durationInFrames={360}
      defaultProps={defaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.ceil(props.duration * 30)),
      })}
    />
  );
}
registerRoot(Root);
