// A hand-bearing compass: the card swings on its pivot and settles on the bearing you are looking along.
export function createCompass(canvas) {
  const ctx = canvas.getContext('2d');
  let card = 0, vel = 0;
  const readout = document.getElementById('compassReadout');

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = canvas.clientWidth;
    if (canvas.width !== Math.round(size * dpr)) { canvas.width = canvas.height = Math.round(size * dpr); }
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const r = size / 2;
    const css = getComputedStyle(canvas);
    const ink = css.getPropertyValue('--compass-ink').trim() || '#efeae0';
    const faint = css.getPropertyValue('--compass-faint').trim() || 'rgba(239,234,224,0.45)';
    const face = css.getPropertyValue('--compass-face').trim() || 'rgba(10,13,15,0.55)';

    c.fillStyle = face;
    c.beginPath(); c.arc(r, r, r - 1, 0, Math.PI * 2); c.fill();
    c.strokeStyle = faint; c.lineWidth = 1;
    c.beginPath(); c.arc(r, r, r - 1.5, 0, Math.PI * 2); c.stroke();

    c.save();
    c.translate(r, r);
    c.rotate((-card * Math.PI) / 180);
    for (let d = 0; d < 360; d += 5) {
      const major = d % 30 === 0;
      const mid = d % 10 === 0;
      c.save();
      c.rotate((d * Math.PI) / 180);
      c.strokeStyle = major ? ink : faint;
      c.lineWidth = major ? 1.6 : 1;
      c.beginPath();
      c.moveTo(0, -(r - 8));
      c.lineTo(0, -(r - (major ? 20 : mid ? 15 : 12)));
      c.stroke();
      if (major) {
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] || String(d / 10).padStart(2, '0');
        c.fillStyle = d % 90 === 0 ? ink : faint;
        c.font = `${d % 90 === 0 ? 600 : 500} ${d % 90 === 0 ? Math.round(size * 0.1) : Math.round(size * 0.07)}px Figtree, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(label, 0, -(r - (d % 90 === 0 ? 34 : 31)));
      }
      c.restore();
    }
    // North pointer on the card
    c.fillStyle = ink;
    c.beginPath();
    c.moveTo(0, -(r * 0.42));
    c.lineTo(5, -(r * 0.26));
    c.lineTo(-5, -(r * 0.26));
    c.closePath();
    c.fill();
    c.restore();

    // Lubber line fixed to the case
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(r, 2);
    c.lineTo(r, 16);
    c.stroke();
    c.fillStyle = ink;
    c.beginPath(); c.arc(r, r, 2.5, 0, Math.PI * 2); c.fill();
  }

  /** bearingDeg: direction the viewer faces. jolt: motion of the canoe that sets the card swinging. */
  function update(bearingDeg, dt, jolt = 0) {
    let diff = ((bearingDeg - card + 540) % 360) - 180;
    // Damped card in fluid
    vel += (diff * 18 - vel * 6.5) * dt + jolt * (Math.random() - 0.5) * 30 * dt;
    card = (card + vel * dt + 360) % 360;
    readout.textContent = String(Math.round(card) % 360).padStart(3, '0') + '°';
    draw();
  }

  return { update };
}
