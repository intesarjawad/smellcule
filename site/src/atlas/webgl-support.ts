/**
 * The 3D atlas needs WebGL 2. The check is kept separate from the renderer so the rest of the
 * site can decide to offer the list before any canvas or GPU work starts.
 */

export interface WebGLProbe {
  getContext(contextId: "webgl2"): unknown;
}

export function supportsWebGL2(probe?: WebGLProbe): boolean {
  const canvas =
    probe ??
    (typeof document === "undefined" ? null : (document.createElement("canvas") as WebGLProbe));
  if (canvas === null) return false;
  try {
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}
