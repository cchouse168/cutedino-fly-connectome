/**
 * cute-dino 畫面繪製。
 *
 * 這一層是 cchouse168/cute-dino 原版 draw() 區段（index.html 第 458–677 行）的
 * 忠實移植，**視覺輸出刻意與原版完全一致**。只做了機械式的取代：
 *
 *   state        → s（傳入的遊戲狀態）
 *   dino         → s.dino
 *   W() / H()    → GEOM.W / GEOM.H（邏輯尺寸鎖定，不隨視窗變動）
 *   groundY()    → G
 *   state.palmWaves → s.time * 1.2（原版每幀累加 dt*1.2，總和等於 time*1.2）
 *
 * 邏輯層（update）為了訓練必須改寫成確定性版本，但渲染層沒有這個必要 ——
 * 這些畫圖函式只依賴 ctx 與狀態，是純函式，照搬即可。
 */
import { GEOM } from "./game.js";

const G = GEOM.GROUND_Y;

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  canvas.width = GEOM.W;
  canvas.height = GEOM.H;

  const roundRect = (x, y, w, h, r, fill) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    if (fill) ctx.fill(); else ctx.stroke();
  };

  function drawGoldCrown(cx, cy, w, h, tilt = 0) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath(); ctx.ellipse(0, h * 0.46, w * 0.42, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createLinearGradient(-w * 0.6, -h * 0.6, w * 0.6, h * 0.8);
    grad.addColorStop(0.0, "#f59e0b"); grad.addColorStop(0.45, "#facc15");
    grad.addColorStop(0.7, "#fde68a"); grad.addColorStop(1.0, "#f59e0b");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, h * 0.3); ctx.lineTo(-w * 0.32, -h * 0.15);
    ctx.lineTo(-w * 0.1, h * 0.3); ctx.lineTo(0, -h * 0.3);
    ctx.lineTo(w * 0.1, h * 0.3); ctx.lineTo(w * 0.32, -h * 0.15);
    ctx.lineTo(w * 0.55, h * 0.3); ctx.closePath(); ctx.fill();
    const rim = ctx.createLinearGradient(0, h * 0.05, 0, h * 0.55);
    rim.addColorStop(0, "#fde047"); rim.addColorStop(1, "#f59e0b");
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.ellipse(0, h * 0.38, w * 0.55, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    const bead = (x, y, r) => {
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, "#fff7cc"); g.addColorStop(0.4, "#fde047"); g.addColorStop(1, "#f59e0b");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
    };
    bead(-w * 0.32, -h * 0.2, h * 0.16); bead(0, -h * 0.38, h * 0.18); bead(w * 0.32, -h * 0.2, h * 0.16);
    ctx.globalAlpha = 0.45; ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(-w * 0.18, -h * 0.02);
    ctx.quadraticCurveTo(0, -h * 0.14, w * 0.18, -h * 0.02);
    ctx.quadraticCurveTo(w * 0.02, h * 0.04, -w * 0.18, -h * 0.02);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, h * 0.3); ctx.lineTo(-w * 0.32, -h * 0.15);
    ctx.lineTo(-w * 0.1, h * 0.3); ctx.lineTo(0, -h * 0.3);
    ctx.lineTo(w * 0.1, h * 0.3); ctx.lineTo(w * 0.32, -h * 0.15);
    ctx.lineTo(w * 0.55, h * 0.3); ctx.stroke();
    ctx.restore();
  }

  function drawGround(s) {
    ctx.fillStyle = s.night ? "#111827" : "#e5e7eb";
    ctx.fillRect(0, G, GEOM.W, GEOM.H - G);
    ctx.strokeStyle = s.night ? "#374151" : "#d1d5db";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const step = 24;
    const offset = (s.time * s.speed * s.speedScale * 0.2) % step;
    for (let x = -offset; x < GEOM.W + step; x += step) { ctx.moveTo(x, G + 10); ctx.lineTo(x + 14, G + 10); }
    ctx.stroke();
  }

  function drawCloud(s, c) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.beginPath();
    const r = c.r;
    ctx.fillStyle = s.night ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.9)";
    ctx.arc(-r * 0.6, 0, r * 0.6, 0, Math.PI * 2);
    ctx.arc(0, -r * 0.2, r * 0.8, 0, Math.PI * 2);
    ctx.arc(r * 0.7, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
  }

  const currentSkinTier = (s) => Math.min(10, Math.floor(Math.max(0, s.score) / 1000));

  function getSkinForTier(tier) {
    if (tier >= 10)
      return { body: "rainbow", head: "rainbow", eye: "#0b1020", deco: "crown", spines: false, eyeStyle: "angry", tail: false, hasPinkWings: true };
    if (tier === 0)
      return { body: "#374151", head: "#374151", eye: "#111", deco: null, spines: false, eyeStyle: "round" };
    const hue = (tier * 34) % 360;
    const body = `hsl(${hue} 70% 55%)`;
    const pattern = (tier - 1) % 3;
    const deco = pattern === 0 ? "headband" : pattern === 1 ? "wing" : "spines";
    return { body, head: body, eye: "#0b1020", deco, spines: false, eyeStyle: "round" };
  }

  function drawDino(s) {
    const d = s.dino;
    const x = d.x, y = d.y, w = d.w, h = d.h;
    const tier = currentSkinTier(s);
    ctx.save();
    const sh = Math.max(4, 14 - (G - (y + h)) * 0.06);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath(); ctx.ellipse(x, G + 6, 36, sh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, y);
    const skin = getSkinForTier(tier);
    const crouch = d.crouch && d.onGround;

    function drawPinkWings() {
      if (!skin.hasPinkWings) return;
      ctx.save();
      const backX = -w * 0.25, backY = crouch ? h * 0.45 : h * 0.3;
      ctx.fillStyle = "rgba(236, 72, 153, 0.85)"; ctx.strokeStyle = "#d94682"; ctx.lineWidth = 2;
      const bob = Math.sin(s.time * 9) * 0.08;
      ctx.translate(backX, backY); ctx.rotate(bob);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-w * 0.6, -h * 0.5, -w * 0.3, -h * 0.8);
      ctx.quadraticCurveTo(0, -h * 0.4, w * 0.1, -h * 0.1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(-w * 0.1, h * 0.05);
      ctx.quadraticCurveTo(-w * 0.5, -h * 0.3, -w * 0.3, -h * 0.5);
      ctx.quadraticCurveTo(-w * 0.1, -h * 0.2, -w * 0.1, h * 0.05);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    function drawWing() {
      if (skin.deco !== "wing") return;
      ctx.save();
      const backX = -w * 0.25, backY = crouch ? h * 0.45 : h * 0.3;
      const hue = (tier * 34) % 360;
      ctx.fillStyle = `hsla(${hue}, 70%, 80%, 0.8)`;
      ctx.strokeStyle = `hsla(${hue}, 70%, 50%, 0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (tier === 2) {
        ctx.moveTo(backX, backY);
        ctx.quadraticCurveTo(backX - w * 0.4, backY - h * 0.3, backX - w * 0.1, backY - h * 0.5);
        ctx.quadraticCurveTo(backX + w * 0.1, backY - h * 0.2, backX, backY);
      } else {
        ctx.moveTo(backX, backY);
        ctx.quadraticCurveTo(backX - w * 0.5, backY - h * 0.4, backX - w * 0.2, backY - h * 0.7);
        ctx.quadraticCurveTo(backX - w * 0.2, backY - h * 0.3, backX + w * 0.05, backY - h * 0.1);
        ctx.lineTo(backX, backY);
        if (tier === 8) {
          ctx.moveTo(backX - w * 0.1, backY);
          ctx.quadraticCurveTo(backX - w * 0.6, backY - h * 0.2, backX - w * 0.4, backY - h * 0.5);
          ctx.quadraticCurveTo(backX - w * 0.2, backY - h * 0.1, backX - w * 0.1, backY);
        }
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    function drawTierSpines() {
      if (skin.deco !== "spines") return;
      ctx.save();
      const hue = (tier * 34) % 360;
      ctx.fillStyle = `hsl(${hue}, 60%, 45%)`;
      const pts = [
        { px: -w * 0.05, py: crouch ? h * 0.15 : -h * 0.05 },
        { px: -w * 0.15, py: crouch ? h * 0.18 : -h * 0.02 },
        { px: -w * 0.25, py: crouch ? h * 0.15 : h * 0.0 },
      ];
      pts.forEach((p) => {
        ctx.beginPath(); ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.px - 5, p.py + 10); ctx.lineTo(p.px + 5, p.py + 10);
        ctx.closePath(); ctx.fill();
      });
      ctx.restore();
    }

    function drawHeadband() {
      if (skin.deco !== "headband") return;
      ctx.save();
      const headX = crouch ? 0 : w * 0.05, headW = crouch ? w * 0.42 : w * 0.45;
      const headY = crouch ? h * 0.02 : -h * 0.15, headH = crouch ? h * 0.28 : h * 0.35;
      ctx.fillStyle = tier === 1 ? "#e11d48" : tier === 4 ? "#2563eb" : "#16a34a";
      const bandY = headY + headH * 0.25, bandH = tier >= 4 ? 7 : 5;
      ctx.fillRect(headX + headW * 0.1, bandY - bandH / 2, headW * 0.85, bandH);
      if (tier === 7) {
        ctx.fillStyle = "#fde047";
        ctx.beginPath(); ctx.arc(headX + headW * 0.5, bandY, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath(); ctx.arc(headX + headW * 0.5 - 1.5, bandY - 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    function setBodyFill() {
      if (skin.body === "rainbow") {
        const grad = ctx.createLinearGradient(-w * 0.35, 0, w * 0.6, 0);
        [[0, "#ef4444"], [0.16, "#f59e0b"], [0.33, "#facc15"], [0.5, "#10b981"],
         [0.66, "#3b82f6"], [0.83, "#8b5cf6"], [1, "#ec4899"]]
          .forEach(([p, c]) => grad.addColorStop(p, c));
        ctx.fillStyle = grad;
      } else ctx.fillStyle = skin.body;
    }

    // --- 繪製順序（與原版一致）---
    drawWing(); drawPinkWings();
    setBodyFill();
    if (crouch) roundRect(-w * 0.35, h * 0.25, w * 0.7, h * 0.45, 10, true);
    else roundRect(-w * 0.35, h * 0.05, w * 0.7, h * 0.55, 10, true);
    setBodyFill();
    if (crouch) roundRect(0, h * 0.02, w * 0.42, h * 0.28, 10, true);
    else roundRect(w * 0.05, -h * 0.15, w * 0.45, h * 0.35, 10, true);
    drawTierSpines();
    if (skin.deco === "crown") {
      const headX = crouch ? 0 : w * 0.05, headW = crouch ? w * 0.42 : w * 0.45;
      const headTop = crouch ? h * 0.02 : -h * 0.15;
      drawGoldCrown(headX + headW * 0.5, headTop - (crouch ? h * 0.06 : h * 0.1), w * 0.42, w * 0.22, -0.05);
    }
    drawHeadband();
    const k = Math.sin(s.time * 10) * 6;
    setBodyFill();
    if (crouch) {
      roundRect(-w * 0.18, h * 0.58, w * 0.26, h * 0.25, 8, true);
      roundRect(0, h * 0.58, w * 0.26, h * 0.25, 8, true);
    } else {
      roundRect(-w * 0.15, h * 0.6, w * 0.22, h * 0.3, 8, true);
      roundRect(w * 0.02 + k * 0.02, h * 0.6, w * 0.22, h * 0.3, 8, true);
    }
    if (!crouch) roundRect(-w * 0.3, h * 0.25, w * 0.18, h * 0.12, 6, true);
    if (skin.eyeStyle === "angry") {
      const eyeY = crouch ? h * 0.08 : -h * 0.06, ex = w * 0.38;
      ctx.fillStyle = "#fff";
      ctx.save(); ctx.translate(ex, eyeY); ctx.rotate(-0.25);
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.ellipse(1, 0, 3.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(1, 0, 1.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = s.night ? "#e5e7eb" : "#111827"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(6, -8); ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = "#fff";
      const eyeY = crouch ? h * 0.12 : -h * 0.02;
      ctx.beginPath(); ctx.arc(w * 0.38, eyeY, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = skin.eye;
      ctx.beginPath(); ctx.arc(w * 0.38, eyeY, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    if (s.time < s.invincibleUntil) {
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(250,204,21,.9)";
      roundRect(-w * 0.42, -h * 0.22, w * 0.95, h * 1.1, 16, false);
    }
    ctx.restore();
  }

  function drawFollower(s, x, y, scale, skin) {
    ctx.save(); ctx.translate(x, y);
    const w = 70 * (scale || 0.55), h = 70 * (scale || 0.55);
    const body = skin?.body || "#4b5563";
    const head = skin?.head || body;
    const eye = skin?.eye || "#111";
    if (body === "rainbow") {
      const grad = ctx.createLinearGradient(-w * 0.35, 0, w * 0.6, 0);
      [[0, "#ef4444"], [0.16, "#f59e0b"], [0.33, "#facc15"], [0.5, "#10b981"],
       [0.66, "#3b82f6"], [0.83, "#8b5cf6"], [1, "#ec4899"]]
        .forEach(([p, c]) => grad.addColorStop(p, c));
      ctx.fillStyle = grad;
    } else ctx.fillStyle = body;
    roundRect(-w * 0.35, h * 0.05, w * 0.7, h * 0.55, 8, true);
    if (head !== "rainbow") ctx.fillStyle = head;
    roundRect(w * 0.05, -h * 0.15, w * 0.45, h * 0.35, 8, true);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(w * 0.38, -h * 0.02, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.arc(w * 0.38, -h * 0.02, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFollowers(s) {
    const skin = getSkinForTier(currentSkinTier(s));
    const d = s.dino;
    const baseY = d.y + (d.h - 40);
    for (let i = 0; i < s.littles; i++) {
      const bob = Math.sin(s.time * 10 + i * 0.7) * 1.2;
      drawFollower(s, d.x - (70 + 44 * i), baseY + bob, 0.55, skin);
    }
  }

  const drawCactus = (ob) => {
    const { x, y, w, h } = ob;
    ctx.save(); ctx.translate(x, y + h); ctx.fillStyle = "#16a34a";
    roundRect(-w * 0.45, -h, w * 0.9, h, 6, true);
    roundRect(-w * 0.95, -h * 0.58, w * 0.35, h * 0.44, 6, true);
    roundRect(w * 0.6, -h * 0.46, w * 0.35, h * 0.36, 6, true);
    ctx.restore();
  };

  const drawJet = (s, ob) => {
    const { x, y, w, h } = ob;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = s.night ? "#60a5fa" : "#111827";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w * 0.55, h * 0.5); ctx.lineTo(w * 0.85, h * 0.35);
    ctx.lineTo(w, h * 0.5); ctx.lineTo(w * 0.85, h * 0.65); ctx.lineTo(w * 0.55, h * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.22, 0); ctx.lineTo(w * 0.52, h * 0.5); ctx.lineTo(w * 0.22, h);
    ctx.closePath(); ctx.fill();
    const flame = 6 + 6 * Math.sin(s.time * 20);
    ctx.fillStyle = s.night ? "#fbbf24" : "#f59e0b";
    ctx.beginPath(); ctx.moveTo(-flame, h * 0.5); ctx.lineTo(0, h * 0.4); ctx.lineTo(0, h * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  const drawDragon = (s, ob) => {
    const { x, y, w, h } = ob;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#f59e0b"; roundRect(w * 0.05, h * 0.15, w * 0.7, h * 0.55, 16, true);
    ctx.fillStyle = "#fde68a"; roundRect(w * 0.16, h * 0.36, w * 0.46, h * 0.28, 10, true);
    ctx.fillStyle = "#f59e0b"; roundRect(-w * 0.08, h * 0.18, w * 0.34, h * 0.3, 14, true);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(w * 0.12, h * 0.3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(w * 0.12, h * 0.3, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = s.night ? "#93c5fd" : "#10b981";
    ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.18);
    ctx.quadraticCurveTo(w * 0.78, 0, w * 0.98, h * 0.18);
    ctx.quadraticCurveTo(w * 0.72, h * 0.34, w * 0.38, h * 0.22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath(); ctx.moveTo(w * 0.7, h * 0.58);
    ctx.quadraticCurveTo(w * 0.92, h * 0.7, w * 1.02, h * 0.58);
    ctx.lineTo(w * 0.86, h * 0.52); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  const drawPalm = (s, ob) => {
    const { x, y, w, h } = ob;
    ctx.save(); ctx.translate(x + w * 0.5, y + h);
    ctx.fillStyle = "#8b5a2b";
    roundRect(-w * 0.25, -h, w * 0.5, h, 6, true);
    ctx.translate(0, -h);
    ctx.rotate(Math.sin(s.time * 1.2 + x * 0.01) * 0.06);
    const leaf = (ang) => {
      ctx.save(); ctx.rotate(ang); ctx.fillStyle = "#10b981";
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(32, -6, 64, 0);
      ctx.quadraticCurveTo(32, 6, 0, 0);
      ctx.fill(); ctx.restore();
    };
    leaf(-0.6); leaf(0); leaf(0.6);
    ctx.restore();
  };

  const drawOb = (s, ob) =>
    ob.type === "cactus" ? drawCactus(ob)
    : ob.type === "jet" ? drawJet(s, ob)
    : ob.type === "dragon" ? drawDragon(s, ob)
    : drawPalm(s, ob);

  const drawBullet = (s, b) => {
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = s.night ? "#e5e7eb" : "#ef4444";
    ctx.fillRect(0, 0, b.w, b.h);
    ctx.restore();
  };

  const drawChest = (p) => {
    const { x, y, w, h } = p;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#f59e0b"; roundRect(0, 0, w, h, 4, true);
    ctx.fillStyle = "#8b5a2b"; ctx.fillRect(0, h * 0.5, w, h * 0.18);
    ctx.fillStyle = "#fff";
    ctx.fillRect(w * 0.48, h * 0.2, w * 0.04, h * 0.6);
    ctx.fillRect(w * 0.3, h * 0.45, w * 0.4, h * 0.08);
    ctx.restore();
  };

  const drawStar = (p) => {
    const { x, y, w, h, spin } = p;
    const r = Math.min(w, h) / 2;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(spin);
    const spikes = 5;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath(); ctx.moveTo(0, -r);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(Math.cos(rot) * r, Math.sin(rot) * r); rot += step;
      ctx.lineTo(Math.cos(rot) * r * 0.5, Math.sin(rot) * r * 0.5); rot += step;
    }
    ctx.lineTo(0, -r); ctx.closePath();
    ctx.fillStyle = "#facc15"; ctx.fill(); ctx.restore();
  };

  const drawGun = (s, p) => {
    const { x, y, w, h } = p;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = s.night ? "#ffffff" : "#1f2937";
    ctx.fillRect(0, h * 0.35, w * 0.85, h * 0.35);
    ctx.fillRect(w * 0.78, h * 0.28, w * 0.22, h * 0.14);
    ctx.fillRect(w * 0.18, 0, w * 0.2, h * 0.35);
    ctx.restore();
  };

  const drawMiniPowerup = (s, p) => {
    const { x, y, w, h } = p;
    ctx.save(); ctx.translate(x, y);
    if (currentSkinTier(s) >= 10) {
      const grad = ctx.createLinearGradient(0, 0, w * 0.8, 0);
      [[0, "#ef4444"], [0.2, "#facc15"], [0.4, "#10b981"], [0.6, "#3b82f6"],
       [0.8, "#8b5cf6"], [1, "#ec4899"]].forEach(([pos, c]) => grad.addColorStop(pos, c));
      ctx.fillStyle = grad;
    } else ctx.fillStyle = "#374151";
    roundRect(0, h * 0.25, w * 0.8, h * 0.6, 6, true);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(w * 0.6, h * 0.45, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  const drawFlamePowerup = (s, p) => {
    const { x, y, w, h } = p;
    const cx = x + w * 0.5, cy = y + h * 0.5, t = s.time;
    const flick = 1 + 0.06 * Math.sin(t * 12) + 0.04 * Math.sin(t * 20);
    ctx.save(); ctx.translate(cx, cy - h * 0.05 * Math.sin(t * 8)); ctx.scale(flick, flick);
    let grad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    grad.addColorStop(0, "#ef4444"); grad.addColorStop(0.5, "#f97316"); grad.addColorStop(1, "#fb923c");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, -h * 0.45);
    ctx.quadraticCurveTo(w * 0.34, -h * 0.1, w * 0.22, h * 0.3);
    ctx.quadraticCurveTo(0, h * 0.5, -w * 0.22, h * 0.3);
    ctx.quadraticCurveTo(-w * 0.34, -h * 0.1, 0, -h * 0.45);
    ctx.closePath(); ctx.fill();
    grad = ctx.createLinearGradient(0, -h * 0.3, 0, h * 0.3);
    grad.addColorStop(0, "#fde047"); grad.addColorStop(1, "#fff7ed");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, -h * 0.28);
    ctx.quadraticCurveTo(w * 0.18, -h * 0.02, w * 0.12, h * 0.18);
    ctx.quadraticCurveTo(0, h * 0.3, -w * 0.12, h * 0.18);
    ctx.quadraticCurveTo(-w * 0.18, -h * 0.02, 0, -h * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = s.night ? "rgba(255,255,255,0.8)" : "rgba(31,41,55,0.9)";
    ctx.stroke();
    ctx.restore();
  };

  const drawPlayerBullet = (pb) => {
    ctx.save(); ctx.translate(pb.x, pb.y);
    ctx.fillStyle = "#2563eb"; ctx.fillRect(0, 0, pb.w, pb.h);
    ctx.restore();
  };

  function drawParticles(s) {
    for (const p of s.particles) {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.save(); ctx.globalAlpha = alpha;
      const col = s.night ? p.colorNight : p.colorDay;
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.fillRect(p.x, p.y, p.size, p.size * 0.75);
      ctx.restore();
    }
  }

  function drawFloatingScores(s) {
    for (const fs of s.floatingScores) {
      const t = fs.age / fs.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      ctx.fillStyle = s.night ? "#fde047" : "#2563eb";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 4;
      ctx.fillText(fs.text, fs.x, fs.y);
      ctx.restore();
    }
  }

  function drawFlameBreath(s) {
    if (!(s.time < s.fireUntil)) return;
    const d = s.dino;
    const fx = d.x + d.w * 0.35, fy = d.y + d.h * 0.18, fw = 240, fh = d.h * 0.7;
    ctx.save();
    const grad = ctx.createLinearGradient(fx, fy, fx + fw, fy);
    grad.addColorStop(0, "rgba(255,237,213,0.95)");
    grad.addColorStop(0.5, "rgba(251,146,60,0.85)");
    grad.addColorStop(1, "rgba(239,68,68,0.00)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(fx, fy - fh * 0.35);
    ctx.quadraticCurveTo(fx + fw * 0.45, fy - fh * 0.55, fx + fw, fy);
    ctx.quadraticCurveTo(fx + fw * 0.45, fy + fh * 0.55, fx, fy + fh * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** 觀測疊圖：把 agent 當下鎖定的目標框出來（本專案新增，非原版內容）。 */
  function drawOverlay(s, targets) {
    if (!targets) return;
    const box = (o, color, label) => {
      if (!o) return;
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, o.x, o.y - 5);
      ctx.restore();
    };
    box(targets.obstacle, "#ef4444", "障礙");
    box(targets.bullet, "#f97316", "子彈");
    box(targets.powerup, "#22c55e", "道具");
    const d = s.dino;
    ctx.save();
    ctx.strokeStyle = "rgba(59,130,246,.9)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.strokeRect(d.x - d.w * 0.45, d.y, d.w * 0.9, d.h);
    ctx.restore();
  }

  /** 繪製順序與原版 draw() 完全一致。 */
  return function render(s, targets) {
    ctx.clearRect(0, 0, GEOM.W, GEOM.H);
    ctx.fillStyle = s.night ? "#0b1020" : "#eaf5ff";
    ctx.fillRect(0, 0, GEOM.W, GEOM.H);
    for (const c of s.clouds) drawCloud(s, c);
    drawGround(s);
    for (const ob of s.obstacles) drawOb(s, ob);
    for (const b of s.bullets) drawBullet(s, b);
    for (const p of s.powerups) {
      if (p.type === "chest") drawChest(p);
      else if (p.type === "star") drawStar(p);
      else if (p.type === "gun") drawGun(s, p);
      else if (p.type === "mini") drawMiniPowerup(s, p);
      else if (p.type === "flame") drawFlamePowerup(s, p);
    }
    drawFlameBreath(s);
    drawDino(s);
    drawFollowers(s);
    for (const pb of s.pBullets) drawPlayerBullet(pb);
    drawParticles(s);
    drawFloatingScores(s);
    drawOverlay(s, targets);
  };
}
