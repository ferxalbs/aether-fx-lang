export const SCHEMA_VERSION = 1 as const;
export type Result<T> = { ok: true; value: T } | { ok: false; diagnostics: Diagnostic[] };
export interface SourceRange { start: number; end: number; line: number; column: number }
export interface Diagnostic {
  code: string; severity: 'error' | 'warning'; message: string;
  range?: SourceRange; id?: string; frame?: number; interval?: [number, number]; path?: string;
}
export type Vec2 = [number, number];
export type Matrix = [number, number, number, number, number, number];
export interface Fps { numerator: number; denominator: number }
export interface Transform { x: number; y: number; scaleX: number; scaleY: number; rotation: number; opacity: number; visible: boolean }
export const IDENTITY: Readonly<Transform> = Object.freeze({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, visible: true });
export interface Segment { id: string; control1: Vec2; control2: Vec2; end: Vec2 }
export interface Contour { id: string; start: Vec2; segments: Segment[]; closed: boolean }
export interface Shape { id: string; contours: Contour[] }
export interface Material { fill: string | null; stroke: string | null; strokeWidth: number; fillRule: 'nonzero' | 'evenodd' }
export type AssetKind = 'image' | 'font' | 'audio';
export interface Asset { id: string; version: number; kind: AssetKind; src: string; locked: boolean }
export interface ResolvedAsset { id: string; version: number; kind: AssetKind; hash: string; width?: number; height?: number; duration?: number; sampleRate?: number; channels?: number }
export type AssetManifest = ResolvedAsset[];
export interface Part {
  id: string; parent: string | null; pivot: Vec2; transform: Transform; layer: number;
  shape: string | null; material: Material;
  text: { content: string; font: string; size: number } | null;
  image: { asset: string; width: number; height: number } | null;
}
export interface PartState { transform?: Partial<Transform>; shape?: string; layer?: number }
export interface Pose { id: string; parts: Record<string, PartState> }
export interface Drawing { id: string; parts: Record<string, string> }
export interface Actor { id: string; parts: string[]; transform: Transform; parent: string | null; layer: number }
export interface Background { id: string; actor: string; parallax: number }
export type Property = keyof Transform | 'layer' | 'parent' | 'shape';
export type Value = number | boolean | string | null;
export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'bounce-out' | { type: 'spring'; frequency: number; damping: number; velocity: number } | [number, number, number, number];
export interface Key { id: string; target: string; property: Property; frame: number; value: Value; easing: Easing; rotation: 'direct' | 'shortest'; hold: number }
export interface Initial { target: string; values: Partial<Record<Property, Value>> }
export interface Morph { id: string; actor: string; from: string; to: string; start: number; end: number; easing: Easing }
export interface Exposure { id: string; actor: string; drawing: string; start: number; end: number }
export interface Camera { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
export interface Shot { id: string; duration: number; initial: Initial[]; keys: Key[]; morphs: Morph[]; exposures: Exposure[]; camera: Camera }
export interface AudioTrack { asset: string; offset: number; trimStart: number; duration: number; gain: number }
export interface FxDocument {
  schemaVersion: 1; revision: number; id: string; viewport: Vec2; fps: Fps;
  assets: Asset[]; shapes: Shape[]; parts: Part[]; poses: Pose[]; drawings: Drawing[];
  actors: Actor[]; backgrounds: Background[]; shots: Shot[]; audio: AudioTrack | null;
}
export interface Snapshot { values: Record<string, Partial<Record<Property, Value>>>; shapes: Record<string, Shape> }
export interface PlannedShot { start: number; shot: Shot; snapshot: Snapshot }
export interface PlaybackPlan { schemaVersion: 1; document: FxDocument; manifest: AssetManifest; duration: number; shots: PlannedShot[] }
export interface DrawCommand {
  id: string; matrix: Matrix; opacity: number; layer: number; shape: Shape | null;
  material: Material; text: Part['text']; image: Part['image'];
}
export interface DrawList { frame: number; shot: string; viewport: Vec2; commands: DrawCommand[] }
export interface Limits { sourceBytes: number; depth: number; parts: number; segments: number; tracks: number; resolution: number; duration: number }
export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({ sourceBytes: 2_000_000, depth: 64, parts: 1000, segments: 100_000, tracks: 10_000, resolution: 8192, duration: 1_000_000 });
export function diagnostic(code: string, message: string, details: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {}): Diagnostic {
  return { code, severity: 'error', message, ...details };
}
export function success<T>(value: T): Result<T> { return { ok: true, value }; }
export function failure<T = never>(diagnostics: Diagnostic[]): Result<T> { return { ok: false, diagnostics }; }
