/* Heat Lab - the live temperature graph.
 *
 * One line per attached thermometer, colour-matched to the thermometer on the
 * bench. The dashed guides at 0 degC and 100 degC are there so the flat
 * plateaus during melting and boiling are impossible to miss - that plateau
 * is the single most important thing on this screen.
 */
(function () {
  var HL = (window.HL = window.HL || {});

  var PAD = { l: 44, r: 12, t: 26, b: 34 };
  var Y_MIN = -30, Y_MAX = 130;
  var WINDOW = 90;              // seconds shown before the view starts scrolling
  var MIN_SPAN = 20;            // never squash a short run into a sliver

  HL.Graph = {
    draw: function (ctx, world, w, h, dark) {
      ctx.clearRect(0, 0, w, h);
      // Canvas text is in device-independent pixels, so on a big board it has
      // to grow with the panel or nobody at the back can read the axes.
      var fs = Math.max(11, Math.min(26, Math.round(w / 26)));
      var pad = { l: 22 + fs * 1.9, r: fs, t: fs * 2.2, b: fs * 2.8 };
      var gw = w - pad.l - pad.r, gh = h - pad.t - pad.b;
      if (gw < 40 || gh < 30) return;

      // Fill the plot while the run is short, then scroll a fixed window.
      var tMax, tMin;
      if (world.time < WINDOW) {
        tMin = 0;
        tMax = Math.max(MIN_SPAN, world.time * 1.08);
      } else {
        tMax = world.time;
        tMin = tMax - WINDOW;
      }

      function px(t) { return pad.l + ((t - tMin) / (tMax - tMin)) * gw; }
      function py(v) { return pad.t + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * gh; }

      var ink = dark ? '#c8d6ea' : '#49596a';
      var faint = dark ? 'rgba(200,215,235,0.16)' : 'rgba(70,95,120,0.16)';

      // Plot area.
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.03)' : '#ffffff';
      ctx.fillRect(pad.l, pad.t, gw, gh);

      // Horizontal gridlines every 20 degrees, labelled.
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;
      // Fewer gridlines when the panel is short, so labels never collide.
      var vStep = gh / (fs * 1.9) < 8 ? 40 : 20;
      for (var v = Y_MIN + 10; v <= Y_MAX; v += vStep) {
        var y = py(v);
        ctx.strokeStyle = faint;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + gw, y); ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillText(String(v) + '\u00b0', pad.l - 6, y);
      }

      // The two change-of-state guides.
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = Math.max(1.6, fs / 7);
      var guides = [[0, '#2e7fc4', '0°C'], [100, '#e2571c', '100°C']];
      for (var g = 0; g < guides.length; g++) {
        var gy = py(guides[g][0]);
        ctx.strokeStyle = guides[g][1];
        ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + gw, gy); ctx.stroke();
      }
      ctx.restore();

      // Time axis.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var span = tMax - tMin;
      var step = span <= 24 ? 5 : span <= 60 ? 10 : 20;
      for (var tt = Math.ceil(tMin / step) * step; tt <= tMax; tt += step) {
        var x = px(tt);
        ctx.strokeStyle = faint;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + gh); ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillText(String(Math.round(tt)), x, pad.t + gh + 5);
      }

      ctx.strokeStyle = dark ? 'rgba(200,215,235,0.4)' : 'rgba(70,95,120,0.4)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(pad.l, pad.t, gw, gh);

      // The traces.
      var any = false;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (var i = 0; i < world.thermometers.length; i++) {
        var th = world.thermometers[i];
        if (th.samples.length < 2) continue;
        any = true;
        ctx.strokeStyle = th.color;
        ctx.lineWidth = Math.max(3, fs / 4);
        ctx.beginPath();
        var started = false;
        for (var k = 0; k < th.samples.length; k++) {
          var s = th.samples[k];
          if (s.t < tMin) continue;
          var sx = px(s.t), sy = py(Math.max(Y_MIN, Math.min(Y_MAX, s.temp)));
          if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        // A dot and a number at the live end of each trace.
        var last = th.samples[th.samples.length - 1];
        if (last && last.t >= tMin) {
          var lx = px(last.t), ly = py(Math.max(Y_MIN, Math.min(Y_MAX, last.temp)));
          ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2);
          ctx.fillStyle = th.color; ctx.fill();
          ctx.strokeStyle = dark ? '#111a28' : '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.font = '700 12px system-ui, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = th.color;
          if (lx < PAD.l + gw - 44) ctx.fillText(Math.round(last.temp) + '°', lx + 8, ly);
        }
      }

      // Axis titles and the plateau prompt.
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      ctx.fillStyle = ink;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(HL.L('graph.x'), w - pad.r, h - 2);

      if (!any) {
        ctx.font = '600 ' + Math.round(fs * 1.15) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = dark ? 'rgba(200,215,235,0.7)' : 'rgba(70,95,120,0.75)';
        ctx.fillText(HL.L('graph.empty'), pad.l + gw / 2, pad.t + gh / 2);
      } else {
        ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = dark ? 'rgba(200,215,235,0.75)' : 'rgba(70,95,120,0.8)';
        ctx.fillText(HL.L('graph.flat'), pad.l + gw / 2, 4);
      }
    }
  };
})();
