export function hitStrengthPeakAccel(samples, centerIndex, windowMs = 80) {
  const t0 = new Date(samples[centerIndex].timestamp).getTime();

  let best = { index: centerIndex, aTop: 0, aBottom: 0, aSum: -Infinity };

  const calc = (s) => {
    const aTop = Math.hypot(s.top_x, s.top_y, s.top_z);
    const aBottom = Math.hypot(s.bottom_x, s.bottom_y, s.bottom_z);
    return { aTop, aBottom, aSum: aTop + aBottom };
  };

  // lijevo
  for (let i = centerIndex; i >= 0; i--) {
    const ti = new Date(samples[i].timestamp).getTime();
    if (t0 - ti > windowMs) break;
    const v = calc(samples[i]);
    if (v.aSum > best.aSum) best = { index: i, ...v };
  }
  // desno
  for (let i = centerIndex + 1; i < samples.length; i++) {
    const ti = new Date(samples[i].timestamp).getTime();
    if (ti - t0 > windowMs) break;
    const v = calc(samples[i]);
    if (v.aSum > best.aSum) best = { index: i, ...v };
  }

  return {
    strength: best.aSum*20,          // "jačina" (u jedinicama senzora)
    peakIndex: best.index,
    peakTimestamp: samples[best.index].timestamp,
    aTop: best.aTop,
    aBottom: best.aBottom,
  };
}