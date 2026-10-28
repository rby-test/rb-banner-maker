import { getUser, logout } from '@netlify/identity';

const authUser = await getUser().catch(() => null);
const roleList = authUser?.roles || authUser?.appMetadata?.roles || [];
const mustChange = authUser?.userMetadata?.must_change_password === true || authUser?.user_metadata?.must_change_password === true;
if (!authUser || mustChange) {
  window.location.replace(mustChange ? '/?changePassword=1' : '/?auth=required');
} else {
  document.body.classList.remove('auth-pending');
  const makerLogout = document.getElementById('makerLogout');
  if (makerLogout) makerLogout.addEventListener('click', async () => {
    try { await logout(); } finally { window.location.replace('/'); }
  });
  // Editor code follows. Account roles are enforced by server functions for admin operations.
(() => {
  'use strict';
  const PHONE_W = 1080, PHONE_H = 1920;
  const FOUR_FIVE_TOP_Y = (PHONE_H - 1350) / 2; // 285 px
  const FOUR_FIVE_BOT_Y = PHONE_H - FOUR_FIVE_TOP_Y; // 1635 px
  const ONE_ONE_TOP_Y = (PHONE_H - 1080) / 2; // 420 px
  const ONE_ONE_BOT_Y = PHONE_H - ONE_ONE_TOP_Y; // 1500 px

  const $ = id => document.getElementById(id);
  const isMacOS = navigator.userAgentData?.platform === 'macOS' ||
    ((/Macintosh|Mac OS X/.test(navigator.userAgent) || navigator.platform === 'MacIntel') && (navigator.maxTouchPoints || 0) <= 1);
  const sfproOption = $('sfproOption');
  if (sfproOption) {
    sfproOption.hidden = !isMacOS;
    sfproOption.disabled = !isMacOS;
  }

  const controls = [
    'text','safeZoneLock','autoFontSize','font','weight','size','lineHeight','maxWidth','letterSpacing',
    'topSafePx','top','align','backdrop','shape','padX','padY','radius','join',
    'textColor','fillColor','strokeColor','strokeWidth','shadow','shadowTarget',
    'shadowColor','shadowOpacity','shadowBlur','shadowOffsetX','shadowOffsetY',
    'guideRatio','canvasPreset','customWidth','customHeight','exportMode','scale','showStoryUi'
  ];

  const presets = {
    story: { w: 1080, h: 1920, label: '9:16 · Story / Reels' },
    portrait: { w: 1080, h: 1350, label: '4:5 · Portrait Feed' },
    square: { w: 1080, h: 1080, label: '1:1 · Square Post' }
  };

  const preview = $('preview');
  let pctx = preview.getContext('2d');
  let uploadedFontURL = null;

  const fonts = {
    helvetica: '"Helvetica Neue", Helvetica, Arial, Roboto, sans-serif',
    instagram_bold: '"Instagram Sans Bold", "Instagram Sans", "Helvetica Neue", Helvetica, Roboto, Arial, sans-serif',
    roboto: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    sfpro: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", sans-serif',
    device: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    iphone: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
    android: 'Roboto, Arial, sans-serif',
    instagram: '"Instagram Sans", "Helvetica Neue", system-ui, -apple-system, Arial, sans-serif',
    arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    uploaded: '"UserUploadedFont", system-ui, sans-serif'
  };

  function num(id){ return Number($(id).value); }
  function clampInt(value, fallback, min=64, max=6000){
    const v = Math.round(Number(value));
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  }

  function getExportCanvasSize(overridePreset){
    const key = overridePreset || $('canvasPreset').value;
    if (key === 'custom') {
      return {
        w: clampInt($('customWidth').value, 1080),
        h: clampInt($('customHeight').value, 1920),
        label: 'Custom canvas',
        key: 'custom'
      };
    }
    const p = presets[key] || presets.story;
    return { w: p.w, h: p.h, label: p.label, key };
  }

  function updateCanvasControls(){
    $('customDimensions').classList.toggle('hidden', $('canvasPreset').value !== 'custom');
    const lockOn = $('safeZoneLock').checked;
    $('manualTopField').style.opacity = lockOn ? '.45' : '1';
    $('manualTopField').style.pointerEvents = lockOn ? 'none' : 'auto';

    const activePreset = $('canvasPreset').value;
    const exportMode = $('exportMode').value;
    document.querySelectorAll('[data-quick-export]').forEach(btn => {
      const k = btn.getAttribute('data-quick-export');
      const isMatch = (exportMode === 'banner' && k === 'banner') || (exportMode !== 'banner' && k === activePreset);
      btn.classList.toggle('active', isMatch);
    });
  }

  function getConfig(canvasW = PHONE_W, canvasH = PHONE_H){
    const topSafeBase = num('topSafePx');
    const bandHeight = Math.max(120, FOUR_FIVE_TOP_Y - topSafeBase);
    let topSafeY = topSafeBase;
    let fourFiveTopY = FOUR_FIVE_TOP_Y;
    let bottomSafeY = FOUR_FIVE_BOT_Y;

    if (canvasH !== PHONE_H) {
      topSafeY = Math.round(Math.max(36, canvasH * 0.035));
      fourFiveTopY = topSafeY + bandHeight;
      bottomSafeY = Math.round(canvasH * 0.92);
    }

    const fontChoice = $('font').value;
    const effectiveWeight = fontChoice === 'instagram_bold' ? Math.max(700, num('weight')) : num('weight');

    return {
      W: canvasW,
      H: canvasH,
      text: $('text').value,
      safeZoneLock: $('safeZoneLock').checked,
      autoFontSize: $('autoFontSize').checked,
      fontChoice,
      font: fonts[fontChoice] || fonts.helvetica,
      weight: effectiveWeight,
      size: num('size'),
      lineHeight: num('lineHeight'),
      maxWidthPct: num('maxWidth') / 100,
      maxWidth: canvasW * (num('maxWidth') / 100),
      letterSpacing: num('letterSpacing'),
      shape: $('shape').value,
      padX: num('padX'),
      padY: num('padY'),
      radius: num('radius'),
      join: num('join') / 100,
      textColor: $('textColor').value,
      fillColor: $('fillColor').value,
      strokeColor: $('strokeColor').value,
      strokeWidth: num('strokeWidth'),
      shadow: $('shadow').checked,
      shadowTarget: $('shadowTarget').value,
      shadowColor: $('shadowColor').value,
      shadowOpacity: num('shadowOpacity') / 100,
      shadowBlur: num('shadowBlur'),
      shadowOffsetX: num('shadowOffsetX'),
      shadowOffsetY: num('shadowOffsetY'),
      topSafeY,
      fourFiveTopY,
      bottomSafeY,
      manualTopY: canvasH * (num('top') / 100),
      align: $('align').value
    };
  }

  function setLetterSpacing(ctx, px){
    try { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; } catch(e){}
  }

  function textWidth(ctx, text, spacing){
    const metrics = ctx.measureText(text).width;
    return ('letterSpacing' in ctx) ? metrics : metrics + (Math.max(0, [...text].length - 1) * spacing);
  }

  function wrapLines(text, ctx, maxTextWidth, spacing){
    const output = [];
    const paragraphs = String(text).replace(/\r/g, '').split('\n');
    for (const paragraph of paragraphs) {
      if (paragraph === '') { output.push(''); continue; }
      const words = paragraph.split(/\s+/);
      let line = '';
      for (const word of words) {
        if (!line) {
          if (textWidth(ctx, word, spacing) <= maxTextWidth) { line = word; continue; }
          let chunk = '';
          for (const ch of word) {
            const trial = chunk + ch;
            if (chunk && textWidth(ctx, trial, spacing) > maxTextWidth) { output.push(chunk); chunk = ch; }
            else chunk = trial;
          }
          line = chunk;
          continue;
        }
        const trial = line + ' ' + word;
        if (textWidth(ctx, trial, spacing) <= maxTextWidth) {
          line = trial;
        } else {
          output.push(line);
          if (textWidth(ctx, word, spacing) <= maxTextWidth) {
            line = word;
          } else {
            let chunk = '';
            for (const ch of word) {
              const test = chunk + ch;
              if (chunk && textWidth(ctx, test, spacing) > maxTextWidth) { output.push(chunk); chunk = ch; }
              else chunk = test;
            }
            line = chunk;
          }
        }
      }
      output.push(line);
    }
    return output.length ? output : [''];
  }

  function roundedPolygon(ctx, points, radius){
    const clean = [];
    for (const p of points) {
      const prev = clean[clean.length - 1];
      if (!prev || Math.abs(prev.x - p.x) > 0.001 || Math.abs(prev.y - p.y) > 0.001) clean.push(p);
    }
    if (clean.length > 1) {
      const a = clean[0], b = clean[clean.length - 1];
      if (Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001) clean.pop();
    }
    if (clean.length < 3) return;
    const n = clean.length, corners = [];
    for (let i = 0; i < n; i++) {
      const prev = clean[(i + n - 1) % n], cur = clean[i], next = clean[(i + 1) % n];
      const d1 = Math.hypot(prev.x - cur.x, prev.y - cur.y);
      const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
      if (d1 < 0.001 || d2 < 0.001) { corners.push({ a: cur, b: cur, p: cur }); continue; }
      const r = Math.max(0, Math.min(radius, d1 * 0.48, d2 * 0.48));
      const a = { x: cur.x + (prev.x - cur.x) * r / d1, y: cur.y + (prev.y - cur.y) * r / d1 };
      const b = { x: cur.x + (next.x - cur.x) * r / d2, y: cur.y + (next.y - cur.y) * r / d2 };
      corners.push({ a, b, p: cur });
    }
    ctx.beginPath();
    ctx.moveTo(corners[0].b.x, corners[0].b.y);
    for (let i = 1; i <= n; i++) {
      const c = corners[i % n];
      ctx.lineTo(c.a.x, c.a.y);
      if (radius > 0.01) ctx.quadraticCurveTo(c.p.x, c.p.y, c.b.x, c.b.y);
      else ctx.lineTo(c.p.x, c.p.y);
    }
    ctx.closePath();
  }

  function measureCandidate(ctx, cfg, trialSize, wrapText){
    const padScale = trialSize < 68 ? (trialSize / 68) : 1;
    const effPadX = Math.max(8, cfg.padX * padScale);
    const effPadY = Math.max(5, cfg.padY * padScale);
    const effRadius = Math.max(5, cfg.radius * padScale);
    const effLetterSpacing = cfg.letterSpacing * padScale;

    ctx.font = `${cfg.weight} ${trialSize}px ${cfg.font}`;
    setLetterSpacing(ctx, effLetterSpacing);

    const safeOuterMaxW = cfg.maxWidth;
    const maxTextAllowedW = Math.max(40, safeOuterMaxW - effPadX * 2 - cfg.strokeWidth);

    const rawParagraphs = String(cfg.text).replace(/\r/g, '').split('\n');
    const lines = wrapText
      ? wrapLines(cfg.text, ctx, maxTextAllowedW, effLetterSpacing)
      : (rawParagraphs.length ? rawParagraphs : ['']);

    const widths = lines.map(s => textWidth(ctx, s, effLetterSpacing));
    const maxTextW = Math.max(...widths, trialSize * 0.18);
    const outerW = maxTextW + effPadX * 2 + cfg.strokeWidth;

    const lineStep = trialSize * cfg.lineHeight;
    const halfGlyph = trialSize * 0.57;
    const boxH = (lines.length - 1) * lineStep + 2 * (halfGlyph + effPadY);
    const outerH = boxH + cfg.strokeWidth;

    return {
      size: trialSize,
      effPadX,
      effPadY,
      effRadius,
      effLetterSpacing,
      lines,
      widths,
      maxTextW,
      outerW,
      boxH,
      outerH,
      lineStep,
      halfGlyph,
      safeOuterMaxW
    };
  }

  function getGeometry(ctx, cfg){
    const W = cfg.W, H = cfg.H;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const rawParagraphs = String(cfg.text).replace(/\r/g, '').split('\n');
    const maxSafeBandH = Math.max(60, cfg.fourFiveTopY - cfg.topSafeY - 3);
    const maxTallBandH = Math.max(200, cfg.bottomSafeY - cfg.topSafeY - 12);

    let chosen = null;

    if (!cfg.autoFontSize) {
      chosen = measureCandidate(ctx, cfg, cfg.size, true);
    } else {
      if (rawParagraphs.length <= 2) {
        for (let s = cfg.size; s >= 36; s -= 0.5) {
          const m = measureCandidate(ctx, cfg, s, false);
          if (m.outerW <= m.safeOuterMaxW + 0.5 && m.outerH <= maxSafeBandH + 0.5) {
            chosen = m;
            break;
          }
        }
        if (!chosen) {
          for (let s = cfg.size; s >= 36; s -= 0.5) {
            const m = measureCandidate(ctx, cfg, s, true);
            if (m.lines.length <= 2 && m.outerW <= m.safeOuterMaxW + 0.5 && m.outerH <= maxSafeBandH + 0.5) {
              chosen = m;
              break;
            }
          }
        }
      }

      if (!chosen) {
        if (rawParagraphs.length >= 3) {
          for (let s = cfg.size; s >= 26; s -= 0.5) {
            const m = measureCandidate(ctx, cfg, s, false);
            if (m.outerW <= m.safeOuterMaxW + 0.5 && m.outerH <= maxTallBandH) {
              chosen = m;
              break;
            }
          }
        }
        if (!chosen) {
          const baseWrapped = measureCandidate(ctx, cfg, cfg.size, true);
          const minLines = Math.max(3, rawParagraphs.length);
          for (let s = cfg.size; s >= 22; s -= 0.5) {
            const m = measureCandidate(ctx, cfg, s, true);
            if (m.lines.length <= Math.max(minLines, baseWrapped.lines.length) && m.outerW <= m.safeOuterMaxW + 0.5 && m.outerH <= maxTallBandH) {
              chosen = m;
              break;
            }
          }
        }
        if (!chosen) {
          chosen = measureCandidate(ctx, cfg, 22, true);
        }
      }
    }

    const {
      size: effectiveSize,
      effPadX,
      effPadY,
      effRadius,
      effLetterSpacing,
      lines,
      widths,
      boxH,
      lineStep,
      halfGlyph,
      safeOuterMaxW
    } = chosen;

    let boxTop = cfg.manualTopY;
    const isThreePlusLines = lines.length >= 3;

    if (cfg.safeZoneLock) {
      if (!isThreePlusLines) {
        const availableH = cfg.fourFiveTopY - cfg.topSafeY;
        boxTop = cfg.topSafeY + (availableH - boxH) / 2;
        if (boxTop + boxH > cfg.fourFiveTopY - 1.5) {
          boxTop = cfg.fourFiveTopY - 1.5 - boxH;
        }
        if (boxTop < cfg.topSafeY + 1.5) {
          boxTop = cfg.topSafeY + 1.5;
        }
      } else {
        boxTop = cfg.topSafeY + 3;
      }
    } else {
      boxTop = Math.max(cfg.topSafeY + 2, cfg.manualTopY);
    }

    const firstCenter = boxTop + halfGlyph + effPadY;
    const centers = lines.map((_, i) => firstCenter + i * lineStep);

    const leftSafeEdge = (W - safeOuterMaxW) / 2;
    const rightSafeEdge = W - leftSafeEdge;

    let lineRects = [];
    if (cfg.shape === 'pill') {
      const maxW = Math.min(safeOuterMaxW, Math.max(...widths, effectiveSize * 0.18) + effPadX * 2);
      let left = (W - maxW) / 2;
      if (cfg.align === 'left') left = leftSafeEdge;
      if (cfg.align === 'right') left = rightSafeEdge - maxW;
      left = Math.max(leftSafeEdge, Math.min(rightSafeEdge - maxW, left));
      const top = centers[0] - halfGlyph - effPadY;
      const bottom = centers[centers.length - 1] + halfGlyph + effPadY;
      lineRects = [{ x: left, y: top, w: maxW, h: bottom - top }];
    } else {
      lineRects = lines.map((line, i) => {
        const w = Math.min(safeOuterMaxW, Math.max(widths[i], effectiveSize * 0.18) + effPadX * 2);
        let x = (W - w) / 2;
        if (cfg.align === 'left') x = leftSafeEdge;
        if (cfg.align === 'right') x = rightSafeEdge - w;
        x = Math.max(leftSafeEdge, Math.min(rightSafeEdge - w, x));
        return { x, y: 0, w, h: 0, text: line, center: centers[i], textWidth: widths[i] };
      });

      const boundaries = [centers[0] - halfGlyph - effPadY];
      for (let i = 0; i < centers.length - 1; i++) {
        const wUpper = lineRects[i].w;
        const wLower = lineRects[i + 1].w;
        const minWideCover = Math.min(lineStep * 0.72, halfGlyph + effPadY * 0.45);
        const joinRatio = Math.max(cfg.join, minWideCover / Math.max(1, lineStep));

        let bY;
        if (wUpper > wLower + 2) {
          bY = centers[i] + (centers[i + 1] - centers[i]) * joinRatio;
        } else if (wLower > wUpper + 2) {
          bY = centers[i + 1] - (centers[i + 1] - centers[i]) * joinRatio;
        } else {
          bY = (centers[i] + centers[i + 1]) / 2;
        }
        boundaries.push(bY);
      }
      boundaries.push(centers[centers.length - 1] + halfGlyph + effPadY);

      lineRects.forEach((r, i) => {
        r.y = boundaries[i];
        r.h = Math.max(4, boundaries[i + 1] - boundaries[i]);
      });
    }

    const shadowActive = cfg.shadow && cfg.shadowOpacity > 0 &&
      (cfg.shadowTarget === 'both' || (cfg.shadowTarget === 'banner' && cfg.shape !== 'none') || cfg.shadowTarget === 'text');
    const shadowPadX = shadowActive ? Math.ceil(cfg.shadowBlur * 2.5 + Math.abs(cfg.shadowOffsetX) + 3) : 2;
    const shadowPadY = shadowActive ? Math.ceil(cfg.shadowBlur * 2.5 + Math.abs(cfg.shadowOffsetY) + 3) : 2;
    const minX = Math.min(...lineRects.map(r => r.x)) - cfg.strokeWidth / 2 - shadowPadX;
    const maxX = Math.max(...lineRects.map(r => r.x + r.w)) + cfg.strokeWidth / 2 + shadowPadX;
    const minY = Math.min(...lineRects.map(r => r.y)) - cfg.strokeWidth / 2 - shadowPadY;
    const maxY = Math.max(...lineRects.map(r => r.y + r.h)) + cfg.strokeWidth / 2 + shadowPadY;

    const g = {
      lines,
      widths,
      centers,
      rects: lineRects,
      minX,
      maxX,
      minY,
      maxY,
      W,
      H,
      effectiveSize,
      effPadX,
      effPadY,
      effRadius,
      effLetterSpacing,
      isThreePlusLines,
      leftSafeEdge,
      rightSafeEdge,
      boxTop,
      boxBottom: boxTop + boxH
    };
    ctx.restore();
    return g;
  }

  function drawRoundedRect(ctx, x, y, w, h, r){
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr);
    else {
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
  }

  function shadowRGBA(cfg){
    const hex = String(cfg.shadowColor || '#000000').replace('#', '');
    const safe = /^[0-9a-fA-F]{6}$/.test(hex) ? hex : '000000';
    const r = parseInt(safe.slice(0, 2), 16);
    const g = parseInt(safe.slice(2, 4), 16);
    const b = parseInt(safe.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, cfg.shadowOpacity))})`;
  }

  function drawBanner(ctx, cfg){
    const W = cfg.W;
    const g = getGeometry(ctx, cfg);
    ctx.save();
    ctx.font = `${cfg.weight} ${g.effectiveSize}px ${cfg.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setLetterSpacing(ctx, g.effLetterSpacing);

    if (cfg.shape !== 'none') {
      ctx.fillStyle = cfg.fillColor;
      ctx.strokeStyle = cfg.strokeColor;
      ctx.lineWidth = cfg.strokeWidth;
      ctx.lineJoin = 'round';
      const bannerShadow = cfg.shadow && cfg.shadowOpacity > 0 && (cfg.shadowTarget === 'banner' || cfg.shadowTarget === 'both');
      if (bannerShadow) {
        ctx.shadowColor = shadowRGBA(cfg);
        ctx.shadowBlur = cfg.shadowBlur;
        ctx.shadowOffsetX = cfg.shadowOffsetX;
        ctx.shadowOffsetY = cfg.shadowOffsetY;
      }
      if (cfg.shape === 'connected') {
        const rects = g.rects;
        const points = [];
        points.push({ x: rects[0].x, y: rects[0].y }, { x: rects[0].x + rects[0].w, y: rects[0].y });
        for (let i = 0; i < rects.length - 1; i++) {
          const b = rects[i].y + rects[i].h;
          points.push({ x: rects[i].x + rects[i].w, y: b }, { x: rects[i + 1].x + rects[i + 1].w, y: b });
        }
        const last = rects[rects.length - 1];
        points.push({ x: last.x + last.w, y: last.y + last.h }, { x: last.x, y: last.y + last.h });
        for (let i = rects.length - 1; i > 0; i--) {
          const b = rects[i - 1].y + rects[i - 1].h;
          points.push({ x: rects[i].x, y: b }, { x: rects[i - 1].x, y: b });
        }
        roundedPolygon(ctx, points, g.effRadius);
        ctx.fill();
        if (cfg.strokeWidth > 0) { ctx.shadowColor = 'transparent'; ctx.stroke(); }
      } else if (cfg.shape === 'separate') {
        for (const r of g.rects) {
          drawRoundedRect(ctx, r.x, r.y, r.w, r.h, g.effRadius);
          ctx.fill();
          if (cfg.strokeWidth > 0) { ctx.shadowColor = 'transparent'; ctx.stroke(); }
        }
      } else if (cfg.shape === 'pill') {
        const r = g.rects[0];
        drawRoundedRect(ctx, r.x, r.y, r.w, r.h, Math.min(g.effRadius, r.h / 2));
        ctx.fill();
        if (cfg.strokeWidth > 0) { ctx.shadowColor = 'transparent'; ctx.stroke(); }
      }
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowOffsetX = 0;
    }

    ctx.fillStyle = cfg.textColor;
    const textShadow = cfg.shadow && cfg.shadowOpacity > 0 && (cfg.shadowTarget === 'text' || cfg.shadowTarget === 'both');
    if (textShadow) {
      ctx.shadowColor = shadowRGBA(cfg);
      ctx.shadowBlur = cfg.shadowBlur;
      ctx.shadowOffsetX = cfg.shadowOffsetX;
      ctx.shadowOffsetY = cfg.shadowOffsetY;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    g.lines.forEach((line, i) => {
      let x = W / 2;
      if (cfg.align === 'left') x = g.leftSafeEdge + g.effPadX + g.widths[i] / 2;
      else if (cfg.align === 'right') x = g.rightSafeEdge - g.effPadX - g.widths[i] / 2;
      ctx.fillText(line, x, g.centers[i]);
    });
    ctx.restore();
    return g;
  }

  function drawReferenceDarkBackdrop(ctx, W, H){
    ctx.save();
    const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, H * 0.62);
    grad.addColorStop(0, '#272c3a');
    grad.addColorStop(0.52, '#161922');
    grad.addColorStop(1, '#07080a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawGuides(ctx, cfg){
    const key = $('guideRatio').value;
    if (key === 'none') return;

    const W = cfg.W, H = cfg.H;
    ctx.save();

    if (key === 'reference' || key === 'reference_sides') {
      const lineW = 4.5;

      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(0, cfg.topSafeY);
      ctx.lineTo(W, cfg.topSafeY);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(0, FOUR_FIVE_TOP_Y);
      ctx.lineTo(W, FOUR_FIVE_TOP_Y);
      ctx.moveTo(0, FOUR_FIVE_BOT_Y);
      ctx.lineTo(W, FOUR_FIVE_BOT_Y);
      ctx.stroke();

      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(0, ONE_ONE_TOP_Y);
      ctx.lineTo(W, ONE_ONE_TOP_Y);
      ctx.moveTo(0, ONE_ONE_BOT_Y);
      ctx.lineTo(W, ONE_ONE_BOT_Y);
      ctx.stroke();

      ctx.fillStyle = '#eaeaea';
      ctx.font = '800 54px "Helvetica Neue", Roboto, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('4:5', W / 2, (FOUR_FIVE_TOP_Y + ONE_ONE_TOP_Y) / 2 + 2);
      ctx.fillText('1:1', W / 2, H / 2);

      if (key === 'reference_sides') {
        const leftSafe = (W - cfg.maxWidth) / 2;
        const rightSafe = W - leftSafe;
        ctx.strokeStyle = 'rgba(200, 255, 53, 0.55)';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(leftSafe, 0);
        ctx.lineTo(leftSafe, H);
        ctx.moveTo(rightSafe, 0);
        ctx.lineTo(rightSafe, H);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      return;
    }

    const ratio = key === '4:5' ? 4 / 5 : 1;
    const frameW = Math.min(W, H * ratio);
    const frameH = frameW / ratio;
    const x = (W - frameW) / 2, y = (H - frameH) / 2;
    ctx.strokeStyle = key === '4:5' ? '#ffffff' : '#00ffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(x + 2, y + 2, frameW - 4, frameH - 4);
    ctx.setLineDash([]);
    ctx.fillStyle = '#eaeaea';
    ctx.font = '800 48px "Helvetica Neue", Roboto, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key, W / 2, y + 60);
    ctx.restore();
  }

  function updateLabels(cfg, g){
    const effRounded = Math.round(g.effectiveSize * 10) / 10;
    const isAutoScaled = Math.abs(effRounded - cfg.size) >= 0.5;
    $('sizeOut').textContent = isAutoScaled ? `${cfg.size} px (auto → ${effRounded} px)` : `${cfg.size} px`;
    $('lineHeightOut').textContent = `${cfg.lineHeight.toFixed(2)}×`;
    $('maxWidthOut').textContent = `${Math.round(cfg.maxWidthPct * 100)}%`;
    $('topSafePxOut').textContent = `${Math.round(cfg.topSafeY)} px`;
    $('letterSpacingOut').textContent = `${cfg.letterSpacing.toFixed(1).replace(/\.0$/, '')} px`;
    $('padXOut').textContent = `${cfg.padX} px`;
    $('padYOut').textContent = `${cfg.padY} px`;
    $('radiusOut').textContent = `${cfg.radius} px`;
    $('joinOut').textContent = `${Math.round(cfg.join * 100)}%`;
    $('strokeWidthOut').textContent = `${cfg.strokeWidth.toFixed(1).replace(/\.0$/, '')} px`;
    $('shadowOpacityOut').textContent = `${Math.round(cfg.shadowOpacity * 100)}%`;
    $('shadowBlurOut').textContent = `${cfg.shadowBlur} px`;
    $('shadowOffsetXOut').textContent = `${cfg.shadowOffsetX} px`;
    $('shadowOffsetYOut').textContent = `${cfg.shadowOffsetY} px`;
    $('shadowColorCode').textContent = cfg.shadowColor.toUpperCase();
    $('shadowSettings').style.opacity = cfg.shadow ? '1' : '.48';
    $('shadowSettings').style.pointerEvents = cfg.shadow ? 'auto' : 'none';
    $('topOut').textContent = `${(num('top')).toFixed(1).replace(/\.0$/, '')}%`;
    $('textColorCode').textContent = cfg.textColor.toUpperCase();
    $('fillColorCode').textContent = cfg.fillColor.toUpperCase();
    $('strokeColorCode').textContent = cfg.strokeColor.toUpperCase();
    $('lineCount').textContent = `${g.lines.length} ${g.lines.length === 1 ? 'line' : 'lines'}`;

    const statusBar = $('safeZoneStatusBar');
    const ruleLabel = $('safeZoneRuleLabel');
    const fontReadout = $('effectiveFontReadout');

    if (g.isThreePlusLines) {
      statusBar.classList.add('crossed');
      ruleLabel.textContent = `${g.lines.length} lines · Crosses 4:5 line (Top & Side safe locked)`;
    } else {
      statusBar.classList.remove('crossed');
      ruleLabel.textContent = `Safe Zone: Centered above 4:5 line (${g.lines.length} ${g.lines.length === 1 ? 'line' : 'lines'})`;
    }
    fontReadout.textContent = isAutoScaled ? `Auto-fit: ${effRounded} px` : `${effRounded} px`;

    const exportSize = getExportCanvasSize();
    const exportMode = $('exportMode').value;
    $('previewTitle').textContent = 'Phone simulator (1080 × 1920)';
    if (exportMode === 'banner') {
      $('previewSubtitle').textContent = 'Export: Cropped Banner PNG';
      $('dimensionLabel').textContent = `Cropped (${Math.ceil(g.maxX - g.minX)} × ${Math.ceil(g.maxY - g.minY)})`;
    } else {
      $('previewSubtitle').textContent = `Export: ${exportSize.label}`;
      $('dimensionLabel').textContent = `${exportSize.w} × ${exportSize.h}`;
    }
    $('liveBannerSummary').textContent = g.isThreePlusLines
      ? `${g.lines.length} lines · Crosses 4:5 · ${effRounded}px`
      : `Above 4:5 centered · ${effRounded}px`;
  }

  function applyBackdrop(){
    const screen = $('screen');
    screen.className = 'screen';
    screen.style.background = '';
    const v = $('backdrop').value;
    if (v === 'reference') screen.classList.add('ref-backdrop');
    else if (v === 'checker') screen.classList.add('checker');
    else if (v === 'green') screen.style.background = '#00f600';
    else if (v === 'white') screen.style.background = '#fff';
    else if (v === 'black') screen.style.background = '#000';
    else screen.style.background = '#24272b';

    const showUi = $('showStoryUi').checked;
    $('storyUiOverlay').classList.toggle('hidden', !showUi);
    $('homeIndicator').classList.toggle('hidden', !showUi);
  }

  function render(){
    updateCanvasControls();
    if (preview.width !== PHONE_W || preview.height !== PHONE_H) {
      preview.width = PHONE_W;
      preview.height = PHONE_H;
    }
    const cfg = getConfig(PHONE_W, PHONE_H);
    pctx = preview.getContext('2d');
    pctx.clearRect(0, 0, PHONE_W, PHONE_H);
    drawGuides(pctx, cfg);
    const g = drawBanner(pctx, cfg);
    updateLabels(cfg, g);
    applyBackdrop();
  }

  function blobFromCanvas(canvas){
    return new Promise((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed.')), 'image/png')
    );
  }

  function makeExportCanvas(overridePreset, overrideMode){
    const mode = overrideMode || $('exportMode').value;
    const size = getExportCanvasSize(overridePreset);
    const scale = num('scale');
    const scratch = document.createElement('canvas');
    const sctx = scratch.getContext('2d');

    if (mode === 'reference_sample') {
      const outW = PHONE_W * scale, outH = PHONE_H * scale;
      scratch.width = outW;
      scratch.height = outH;
      const ctx = scratch.getContext('2d');
      ctx.scale(scale, scale);
      const cfg = getConfig(PHONE_W, PHONE_H);
      drawReferenceDarkBackdrop(ctx, PHONE_W, PHONE_H);
      drawGuides(ctx, cfg);
      drawBanner(ctx, cfg);
      return {
        canvas: scratch,
        name: `caption-reference-1080x1920-${scale}x.png`,
        desc: `${outW} × ${outH} px · reference sample with guides`
      };
    }

    if (mode === 'canvas') {
      const cfg = getConfig(size.w, size.h);
      const outW = size.w * scale, outH = size.h * scale;
      if (outW * outH > 60000000) {
        throw new Error('This export would exceed 60 megapixels. Reduce the canvas size or export scale.');
      }
      scratch.width = outW;
      scratch.height = outH;
      const ctx = scratch.getContext('2d');
      ctx.scale(scale, scale);
      drawBanner(ctx, cfg);
      const ratioTag = size.key === 'portrait' ? '4x5' : size.key === 'square' ? '1x1' : '9x16';
      return {
        canvas: scratch,
        name: `caption-overlay-${ratioTag}-${size.w}x${size.h}-${scale}x.png`,
        desc: `${outW} × ${outH} px (${size.label}) · transparent full canvas`
      };
    }

    const cfg = getConfig(PHONE_W, PHONE_H);
    const g = getGeometry(sctx, cfg);
    const margin = 24;
    const x = Math.floor(g.minX - margin);
    const y = Math.floor(g.minY - margin);
    const w = Math.ceil(g.maxX - g.minX + margin * 2);
    const h = Math.ceil(g.maxY - g.minY + margin * 2);
    const outW = Math.max(1, w * scale);
    const outH = Math.max(1, h * scale);
    if (outW * outH > 60000000) {
      throw new Error('This export would exceed 60 megapixels. Reduce the export scale.');
    }
    scratch.width = outW;
    scratch.height = outH;
    const ctx = scratch.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);
    drawBanner(ctx, cfg);
    return {
      canvas: scratch,
      name: `caption-banner-cropped-${scale}x.png`,
      desc: `${outW} × ${outH} px · cropped transparent banner`
    };
  }

  async function waitForSelectedFont(){
    if (!document.fonts) return;
    const choice = $('font').value;
    const weight = num('weight'), size = num('size');
    if (choice === 'roboto') {
      await document.fonts.load(`${weight} ${size}px Roboto`);
    } else if (choice === 'instagram' || choice === 'instagram_bold') {
      await document.fonts.load(`${weight} ${size}px "Instagram Sans Bold"`);
    } else if (choice === 'uploaded') {
      await document.fonts.load(`${weight} ${size}px UserUploadedFont`);
    }
    await document.fonts.ready;
  }

  async function exportPNG(overridePreset, overrideMode){
    const btn = $('export'), status = $('status');
    btn.disabled = true;
    btn.textContent = 'Loading font & rendering…';
    try {
      await waitForSelectedFont();
      render();
      const result = makeExportCanvas(overridePreset, overrideMode);
      const blob = await blobFromCanvas(result.canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2500);
      status.textContent = `Exported ${result.desc}.`;
    } catch (err) {
      status.textContent = `Export failed: ${err.message || err}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Export transparent PNG ↗';
    }
  }

  async function copyPNG(){
    const status = $('status');
    try {
      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error('PNG clipboard copy is not supported in this browser. Use Export transparent PNG instead.');
      }
      await waitForSelectedFont();
      render();
      const result = makeExportCanvas();
      const blob = await blobFromCanvas(result.canvas);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      status.textContent = `Copied PNG to clipboard · ${result.desc}.`;
    } catch (err) {
      status.textContent = err.message || 'Clipboard copy failed.';
    }
  }

  const defaults = {
    text: '$87,195 in IRS debt.\n$0/month.',
    safeZoneLock: true,
    autoFontSize: true,
    font: 'helvetica',
    weight: '800',
    size: '68',
    lineHeight: '1.16',
    maxWidth: '88',
    letterSpacing: '0',
    topSafePx: '88',
    top: '4.7',
    align: 'center',
    backdrop: 'reference',
    shape: 'connected',
    padX: '22',
    padY: '18',
    radius: '15',
    join: '70',
    textColor: '#080808',
    fillColor: '#eaeaea',
    strokeColor: '#d7d7d7',
    strokeWidth: '1.5',
    shadow: true,
    shadowTarget: 'banner',
    shadowColor: '#5b524c',
    shadowOpacity: '22',
    shadowBlur: '8',
    shadowOffsetX: '0',
    shadowOffsetY: '4',
    guideRatio: 'reference',
    canvasPreset: 'story',
    customWidth: '1080',
    customHeight: '1920',
    exportMode: 'canvas',
    scale: '1',
    showStoryUi: false
  };

  function reset(){
    for (const [id, val] of Object.entries(defaults)) {
      const el = $(id);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = val;
      else el.value = val;
    }
    $('fontFile').value = '';
    $('fontFileStatus').textContent = 'Use a font file you have permission to use. You can also load your local Instagram Sans Bold .ttf/.otf file here.';
    $('font').querySelector('option[value="uploaded"]').disabled = true;
    $('status').textContent = 'Reference look restored · Helvetica Neue Extra Bold centered above 4:5 line.';
    render();
  }

  controls.forEach(id => {
    const el = $(id);
    if (!el) return;
    if (id === 'font') {
      el.addEventListener('change', () => {
        if (el.value === 'instagram_bold' && num('weight') < 700) {
          $('weight').value = '700';
        }
        render();
      });
    }
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  document.querySelectorAll('[data-quick-export]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-quick-export');
      if (target === 'banner') {
        $('exportMode').value = 'banner';
        render();
        exportPNG(undefined, 'banner');
      } else {
        $('exportMode').value = 'canvas';
        $('canvasPreset').value = target;
        render();
        exportPNG(target, 'canvas');
      }
    });
  });

  $('fontFile').addEventListener('change', async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const objectURL = URL.createObjectURL(file);
    try {
      const face = new FontFace('UserUploadedFont', `url("${objectURL}")`);
      await face.load();
      document.fonts.add(face);
      if (uploadedFontURL) URL.revokeObjectURL(uploadedFontURL);
      uploadedFontURL = objectURL;
      const option = $('font').querySelector('option[value="uploaded"]');
      option.disabled = false;
      $('font').value = 'uploaded';
      $('fontFileStatus').textContent = `Loaded: ${file.name}. The uploaded font will be embedded in the browser preview and PNG rendering.`;
      render();
    } catch (err) {
      URL.revokeObjectURL(objectURL);
      $('fontFileStatus').textContent = 'Could not load this font file. Try a valid TTF, OTF, WOFF, or WOFF2 file.';
    }
  });

  $('export').addEventListener('click', () => exportPNG());
  $('copy').addEventListener('click', copyPNG);
  $('reset').addEventListener('click', reset);

  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render).catch(() => {});
  if (isMacOS) {
    $('status').textContent = 'macOS detected · Helvetica Neue Extra Bold & SF Pro available.';
  }
})();

}
