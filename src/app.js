// ── Input helper ──────────────────────────────────────────────────────────────

function v(id) {
    const el  = document.getElementById(id);
    let   val = parseFloat(el.value);
    if (isNaN(val)) val = 0;
    const lo = parseFloat(el.min);
    const hi = parseFloat(el.max);
    if (!isNaN(lo) && val < lo) val = lo;
    if (!isNaN(hi) && val > hi) val = hi;
    return val;
}

// ── Core calculation ──────────────────────────────────────────────────────────

function calc(rimIn, rimWin, et, tw, pr, spacer) {
    const rimDmm = rimIn * 25.4;
    const rimWmm = rimWin * 25.4;
    const sw = (tw * pr) / 100;
    const od = rimDmm + 2 * sw;
    const circ = Math.PI * od;
    const sp = spacer || 0;
    const effectiveET = et - sp;
    const inset = rimWmm / 2 + effectiveET;
    const poke = rimWmm / 2 - effectiveET;
    return {
        rimIn,
        rimDmm,
        rimWin,
        rimWmm,
        et,
        sp,
        effectiveET,
        tw,
        pr,
        sw,
        od,
        circ,
        inset,
        poke,
    };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n, d = 1) {
    return n.toFixed(d);
}

function signed(val, unit, d = 1) {
    const r = Math.round(val * 10) / 10;
    if (Math.abs(r) < 0.05) return '<span class="neu">—</span>';
    const sign = val > 0 ? "+" : "";
    return `${sign}${fmt(val, d)} ${unit}`;
}

// ── Main calculate ────────────────────────────────────────────────────────────

