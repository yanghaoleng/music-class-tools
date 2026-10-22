import React from "react";
import {
  SineWave as WaveformGlyph,
  Plus as PlusGlyph,
  Search as MagnifyingGlassGlyph,
  MusicDoubleNote as MusicNotesGlyph,
  EditPencil as PencilSimpleGlyph,
  Erase as EraserGlyph,
  UndoAction as ArrowCounterClockwiseGlyph,
  RedoAction as ArrowClockwiseGlyph,
  Play as PlayGlyph,
  Pause as PauseGlyph,
  Square as StopGlyph,
  Repeat as RepeatGlyph,
  SoundHigh as SpeakerHighGlyph,
  SoundOff as SpeakerSlashGlyph,
  FloppyDisk as FloppyDiskGlyph,
  Download as DownloadSimpleGlyph,
  Upload as UploadSimpleGlyph,
  Xmark as XGlyph,
  Check as CheckGlyph,
  Trash as TrashGlyph,
  Copy as CopyGlyph,
  HelpCircle as QuestionGlyph,
  ArrowRight as ArrowRightGlyph,
  Folder as FolderOpenGlyph,
  ControlSlider as SlidersHorizontalGlyph,
  MusicDoubleNote as KeyboardGlyph,
  Timer as MetronomeGlyph,
  NavArrowDown as CaretDownGlyph,
  Star as StarGlyph,
  Palette as PaletteGlyph,
  Keyframes as StackGlyph,
  MoreHoriz as DotsThreeGlyph,
  Sparks as SparkleGlyph,
  PlaySolid as PlayFilled,
  PauseSolid as PauseFilled,
  EraseSolid as EraserFilled,
  StarSolid as StarFilled,
} from "iconoir-react";

// A single 3px stroke keeps the rounded Iconoir family consistently bold.
function icon(Glyph, Filled) {
  return function AppIcon({ size = "1em", weight, ...props }) {
    const Component = weight === "fill" && Filled ? Filled : Glyph;
    return (
      <Component
        width={size}
        height={size}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        data-ui-icon="iconoir"
        {...props}
      />
    );
  };
}
export const Waveform = icon(WaveformGlyph);
export const Plus = icon(PlusGlyph);
export const MagnifyingGlass = icon(MagnifyingGlassGlyph);
export const MusicNotes = icon(MusicNotesGlyph);
export const PencilSimple = icon(PencilSimpleGlyph);
export const Eraser = icon(EraserGlyph, EraserFilled);
export const ArrowCounterClockwise = icon(ArrowCounterClockwiseGlyph);
export const ArrowClockwise = icon(ArrowClockwiseGlyph);
export const Play = icon(PlayGlyph, PlayFilled);
export const Pause = icon(PauseGlyph, PauseFilled);
export const Stop = icon(StopGlyph);
export const Repeat = icon(RepeatGlyph);
export const SpeakerHigh = icon(SpeakerHighGlyph);
export const SpeakerSlash = icon(SpeakerSlashGlyph);
export const FloppyDisk = icon(FloppyDiskGlyph);
export const DownloadSimple = icon(DownloadSimpleGlyph);
export const UploadSimple = icon(UploadSimpleGlyph);
export const X = icon(XGlyph);
export const Check = icon(CheckGlyph);
export const Trash = icon(TrashGlyph);
export const Copy = icon(CopyGlyph);
export const Question = icon(QuestionGlyph);
export const ArrowRight = icon(ArrowRightGlyph);
export const FolderOpen = icon(FolderOpenGlyph);
export const SlidersHorizontal = icon(SlidersHorizontalGlyph);
export const Keyboard = icon(KeyboardGlyph);
export const Metronome = icon(MetronomeGlyph);
export const CaretDown = icon(CaretDownGlyph);
export const Star = icon(StarGlyph, StarFilled);
export const Palette = icon(PaletteGlyph);
export const Stack = icon(StackGlyph);
export const DotsThree = icon(DotsThreeGlyph);
export const Sparkle = icon(SparkleGlyph);
