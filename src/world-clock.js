// UTC is the source of truth. Only the explicitly labelled experience/studio modes shift it.
export function skyTime(ms, lng, {mode='live', hour, viewerOffset=-new Date(ms).getTimezoneOffset()/60}={}) {
  if (Number.isFinite(hour)) {
    const localDay=Math.floor((ms+lng/15*3600e3)/864e5)*864e5;
    return localDay+(hour-lng/15)*3600e3;
  }
  return mode==='experience' ? ms+(viewerOffset-lng/15)*3600e3 : ms;
}
export function skyDescription(sunAltitude, moonAltitude, illumination) {
  const sky=sunAltitude>=-0.833?'Daylight':sunAltitude>-6?'Civil twilight':sunAltitude>-18?'Twilight':'Dark sky';
  const moon=moonAltitude<-.3?'Moon below the horizon':`Moon above the horizon · ${Math.round(illumination*100)}% illuminated`;
  return `${sky}. ${moon}.`;
}