function calculate() {
    const o = calc(
        v("o-d"),
        v("o-w"),
        v("o-et"),
        v("o-tw"),
        v("o-pr"),
        v("o-sp"),
    );
    const n = calc(
        v("n-d"),
        v("n-w"),
        v("n-et"),
        v("n-tw"),
        v("n-pr"),
        v("n-sp"),
    );
    const oCam = v("o-cam");
    const nCam = v("n-cam");

    const L = window.L;
    const ref1 = L.refSpeed1;
    const ref2 = L.refSpeed2;
    const unit = L.speedUnit;

    const speedoErr = ((o.circ - n.circ) / n.circ) * 100;
    const r1 = (ref1 * o.circ) / n.circ;
    const r2 = (ref2 * o.circ) / n.circ;
    const rhGain = (n.od - o.od) / 2;

    const tips = {
        [L.rowDiameter]:      L.tipDiameter,
        [L.rowCircumference]: L.tipCircumference,
        [L.rowPoke]:          L.tipPoke,
        [L.rowInset]:         L.tipInset,
        [L.rowSpeedoError]:   L.tipSpeedoError,
        [L.rowAt1]:           L.tipAt1,
        [L.rowAt2]:           L.tipAt2,
        [L.rowRideHeight]:    L.tipRideHeight,
        [L.rowArchGap]:       L.tipArchGap,
    };

    const rows = [
        [
            L.rowDiameter,
            `${fmt(o.od)} mm`,
            `${fmt(n.od)} mm`,
            signed(n.od - o.od, "mm"),
        ],
        [
            L.rowCircumference,
            `${fmt(o.circ)} mm`,
            `${fmt(n.circ)} mm`,
            signed(n.circ - o.circ, "mm"),
        ],
        [
            L.rowPoke,
            `${fmt(o.poke)} mm`,
            `${fmt(n.poke)} mm`,
            signed(n.poke - o.poke, "mm"),
        ],
        [
            L.rowInset,
            `${fmt(o.inset)} mm`,
            `${fmt(n.inset)} mm`,
            signed(n.inset - o.inset, "mm"),
        ],
        [
            L.rowSpeedoError,
            "0.00 %",
            `${fmt(speedoErr, 2)} %`,
            signed(speedoErr, "%", 2),
        ],
        [
            L.rowAt1,
            `${fmt(ref1, 1)} ${unit}`,
            `${fmt(r1, 1)} ${unit}`,
            signed(r1 - ref1, unit),
        ],
        [
            L.rowAt2,
            `${fmt(ref2, 1)} ${unit}`,
            `${fmt(r2, 1)} ${unit}`,
            signed(r2 - ref2, unit),
        ],
        [
            L.rowRideHeight,
            "0.0 mm",
            `${fmt(rhGain)} mm`,
            signed(rhGain, "mm"),
        ],
        [L.rowArchGap, "0.0 mm", `${fmt(rhGain)} mm`, signed(rhGain, "mm")],
    ];

    document.getElementById("tbody").innerHTML = rows
        .map(
            ([label, ov, nv, dv]) =>
                `<tr><th scope="row" data-tip="${tips[label] || ""}" title="${tips[label] || ""}">${label}</th><td>${ov}</td><td>${nv}</td><td>${dv}</td></tr>`,
        )
        .join("");

    document.getElementById("results").classList.add("show");
    drawDiagram(o, n, oCam, nCam);

    document
        .getElementById("cv")
        .setAttribute(
            "aria-label",
            L.canvasAriaLabelDynamic
                .replace("{oDiameter}", fmt(o.od))
                .replace("{nDiameter}", fmt(n.od))
                .replace("{oPoke}", fmt(o.poke))
                .replace("{nPoke}", fmt(n.poke)),
        );

    document.getElementById("calc-status").textContent = L.calcStatus;
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function arrow(ctx, x1, y1, x2, y2, col) {
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 7 * Math.cos(ang - 0.4), y2 - 7 * Math.sin(ang - 0.4));
    ctx.lineTo(x2 - 7 * Math.cos(ang + 0.4), y2 - 7 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// ── Tyre cross-section path ───────────────────────────────────────────────────
// Sidewalls use quadratic curves; shoulder corners are rounded with radius sr.

function tyrePath(ctx, rimCX, cy, tHW, tHH, rHW, rHH) {
    const sr = Math.min((tHH - rHH) * 0.32, tHW * 0.18, 14);

    ctx.beginPath();
    ctx.moveTo(rimCX - tHW + sr, cy - tHH);
    ctx.lineTo(rimCX + tHW - sr, cy - tHH);
    ctx.quadraticCurveTo(rimCX + tHW, cy - tHH, rimCX + tHW, cy - tHH + sr);
    ctx.quadraticCurveTo(rimCX + tHW, cy - rHH, rimCX + rHW, cy - rHH);
    ctx.lineTo(rimCX + rHW, cy + rHH);
    ctx.quadraticCurveTo(rimCX + tHW, cy + rHH, rimCX + tHW, cy + tHH - sr);
    ctx.quadraticCurveTo(rimCX + tHW, cy + tHH, rimCX + tHW - sr, cy + tHH);
    ctx.lineTo(rimCX - tHW + sr, cy + tHH);
    ctx.quadraticCurveTo(rimCX - tHW, cy + tHH, rimCX - tHW, cy + tHH - sr);
    ctx.quadraticCurveTo(rimCX - tHW, cy + rHH, rimCX - rHW, cy + rHH);
    ctx.lineTo(rimCX - rHW, cy - rHH);
    ctx.quadraticCurveTo(rimCX - tHW, cy - rHH, rimCX - tHW, cy - tHH + sr);
    ctx.quadraticCurveTo(rimCX - tHW, cy - tHH, rimCX - tHW + sr, cy - tHH);
    ctx.closePath();
}

// ── Draw one wheel/tyre assembly ─────────────────────────────────────────────

function drawSetup(ctx, w, hubX, cy, scale, color, camberDeg) {
    const tHW = (w.tw / 2) * scale;
    const tHH = (w.od / 2) * scale;
    const rHW = (w.rimWmm / 2) * scale;
    const rHH = (w.rimDmm / 2) * scale;
    const rimCX = hubX - w.effectiveET * scale;

    ctx.save();
    if (camberDeg) {
        ctx.translate(rimCX, cy);
        ctx.rotate((camberDeg * Math.PI) / 180);
        ctx.translate(-rimCX, -cy);
    }

    // Tyre rubber fill
    ctx.fillStyle = `${color}20`;
    tyrePath(ctx, rimCX, cy, tHW, tHH, rHW, rHH);
    ctx.fill();

    // Tread pattern — clipped so grooves respect the rounded shoulders
    ctx.save();
    tyrePath(ctx, rimCX, cy, tHW, tHH, rHW, rHH);
    ctx.clip();
    const treadD = Math.min(15, (tHH - rHH) * 0.22);
    const nGroove = 5;
    const bandH = treadD / nGroove;
    ctx.fillStyle = `${color}2e`;
    for (let i = 1; i < nGroove; i += 2) {
        ctx.fillRect(rimCX - tHW, cy - tHH + i * bandH, tHW * 2, bandH);
        ctx.fillRect(rimCX - tHW, cy + tHH - (i + 1) * bandH, tHW * 2, bandH);
    }
    ctx.restore();

    // Tyre outline
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth = 2.5;
    tyrePath(ctx, rimCX, cy, tHW, tHH, rHW, rHH);
    ctx.stroke();

    // Rim barrel
    ctx.fillStyle = `${color}14`;
    ctx.strokeStyle = `${color}55`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(rimCX - rHW, cy - rHH, rHW * 2, rHH * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore(); // undo camber rotation
}

// ── Hub (mounting flange + mounting-face line) ───────────────────────────────

function drawHub(ctx, hubX, cy, rHH) {
    const fR = rHH * 0.42; // flange half-height
    const fD = Math.max(10, rHH * 0.1); // flange thickness

    // Hub flange — the face the wheel bolts to
    ctx.fillStyle = "#253044";
    ctx.strokeStyle = "#4a6080";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(hubX - fD, cy - fR, fD, fR * 2);
    ctx.fill();
    ctx.stroke();

    // Mounting-face line (where the wheel meets the hub)
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(hubX, cy - fR - 6);
    ctx.lineTo(hubX, cy + fR + 6);
    ctx.stroke();
}

// ── Measurement row (arrow + flanking labels) ─────────────────────────────────
// tag    → right-aligned left of hub tick
// detail → left-aligned right of outer tick, clamped to maxX

function pokeRow(ctx, hubX, outerX, y, color, tag, detail, maxX) {
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hubX, y - 5);
    ctx.lineTo(hubX, y + 5);
    ctx.moveTo(outerX, y - 5);
    ctx.lineTo(outerX, y + 5);
    ctx.stroke();
    arrow(ctx, hubX, y, outerX, y, `${color}aa`);

    ctx.fillStyle = `${color}cc`;
    ctx.font = "16px monospace";

    ctx.textAlign = "right";
    ctx.fillText(tag, hubX - 8, y + 5);

    const tw = ctx.measureText(detail).width;
    let lx = outerX + 8;
    if (maxX !== undefined && lx + tw > maxX) lx = maxX - tw - 4;
    ctx.textAlign = "left";
    ctx.fillText(detail, lx, y + 5);
}

// ── Suspension components (illustrative) ─────────────────────────────────────

function drawSuspension(ctx, hubX, cy, avgRHH, topPad) {
    const fR = avgRHH * 0.44;
    const fD = Math.max(12, avgRHH * 0.08);
    const hD = avgRHH * 0.52;

    const col = "rgba(148, 163, 184, 0.82)";
    const lw = Math.max(2, avgRHH * 0.03);

    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ── Knuckle (upright) ─────────────────────────────────────────────────────
    // Sits just inboard of the hub flange. The hub, lower arm and strut all
    // join the knuckle; the lower ball joint is at its base.
    const kX = hubX - fD - lw * 2;
    const kTopY = cy - fR * 0.6; // just above hub centre
    const kBotY = cy + fR * 1.1; // lower ball joint — strut + arm attach here

    // Knuckle body: vertical bar
    ctx.lineWidth = lw * 3.5;
    ctx.beginPath();
    ctx.moveTo(kX, kTopY);
    ctx.lineTo(kX, kBotY);
    ctx.stroke();

    // Lower ball-joint tab
    ctx.lineWidth = lw * 1.5;
    const tab = lw * 3;
    ctx.beginPath();
    ctx.moveTo(kX - tab, kBotY);
    ctx.lineTo(kX + tab, kBotY);
    ctx.stroke();

    // ── Lower wishbone (A-arm) — from lower ball joint inboard ────────────────
    const m1X = kX - hD * 2.2;
    const m1Y = kBotY + fR * 0.28;
    const m2X = kX - hD * 2.2;
    const m2Y = kBotY + fR * 0.0;

    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(kX, kBotY);
    ctx.lineTo(m1X, m1Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(kX, kBotY);
    ctx.lineTo(m2X, m2Y);
    ctx.stroke();

    // Joints (lower ball joint + two inner pivots)
    for (const [x, y, r] of [
        [kX, kBotY, lw * 2.2],
        [m1X, m1Y, lw * 1.8],
        [m2X, m2Y, lw * 1.8],
    ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── MacPherson strut — rises from the lower ball joint, leaning inboard ──
    const strutBX = kX;
    const strutBY = kBotY;
    const strutTopY = topPad + 12;
    const strutTX = kX - hD * 2.6; // modest, proportional inboard lean

    const dx = strutTX - strutBX;
    const dy = strutTopY - strutBY;
    const dist = Math.hypot(dx, dy);
    const px = -dy / dist; // perpendicular direction for spring
    const py = dx / dist;

    // Damper body (lower 35%, thick)
    const splitT = 0.35;
    const midX = strutBX + dx * splitT;
    const midY = strutBY + dy * splitT;
    ctx.lineWidth = lw * 4.5;
    ctx.beginPath();
    ctx.moveTo(strutBX, strutBY);
    ctx.lineTo(midX, midY);
    ctx.stroke();

    // Piston rod (upper 65%, thin)
    ctx.lineWidth = lw * 1.5;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(strutTX, strutTopY);
    ctx.stroke();

    // Coil spring (zigzag perpendicular to strut axis)
    const amp = lw * 3.8;
    const coils = 9;
    const sStart = splitT + 0.04;
    const sEnd = 0.9;
    ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    for (let i = 0; i <= coils; i++) {
        const t = sStart + (sEnd - sStart) * (i / coils);
        const side = i % 2 === 0 ? 1 : -1;
        const x = strutBX + dx * t + px * amp * side;
        const y = strutBY + dy * t + py * amp * side;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Top mount plate (perpendicular bar at body attachment)
    const mw = lw * 7;
    ctx.lineWidth = lw * 2.5;
    ctx.beginPath();
    ctx.moveTo(strutTX - px * mw, strutTopY - py * mw);
    ctx.lineTo(strutTX + px * mw, strutTopY + py * mw);
    ctx.stroke();

    ctx.restore();
}

// ── Main diagram ──────────────────────────────────────────────────────────────

function drawDiagram(o, n, oCam, nCam) {
    const canvas = document.getElementById("cv");
    const W = canvas.width,
        H = canvas.height;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    const sidePad = 90;
    const topPad = 46;
    const botPad = 110;
    const availW = W - 2 * sidePad;
    const availH = H - topPad - botPad;

    const maxIn = Math.max(o.tw / 2 + o.effectiveET, n.tw / 2 + n.effectiveET);
    const maxOut = Math.max(o.tw / 2 - o.effectiveET, n.tw / 2 - n.effectiveET);
    const maxOD = Math.max(o.od, n.od);
    const scale = Math.min(availW / (maxIn + maxOut), availH / maxOD);

    const drawnW = (maxIn + maxOut) * scale;
    const hubX = (W - drawnW) / 2 + maxIn * scale;
    const cy = topPad + availH / 2;

    // Suspension (drawn first so wheels render on top where they overlap)
    const avgRHH = ((o.rimDmm / 2 + n.rimDmm / 2) / 2) * scale;
    drawSuspension(ctx, hubX, cy, avgRHH, topPad);

    // Wheel assemblies
    drawSetup(ctx, o, hubX, cy, scale, "#58a6ff", oCam);
    drawSetup(ctx, n, hubX, cy, scale, "#f78166", nCam);

    const oTH = o.od * scale;
    const nTH = n.od * scale;
    const maxTH = Math.max(oTH, nTH);

    // Hub
    drawHub(ctx, hubX, cy, avgRHH);

    // Diameter callouts — vertical arrows with label at mid-height
    const oRimCX = hubX - o.effectiveET * scale;
    const nRimCX = hubX - n.effectiveET * scale;

    const oDLeft = oRimCX - (o.tw / 2) * scale;
    const aL = oDLeft - 26;

    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = "#58a6ff33";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(oDLeft, cy - oTH / 2);
    ctx.lineTo(aL + 4, cy - oTH / 2);
    ctx.moveTo(oDLeft, cy + oTH / 2);
    ctx.lineTo(aL + 4, cy + oTH / 2);
    ctx.stroke();
    ctx.restore();

    arrow(ctx, aL, cy + oTH / 2, aL, cy - oTH / 2, "#58a6ffaa");
    ctx.fillStyle = "#58a6ff";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`Ø${o.od.toFixed(0)} mm`, aL - 6, cy + 6);

    const nDRight = nRimCX + (n.tw / 2) * scale;
    const aR = nDRight + 26;

    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = "#f7816633";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(nDRight, cy - nTH / 2);
    ctx.lineTo(aR - 4, cy - nTH / 2);
    ctx.moveTo(nDRight, cy + nTH / 2);
    ctx.lineTo(aR - 4, cy + nTH / 2);
    ctx.stroke();
    ctx.restore();

    arrow(ctx, aR, cy + nTH / 2, aR, cy - nTH / 2, "#f78166aa");
    ctx.fillStyle = "#f78166";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Ø${n.od.toFixed(0)} mm`, aR + 6, cy + 6);

    // Info rows below — width + ET (+ spacer if any) + poke
    const py1 = cy + maxTH / 2 + 28;
    const py2 = py1 + 44;

    const oETlabel = o.sp ? `ET${o.et} -${o.sp}sp` : `ET${o.et}`;
    const nETlabel = n.sp ? `ET${n.et} -${n.sp}sp` : `ET${n.et}`;

    const L = window.L;
    pokeRow(
        ctx,
        hubX,
        oRimCX + (o.rimWmm / 2) * scale,
        py1,
        "#58a6ff",
        L.canvasCurrent,
        `${o.tw} mm ${L.canvasWide}   ${oETlabel}   ${L.canvasPoke} ${o.poke.toFixed(1)} mm`,
        W - 8,
    );
    pokeRow(
        ctx,
        hubX,
        nRimCX + (n.rimWmm / 2) * scale,
        py2,
        "#f78166",
        L.canvasNew,
        `${n.tw} mm ${L.canvasWide}   ${nETlabel}   ${L.canvasPoke} ${n.poke.toFixed(1)} mm`,
        W - 8,
    );

    // Legend
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#58a6ff";
    ctx.fillText(`■ ${L.canvasCurrent}`, W / 2 - 60, 28);
    ctx.fillStyle = "#f78166";
    ctx.fillText(`■ ${L.canvasNew}`, W / 2 + 48, 28);
}

// ── Floating tooltip ──────────────────────────────────────────────────────────

const tip = document.createElement("div");
tip.id = "tip";
tip.setAttribute("role", "tooltip");
tip.setAttribute("aria-hidden", "true");
document.body.appendChild(tip);

function showTip(text) {
    tip.textContent = text;
    tip.style.opacity = "1";
}

function hideTip() {
    tip.style.opacity = "0";
}

function positionTipAtMouse(e) {
    const pad = 12;
    const tw = tip.offsetWidth,
        th = tip.offsetHeight;
    const x =
        e.clientX + pad + tw > window.innerWidth
            ? e.clientX - tw - pad
            : e.clientX + pad;
    const y =
        e.clientY + pad + th > window.innerHeight
            ? e.clientY - th - pad
            : e.clientY + pad;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
}

function positionTipAtElement(el) {
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(rect.left, window.innerWidth - tip.offsetWidth - pad);
    const y =
        rect.bottom + pad + tip.offsetHeight > window.innerHeight
            ? rect.top - tip.offsetHeight - pad
            : rect.bottom + pad;
    tip.style.left = `${Math.max(pad, x)}px`;
    tip.style.top = `${y}px`;
}

document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el?.dataset.tip) return;
    showTip(el.dataset.tip);
});

document.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-tip]")) hideTip();
});

document.addEventListener("mousemove", (e) => {
    if (tip.style.opacity === "0") return;
    positionTipAtMouse(e);
});

document.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el?.dataset.tip) return;
    showTip(el.dataset.tip);
    positionTipAtElement(el);
});

document.addEventListener("focusout", (e) => {
    if (e.target.closest("[data-tip]")) hideTip();
});

// ── URL share ────────────────────────────────────────────────────────────────

const PARAMS = {
    "o-d": "od",
    "o-w": "ow",
    "o-et": "oet",
    "o-tw": "otw",
    "o-pr": "opr",
    "o-sp": "osp",
    "o-cam": "ocam",
    "n-d": "nd",
    "n-w": "nw",
    "n-et": "net",
    "n-tw": "ntw",
    "n-pr": "npr",
    "n-sp": "nsp",
    "n-cam": "ncam",
};

function buildShareUrl() {
    const p = new URLSearchParams();
    for (const [id, key] of Object.entries(PARAMS)) {
        p.set(key, document.getElementById(id).value);
    }
    return `${location.origin}${location.pathname}?${p}`;
}

function loadFromParams() {
    const p = new URLSearchParams(location.search);
    const reverse = Object.fromEntries(
        Object.entries(PARAMS).map(([id, key]) => [key, id]),
    );
    for (const [key, id] of Object.entries(reverse)) {
        const val = p.get(key);
        if (val !== null) document.getElementById(id).value = val;
    }
}

function _share() {
    const url = buildShareUrl();
    const btn = document.getElementById("share-btn");
    const L = window.L;

    function copied() {
        btn.textContent = L.shareCopied;
        btn.classList.add("copied");
        setTimeout(() => {
            btn.textContent = L.shareBtn;
            btn.classList.remove("copied");
        }, 2000);
    }

    if (navigator.share) {
        navigator.share({ title: document.title, url }).catch(() => {});
    } else {
        navigator.clipboard
            .writeText(url)
            .then(copied)
            .catch(() => {
                const tmp = document.createElement("input");
                tmp.value = url;
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand("copy");
                tmp.remove();
                copied();
            });
    }
}

// ── Language switcher dropdown ────────────────────────────────────────────────

function initLangSwitcher() {
    const switcher = document.querySelector(".lang-switcher");
    const trigger  = switcher && switcher.querySelector(".lang-trigger");
    if (!trigger) return;

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = switcher.classList.toggle("open");
        trigger.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", () => {
        if (switcher.classList.contains("open")) {
            switcher.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && switcher.classList.contains("open")) {
            switcher.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
            trigger.focus();
        }
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.onload = () => {
    loadFromParams();
    calculate();
    initLangSwitcher();
};
