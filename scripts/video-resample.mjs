// Which source frame each output frame of a re-encoded video takes (22.10.2026, the owner's report «фоны
// с грида в Dota как 10 fps, а фоны из pornfx плавные»). The builder walks a clip at fixed output times
// k / fps, and mediabunny's samplesAtTimestamps gives the frame shown at a time: the last one whose
// timestamp is not after it. WebM keeps timestamps in whole milliseconds, so a 30 fps source has frames
// at 0, 33, 67, 100 ms…; asked for 66.67 ms, it answered with the frame of 33 ms (67 is «later»). Every
// third frame came twice and the next one was skipped: a workshop background (30 fps WebM) rebuilt for a
// pack played at 20 unique frames a second with a hold of 67 ms every 100 ms, smooth on the site (which
// plays the workshop file itself) and jerky in Dota. Asking half a source frame later takes the source
// frame nearest to each output time instead, whatever the rounding of the container.
//
// The nudge in seconds: half the source's frame time (its average packet rate; the output rate when the
// file does not say), at most half a frame of a 1 fps clip.
export function sampleNudge(sourceRate, fps = 30) {
  const rate = Number.isFinite(sourceRate) && sourceRate > 0 ? sourceRate : fps;
  return 0.5 / Math.max(1, Math.min(1000, rate));
}
// The source timestamps to ask for: `frames` output frames at `fps` from `from` seconds of the clip,
// whose first frame is at `first`, each nudged (sampleNudge).
export const sampleTimes = ({ first = 0, from = 0, frames, fps, nudge = 0 }) => Array.from({ length: frames }, (_, k) => first + from + k / fps + nudge);

// The frame samplesAtTimestamps answers with (the last one not after `time`), as an index into
// `timestamps` (sorted): for tests and for the check of built videos.
export function frameAt(timestamps, time) {
  let low = 0, high = timestamps.length - 1, found = 0;
  while (low <= high) { const mid = (low + high) >> 1; if (timestamps[mid] <= time + 1e-9) { found = mid; low = mid + 1; } else high = mid - 1; }
  return found;
}

// The builder's version, kept with every video it makes (22.10.2026): 2 is the first one that samples with
// sampleNudge. A «Студия» background or an «Оформление» holding a video without it (or with a lower one) was
// built jerky; it is built again from its source where this browser can (src/studio-rebuild.js).
export const VIDEO_ENCODER = 2;
export const freshVideo = (encoder) => Number.isFinite(encoder) && encoder >= VIDEO_ENCODER;
