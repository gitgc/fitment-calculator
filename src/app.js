// ── Site config (injected by build.js from site.config.json) ───────────────────
// Brand shown on the diagrams. Empty string when not configured → nothing drawn.
const BRAND = window.SITE?.brand ?? "";

// ── Input helper ──────────────────────────────────────────────────────────────

function v(id) {
    const el = document.getElementById(id);
    let val = parseFloat(el.value);
    if (Number.isNaN(val)) val = 0;
    const lo = parseFloat(el.min);
    const hi = parseFloat(el.max);
    if (!Number.isNaN(lo) && val < lo) val = lo;
    if (!Number.isNaN(hi) && val > hi) val = hi;
    return val;
}

// Like v(), but a blank field stays 0 ("unspecified") instead of clamping up to
// the minimum. Any value that *is* provided is still clamped to the input's
// declared min/max, so an out-of-range entry (e.g. via a crafted share URL or
// manual edit) can't bypass the stated limits.
function vOptional(id) {
    const el = document.getElementById(id);
    if (el.value.trim() === "") return 0;
    const val = parseFloat(el.value);
    if (Number.isNaN(val)) return 0;
    const lo = parseFloat(el.min);
    const hi = parseFloat(el.max);
    if (!Number.isNaN(lo) && val < lo) return lo;
    if (!Number.isNaN(hi) && val > hi) return hi;
    return val;
}

// ── Tyre size notation ──────────────────────────────────────────────────────────
// Parses standard metric tyre codes into { tw, pr, rim }, e.g. "225/45R17",
// "P225/45ZR17", "225/45-17", "225 / 45 r 17", "225/45R17 91W". Returns null if
// the string doesn't match. The pattern is anchored to the start (after an
// optional P/LT/ST/T service prefix) so a longer leading number like "1225/45R17"
// can't sneak through as a substring; trailing load/speed text is ignored. Value
// ranges are NOT checked here — the call site validates each number against the
// matching <input>'s own min/max so the bounds can never drift from the UI.

function parseTyreSize(str) {
    const m = String(str).match(
        /^\s*(?:lt|st|p|t)?\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:z?\s*r|-)\s*(\d{2}(?:\.\d)?)(?!\d)/i,
    );
    if (!m) return null;
    return {
        tw: parseInt(m[1], 10),
        pr: parseInt(m[2], 10),
        rim: parseFloat(m[3]),
    };
}

// True if `val` is within the [min, max] declared on the input with this id.
function withinInputRange(id, val) {
    const el = document.getElementById(id);
    const lo = parseFloat(el.min);
    const hi = parseFloat(el.max);
    return (Number.isNaN(lo) || val >= lo) && (Number.isNaN(hi) || val <= hi);
}

function formatTyreSize(tw, pr, rim) {
    return `${tw}/${pr}R${rim}`;
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

// Escape localized text before placing it in an HTML string. Needed because some
// locales contain literal double quotes (e.g. Hebrew "מ\"מ"), which would
// otherwise break out of the data-tip/title attributes.
function escapeHTML(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// A typical modern PCD, assumed when no bolt pattern is selected.
const DEFAULT_BOLT = "5x114.3";

// "5x114.3" → { count: 5, pcd: 114.3 }; null if it can't be parsed.
function parseBolt(s) {
    const m = /^(\d+)x([\d.]+)$/.exec(s);
    return m ? { count: +m[1], pcd: parseFloat(m[2]) } : null;
}

// Display form, e.g. "5x114.3" → "5×114.3".
function fmtBolt(s) {
    return s.replace("x", "×");
}

// ── Fitment assessment (Tier 1 + 2 warnings) ───────────────────────────────────
// Returns { rows: { [rowLabel]: {severity, message} }, setup: [{severity, message}] }
// where severity is "warn" (caution) or "danger". Thresholds are deliberately
// lenient so that common, sensible setups don't trip false alarms. Row-bound
// checks tint the matching table row; setup-level checks (which have no
// comparison row) collect into `setup` and render in the strip below the table.
function assessFitment(
    o,
    n,
    nCam,
    oBore = 0,
    nBore = 0,
    oBolt = "",
    nBolt = "",
) {
    const L = window.L;
    const rows = {};
    const setup = [];

    // Rolling-diameter change — affects speedo, ABS/traction control, gearing,
    // clearance. (Circumference change is identical, so we key it to Diameter.)
    const absPct = Math.abs(((n.od - o.od) / o.od) * 100);
    if (absPct >= 2) {
        rows[L.rowDiameter] = {
            severity: absPct > 3 ? "danger" : "warn",
            message: L.warnDiameter.replace("{pct}", fmt(absPct, 1)),
        };
    }

    // Speedometer accuracy. speedoErr < 0 means the dial under-reads (true speed
    // higher than shown) — the legally relevant, riskier direction.
    const speedoErr = (o.circ / n.circ - 1) * 100;
    if (speedoErr <= -2) {
        rows[L.rowSpeedoError] = {
            severity: speedoErr <= -5 ? "danger" : "warn",
            message: L.warnSpeedoUnder,
        };
    } else if (speedoErr >= 10) {
        rows[L.rowSpeedoError] = {
            severity: "warn",
            message: L.warnSpeedoOver,
        };
    }

    // Poke / inset clearance — car-specific (depends on the actual arch and
    // suspension), so judged on how much further out/in the new setup sits than
    // the current one, and worded as advisory ("check clearance").
    const pokeUp = n.poke - o.poke;
    if (pokeUp > 20) {
        rows[L.rowPoke] = {
            severity: pokeUp > 30 ? "danger" : "warn",
            message: L.warnPoke,
        };
    }
    const insetUp = n.inset - o.inset;
    if (insetUp > 15) {
        rows[L.rowInset] = {
            severity: insetUp > 25 ? "danger" : "warn",
            message: L.warnInset,
        };
    }

    // Arch gap — the whole point of the tool is to *close* it. A taller tyre fills
    // the arch (gap "lost", positive). A negative value means the new setup OPENS
    // the gap, i.e. works against the goal — flag it (advisory, not unsafe).
    if ((n.od - o.od) / 2 < -0.5) {
        rows[L.rowArchGap] = { severity: "warn", message: L.warnArchGapOpen };
    }

    // Tyre stretch / bulge for the new setup — rim width vs tyre section width.
    // idealRim (inches) ≈ section_mm / 30 is a reasonable linear approximation.
    const delta = n.rimWin - n.tw / 30;
    const absDelta = Math.abs(delta);
    if (absDelta > 1) {
        setup.push({
            severity: absDelta > 2 ? "danger" : "warn",
            message: delta > 0 ? L.warnStretch : L.warnBulge,
        });
    }

    // ── Tier 2 — new-setup properties ──────────────────────────────────────────
    // Low-profile tyre — harsher ride, higher pothole/wheel damage risk.
    if (n.pr < 30) {
        setup.push({
            severity: n.pr < 25 ? "danger" : "warn",
            message: L.warnLowProfile,
        });
    }
    // Large wheel spacer — stud engagement / hub-centric concerns.
    if (n.sp > 15) {
        setup.push({
            severity: n.sp > 25 ? "danger" : "warn",
            message: L.warnSpacer,
        });
    }
    // Aggressive camber — inner-edge wear, reduced braking contact patch.
    const absCam = Math.abs(nCam);
    if (absCam > 2.5) {
        setup.push({
            severity: absCam > 4 ? "danger" : "warn",
            message: L.warnCamber,
        });
    }
    // Centre bore (optional — only when both are given). The current wheel fits
    // the hub, so its bore is the reference. A smaller new bore won't clear the
    // hub at all (danger); a larger one fits but needs hub-centric rings (caution).
    // Bound to its own table row, which calculate() only shows when bore is set.
    if (oBore > 0 && nBore > 0 && nBore !== oBore) {
        rows[L.rowBore] =
            nBore < oBore
                ? { severity: "danger", message: L.warnBoreSmaller }
                : { severity: "warn", message: L.warnBoreLarger };
    }

    // Bolt pattern (optional). Unspecified sides assume the typical default, so a
    // genuine mismatch only shows when at least one side was chosen. A small
    // change in stud count and PCD is commonly bridged by off-the-shelf adapters
    // (caution); a large change usually isn't safely adaptable (danger).
    const oPat = parseBolt(oBolt || DEFAULT_BOLT);
    const nPat = parseBolt(nBolt || DEFAULT_BOLT);
    if (oPat && nPat && (oPat.count !== nPat.count || oPat.pcd !== nPat.pcd)) {
        const adaptable =
            Math.abs(oPat.count - nPat.count) <= 1 &&
            Math.abs(oPat.pcd - nPat.pcd) <= 30;
        rows[L.rowBolt] = adaptable
            ? { severity: "warn", message: L.warnBoltAmber }
            : { severity: "danger", message: L.warnBoltRed };
    }

    // Danger before caution, so the most serious advice leads the strip.
    setup.sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1,
    );

    return { rows, setup };
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
    // Centre bore is optional and not used in any geometry — read it raw so an
    // empty field stays 0 ("not specified"); any provided value is clamped.
    const oBore = vOptional("o-cb");
    const nBore = vOptional("n-cb");
    // Bolt pattern is optional; an unset side falls back to the typical default.
    const oBolt = document.getElementById("o-bp").value;
    const nBolt = document.getElementById("n-bp").value;
    // Per-wheel spoke design (count + width %). Clamped by the input helper.
    const oSpokes = Math.round(v("o-spokes"));
    const nSpokes = Math.round(v("n-spokes"));
    const oSpokeW = v("o-spokew") / 100;
    const nSpokeW = v("n-spokew") / 100;

    const L = window.L;
    const ref1 = L.refSpeed1;
    const ref2 = L.refSpeed2;
    const unit = L.speedUnit;

    const speedoErr = ((o.circ - n.circ) / n.circ) * 100;
    const r1 = (ref1 * o.circ) / n.circ;
    const r2 = (ref2 * o.circ) / n.circ;
    const rhGain = (n.od - o.od) / 2;

    const tips = {
        [L.rowDiameter]: L.tipDiameter,
        [L.rowCircumference]: L.tipCircumference,
        [L.rowPoke]: L.tipPoke,
        [L.rowInset]: L.tipInset,
        [L.rowSpeedoError]: L.tipSpeedoError,
        [L.rowAt1]: L.tipAt1,
        [L.rowAt2]: L.tipAt2,
        [L.rowRideHeight]: L.tipRideHeight,
        [L.rowArchGap]: L.tipArchGap,
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
        [L.rowRideHeight, "0.0 mm", `${fmt(rhGain)} mm`, signed(rhGain, "mm")],
        [L.rowArchGap, "0.0 mm", `${fmt(rhGain)} mm`, signed(rhGain, "mm")],
    ];

    // Optional centre-bore row — only shown when the user supplied a bore. Each
    // side falls back to "—" when blank, and the difference only when both exist.
    if (oBore > 0 || nBore > 0) {
        const dash = '<span class="neu">—</span>';
        tips[L.rowBore] = L.tipBore;
        rows.push([
            L.rowBore,
            oBore > 0 ? `${fmt(oBore)} mm` : dash,
            nBore > 0 ? `${fmt(nBore)} mm` : dash,
            oBore > 0 && nBore > 0 ? signed(nBore - oBore, "mm") : dash,
        ]);
    }

    // Optional bolt-pattern row — shown when either side was chosen. Unset sides
    // display the assumed default; the difference reads "old → new" when they vary.
    if (oBolt || nBolt) {
        const oEff = oBolt || DEFAULT_BOLT;
        const nEff = nBolt || DEFAULT_BOLT;
        tips[L.rowBolt] = L.tipBolt;
        rows.push([
            L.rowBolt,
            fmtBolt(oEff),
            fmtBolt(nEff),
            oEff === nEff
                ? '<span class="neu">—</span>'
                : `${fmtBolt(oEff)} → ${fmtBolt(nEff)}`,
        ]);
    }

    const assess = assessFitment(o, n, nCam, oBore, nBore, oBolt, nBolt);

    document.getElementById("tbody").innerHTML = rows
        .map(([label, ov, nv, dv]) => {
            // label and tip are localized text → escape. ov/nv/dv contain
            // intentional <span> markup from signed() → leave as-is.
            const tip = escapeHTML(tips[label] || "");
            const w = assess.rows[label];
            const rowClass = w ? ` class="row-${w.severity}"` : "";
            const reason = w
                ? `<div class="row-reason">⚠ ${escapeHTML(w.message)}</div>`
                : "";
            return `<tr${rowClass}><th scope="row" data-tip="${tip}" title="${tip}">${escapeHTML(label)}${reason}</th><td>${ov}</td><td>${nv}</td><td>${dv}</td></tr>`;
        })
        .join("");

    // Setup-level warnings (e.g. tyre stretch) — no comparison row to attach to
    const warnEl = document.getElementById("fitment-warnings");
    if (warnEl) {
        warnEl.innerHTML = assess.setup
            .map(
                (w) =>
                    `<p class="fitment-warning fitment-${w.severity}">⚠ ${escapeHTML(w.message)}</p>`,
            )
            .join("");
    }

    document.getElementById("results").classList.add("show");
    drawDiagram(o, n, oCam, nCam);
    // Stash the render args so the spin animation can redraw the wheel at any
    // angle without recalculating, then draw at the current rotation.
    faceArgs = [
        o,
        n,
        oCam,
        nCam,
        oBore,
        nBore,
        oBolt || DEFAULT_BOLT,
        nBolt || DEFAULT_BOLT,
        oSpokes,
        nSpokes,
        oSpokeW,
        nSpokeW,
    ];
    renderFace();

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

    document
        .getElementById("cv2")
        ?.setAttribute(
            "aria-label",
            `${L.faceTitle}: ${L.canvasCurrent} ${formatTyreSize(o.tw, o.pr, o.rimIn)} Ø${fmt(o.od, 0)} mm, ${L.canvasNew} ${formatTyreSize(n.tw, n.pr, n.rimIn)} Ø${fmt(n.od, 0)} mm`,
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
// tag    → right-aligned left of the hub tick
// detail → right-aligned at the right margin (maxX), free to extend left as far
//          as just right of the hub. The detail font shrinks if even that span
//          is too narrow, so long translations never overlap the wheel or run
//          off-canvas. For short labels the detail stays right of the wheel and
//          the full hub→rim arrow is drawn, as before.

function pokeRow(ctx, hubX, outerX, y, color, tag, detail, maxX) {
    const rightX = (maxX !== undefined ? maxX : outerX + 8) - 4;
    const minX = hubX + 8; // detail may use the whole span from here to rightX

    // Size the detail to fit the available width, shrinking from 16px if needed
    let fontPx = 16;
    ctx.font = `${fontPx}px monospace`;
    const avail = rightX - minX;
    while (ctx.measureText(detail).width > avail && fontPx > 10) {
        fontPx -= 1;
        ctx.font = `${fontPx}px monospace`;
    }
    const detailLeft = rightX - ctx.measureText(detail).width;

    // Ticks + arrow — arrow stops before the detail text so they never overlap
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hubX, y - 5);
    ctx.lineTo(hubX, y + 5);
    if (outerX < detailLeft - 2) {
        ctx.moveTo(outerX, y - 5);
        ctx.lineTo(outerX, y + 5);
    }
    ctx.stroke();
    const arrowEnd = Math.min(outerX, detailLeft - 6);
    if (arrowEnd > hubX + 2) arrow(ctx, hubX, y, arrowEnd, y, `${color}aa`);

    // Tag — right-aligned just left of the hub tick
    ctx.fillStyle = `${color}cc`;
    ctx.font = "16px monospace";
    ctx.textAlign = "right";
    ctx.fillText(tag, hubX - 8, y + 5);

    // Detail — right-aligned at the margin, drawn last so it sits above the arrow
    ctx.font = `${fontPx}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText(detail, detailLeft, y + 5);
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

    // ── Watermark — brand etched along the damper body, following its slope ────
    // Sits on the lower shaft so a shared screenshot is always attributed.
    if (BRAND) {
        const damperLen = dist * splitT;
        ctx.save();
        ctx.translate((strutBX + midX) / 2, (strutBY + midY) / 2);
        ctx.rotate(Math.atan2(-dy, -dx)); // align with the shaft, sloping down-right
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "10px sans-serif";
        const w10 = ctx.measureText(BRAND).width || 1;
        const wmFont = Math.max(8, Math.min(13, (damperLen * 0.9 * 10) / w10));
        ctx.font = `${wmFont}px sans-serif`;
        ctx.fillStyle = "rgba(13, 17, 23, 0.7)"; // dark, like etching on the metal
        ctx.fillText(BRAND, 0, 0);
        ctx.restore();
    }

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
    ctx.fillText(`Ø${o.od.toFixed(0)} mm`, aL - 6, cy - 3);
    ctx.font = "13px monospace";
    ctx.fillText(formatTyreSize(o.tw, o.pr, o.rimIn), aL - 6, cy + 15);

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
    ctx.fillText(`Ø${n.od.toFixed(0)} mm`, aR + 6, cy - 3);
    ctx.font = "13px monospace";
    ctx.fillText(formatTyreSize(n.tw, n.pr, n.rimIn), aR + 6, cy + 15);

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

// ── Face-on view ───────────────────────────────────────────────────────────────
// The same comparison rotated 90° about the vertical axis: we now look at the
// wheel face, so each setup is a set of concentric circles (tyre outer = OD,
// inner = rim). Camber foreshortens the circle vertically into an ellipse.

// Best rotation (radians) for the rear spoke set so the two overlaid wheels show
// their spokes as evenly spread as possible — i.e. maximise the smallest gap
// between any two spokes in the combined set. For equal counts this is exactly
// half a pitch (e.g. 30° for two 6-spoke wheels); for mismatched counts (5 vs 6)
// it settles on the best compromise.
function bestSpokeOffset(rearCount, frontCount) {
    const front = [];
    for (let j = 0; j < frontCount; j++) {
        front.push((j * 2 * Math.PI) / frontCount);
    }
    const period = (2 * Math.PI) / rearCount; // rear set repeats every pitch
    const steps = 360;
    let best = 0;
    let bestGap = -1;
    for (let s = 0; s < steps; s++) {
        const rot = (s / steps) * period;
        const all = front.slice();
        for (let i = 0; i < rearCount; i++) {
            all.push((rot + (i * 2 * Math.PI) / rearCount) % (2 * Math.PI));
        }
        all.sort((a, b) => a - b);
        let minGap = 2 * Math.PI - (all[all.length - 1] - all[0]); // wrap gap
        for (let k = 1; k < all.length; k++) {
            minGap = Math.min(minGap, all[k] - all[k - 1]);
        }
        if (minGap > bestGap) {
            bestGap = minGap;
            best = rot;
        }
    }
    return best;
}

// A clean alloy face (Rays TE37 style): `count` equal-width spokes running from a
// central hub out to the rim lip, with curved ends that follow the rim and large
// open windows between them. `hubR` is the hub radius — sized by the caller to
// enclose the lug nuts so the spokes never overlap them.
function drawAlloySpokes(
    ctx,
    cx,
    cy,
    rRim,
    color,
    count,
    hubR,
    rot = 0,
    widthFrac = 0.13,
) {
    const rLip = rRim * 0.92; // inner edge of the rim barrel
    const rHub = hubR;
    const w = rRim * widthFrac; // constant spoke width (parallel sides)
    const dIn = Math.asin(Math.min(1, w / 2 / rHub)); // half-angle at the hub
    const dOut = Math.asin(Math.min(1, w / 2 / rLip)); // half-angle at the rim

    // Metallic shading — a radial gradient with an off-centre highlight so the
    // alloy reads as a lit, dished surface, clearly distinct from the dark tyre.
    const metal = ctx.createRadialGradient(
        cx - rRim * 0.35,
        cy - rRim * 0.35,
        rRim * 0.05,
        cx,
        cy,
        rRim,
    );
    metal.addColorStop(0, `${color}c4`);
    metal.addColorStop(0.55, `${color}6a`);
    metal.addColorStop(1, `${color}3a`);

    // The hub, spokes and outer rim lip are one continuous casting, all filled
    // with the same gradient so they merge seamlessly (no pasted-on rectangles).

    // Outer rim lip band — between the spoke tips and the tyre bead.
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(cx, cy, rRim, 0, Math.PI * 2);
    ctx.arc(cx, cy, rLip, 0, Math.PI * 2, true);
    ctx.fill();

    // Equal-width spokes — two parallel edges joined by arcs that sit on the hub
    // and rim circles, so each end blends flush into the hub and the rim lip.
    for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + rot + (i * 2 * Math.PI) / count;
        ctx.beginPath();
        ctx.moveTo(
            cx + rHub * Math.cos(a + dIn),
            cy + rHub * Math.sin(a + dIn),
        );
        ctx.lineTo(
            cx + rLip * Math.cos(a + dOut),
            cy + rLip * Math.sin(a + dOut),
        );
        ctx.arc(cx, cy, rLip, a + dOut, a - dOut, true); // outer cap on the rim
        ctx.lineTo(
            cx + rHub * Math.cos(a - dIn),
            cy + rHub * Math.sin(a - dIn),
        );
        ctx.arc(cx, cy, rHub, a - dIn, a + dIn, false); // inner cap on the hub
        ctx.closePath();
        ctx.fill();
    }

    // Hub face — same metal; lug nuts and the centre bore render on top later.
    ctx.beginPath();
    ctx.arc(cx, cy, rHub, 0, Math.PI * 2);
    ctx.fill();

    // Definition strokes: only the spoke *sides* (the window edges), in the full
    // wheel colour so blue vs orange reads crisply. The hub and rim ends are left
    // unstroked so the spokes flow into them as one shape.
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + rot + (i * 2 * Math.PI) / count;
        ctx.beginPath();
        ctx.moveTo(
            cx + rHub * Math.cos(a + dIn),
            cy + rHub * Math.sin(a + dIn),
        );
        ctx.lineTo(
            cx + rLip * Math.cos(a + dOut),
            cy + rLip * Math.sin(a + dOut),
        );
        ctx.moveTo(
            cx + rHub * Math.cos(a - dIn),
            cy + rHub * Math.sin(a - dIn),
        );
        ctx.lineTo(
            cx + rLip * Math.cos(a - dOut),
            cy + rLip * Math.sin(a - dOut),
        );
        ctx.stroke();
    }
}

function drawFace(
    ctx,
    w,
    cx,
    cy,
    scale,
    color,
    camberDeg,
    spokeCount = 0,
    hubR = 0,
    rot = 0,
    alpha = 1,
    widthFrac = 0.13,
) {
    const rOD = (w.od / 2) * scale;
    const rRim = (w.rimDmm / 2) * scale;

    ctx.save();
    ctx.globalAlpha = alpha; // recede the current (rear) wheel, emphasise the new
    if (camberDeg) {
        ctx.translate(cx, cy);
        ctx.scale(1, Math.cos((camberDeg * Math.PI) / 180));
        ctx.translate(-cx, -cy);
    }

    // Tyre rubber fill — annulus between rim and outer diameter
    ctx.fillStyle = `${color}20`;
    ctx.beginPath();
    ctx.arc(cx, cy, rOD, 0, Math.PI * 2);
    ctx.arc(cx, cy, rRim, 0, Math.PI * 2, true);
    ctx.fill();

    // Tread — concentric grooves just inside the outer edge
    const treadD = Math.min(16, (rOD - rRim) * 0.22);
    const nGroove = 4;
    ctx.strokeStyle = `${color}2e`;
    ctx.lineWidth = Math.max(1, (treadD / nGroove) * 0.6);
    for (let i = 1; i < nGroove; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, rOD - (i * treadD) / nGroove, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Tyre outline
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rOD, 0, Math.PI * 2);
    ctx.stroke();

    // Rim face — a 6-spoke alloy. `rot` lets the rear wheel's spokes be offset by
    // half a pitch so they sit in the front wheel's window gaps (both stay visible).
    ctx.strokeStyle = `${color}55`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rRim, 0, Math.PI * 2);
    ctx.stroke();
    if (spokeCount > 0) {
        drawAlloySpokes(
            ctx,
            cx,
            cy,
            rRim,
            color,
            spokeCount,
            hubR,
            rot,
            widthFrac,
        );
    } else {
        ctx.fillStyle = `${color}14`;
        ctx.fill();
    }

    ctx.restore(); // undo camber foreshorten
}

// Writes text along a circular arc, like markings embossed on a tyre sidewall.
// `centerAngle` is where the text is centred (0 = top, PI/2 = right, PI = bottom,
// -PI/2 = left). Letters sit tangent with their tops facing outward; pass
// `flip = true` (used at the bottom) to turn them so the text still reads
// upright left-to-right.
function drawSidewallText(
    ctx,
    cx,
    cy,
    radius,
    text,
    color,
    font,
    centerAngle,
    flip = false,
) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const totalAngle = widths.reduce((a, b) => a + b, 0) / radius;
    const dir = flip ? -1 : 1; // flipped text sweeps the other way so it reads L→R

    let ang = centerAngle - (dir * totalAngle) / 2;
    for (let i = 0; i < chars.length; i++) {
        const charAngle = widths[i] / radius;
        ang += (dir * charAngle) / 2;
        ctx.save();
        ctx.translate(radius * Math.sin(ang), -radius * Math.cos(ang));
        ctx.rotate(flip ? ang + Math.PI : ang);
        ctx.fillText(chars[i], 0, 0);
        ctx.restore();
        ang += (dir * charAngle) / 2;
    }
    ctx.restore();
}

// Draws a single hexagonal bolt head (point-up) at (x, y). `r` is the
// circumradius (centre to corner).
function drawHexBolt(ctx, x, y, r, color) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 3;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `${color}40`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// Lays out a wheel's bolt heads on its PCD circle, to scale. `bolt` is a parsed
// { count, pcd }. Each lug is a 19 mm hex (across the flats).
function drawBoltPattern(ctx, cx, cy, bolt, scale, color) {
    if (!bolt) return;
    const pcdR = (bolt.pcd / 2) * scale;
    const boltR = Math.max(2.5, (19 / Math.sqrt(3)) * scale); // 19 mm across flats
    for (let i = 0; i < bolt.count; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / bolt.count;
        drawHexBolt(
            ctx,
            cx + pcdR * Math.cos(a),
            cy + pcdR * Math.sin(a),
            boltR,
            color,
        );
    }
}

function drawFaceDiagram(
    o,
    n,
    oCam,
    nCam,
    oBore = 0,
    nBore = 0,
    oBolt = "",
    nBolt = "",
    oSpokes = 6,
    nSpokes = 6,
    oSpokeW = 0.13,
    nSpokeW = 0.13,
    spin = 0,
) {
    const canvas = document.getElementById("cv2");
    if (!canvas) return;
    const W = canvas.width,
        H = canvas.height;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    const sidePad = 90;
    const topPad = 46;
    const botPad = 46;
    const availW = W - 2 * sidePad;
    const availH = H - topPad - botPad;

    const maxOD = Math.max(o.od, n.od);
    const scale = Math.min(availW / maxOD, availH / maxOD);
    const cx = W / 2;
    const cy = topPad + availH / 2;

    // Both wheels render as the 6-spoke alloy. Each hub is sized to enclose its
    // own lug nuts (bolt PCD + lug radius) so the spokes start outboard of them,
    // with a sensible floor and ceiling relative to that wheel's rim.
    const lugR = (19 / Math.sqrt(3)) * scale;
    const hubFor = (w, bolt) => {
        const rRimPx = (w.rimDmm / 2) * scale;
        const pat = parseBolt(bolt);
        const pcdRpx = pat ? (pat.pcd / 2) * scale : 0;
        return Math.min(
            rRimPx * 0.58,
            Math.max(rRimPx * 0.3, pcdRpx + lugR * 1.5 + 4),
        );
    };

    // Concentric wheel faces. The current wheel sits behind; its spokes are
    // rotated by the offset that best interleaves them with the new wheel's
    // spokes (half a pitch for matching counts) so both stay visible.
    const rearRot = bestSpokeOffset(oSpokes, nSpokes);

    // Everything from here until the matching restore() spins as one group when
    // the user flicks the wheel — the wheels, sidewall text, bores and bolts. The
    // diameter callouts and legend are drawn afterwards so they stay put.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.translate(-cx, -cy);

    drawFace(
        ctx,
        o,
        cx,
        cy,
        scale,
        "#58a6ff",
        oCam,
        oSpokes,
        hubFor(o, oBolt),
        rearRot,
        0.5, // current sits behind — clearly ghosted as the "before"
        oSpokeW,
    );
    drawFace(
        ctx,
        n,
        cx,
        cy,
        scale,
        "#f78166",
        nCam,
        nSpokes,
        hubFor(n, nBolt),
        0,
        1,
        nSpokeW,
    );

    // Tyre markings along each sidewall. The size code is in the wheel's colour
    // (new across the top, current across the bottom); the brand sits on the new
    // tyre's left & right sidewalls in grey so it reads as moulded lettering
    // rather than a measurement. Opposite arcs keep everything from overlapping.
    const midRadius = (w) => ((w.od / 2 + w.rimDmm / 2) / 2) * scale;
    const sidewallPx = (w) => ((w.od - w.rimDmm) / 2) * scale;

    const oMid = midRadius(o);
    const nMid = midRadius(n);
    const oFont = Math.max(13, Math.min(26, sidewallPx(o) * 0.55));
    const nFont = Math.max(13, Math.min(26, sidewallPx(n) * 0.55));

    const oSize = formatTyreSize(o.tw, o.pr, o.rimIn);
    const nSize = formatTyreSize(n.tw, n.pr, n.rimIn);

    drawSidewallText(
        ctx,
        cx,
        cy,
        nMid,
        nSize,
        "#f78166dd",
        `bold ${nFont}px monospace`,
        0,
    ); // new — top
    drawSidewallText(
        ctx,
        cx,
        cy,
        oMid,
        oSize,
        "#58a6ffdd",
        `bold ${oFont}px monospace`,
        Math.PI,
        true,
    ); // current — bottom

    // Brand down the new tyre's left & right sidewalls (italic, grey, racy)
    if (BRAND) {
        const brandPx = Math.max(11, Math.min(22, sidewallPx(n) * 0.45));
        const brandFont = `italic bold ${brandPx}px sans-serif`;
        drawSidewallText(
            ctx,
            cx,
            cy,
            nMid,
            BRAND,
            "#8b949ecc",
            brandFont,
            Math.PI / 2,
        ); // right
        drawSidewallText(
            ctx,
            cx,
            cy,
            nMid,
            BRAND,
            "#8b949ecc",
            brandFont,
            -Math.PI / 2,
        ); // left
    }

    // Hub centre. When centre-bore sizes are given we draw the actual bores to
    // scale (one ring per setup, in its colour) so their relative size — and any
    // mismatch — is visible; the smaller bore is punched through as the hole.
    // Otherwise fall back to a small stylised stub.
    if (oBore > 0 || nBore > 0) {
        const bores = [oBore, nBore].filter((b) => b > 0);
        const holeR = (Math.min(...bores) / 2) * scale;
        ctx.fillStyle = "#0d1117"; // empty hole = canvas background
        ctx.strokeStyle = "#4a6080";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 2;
        if (oBore > 0) {
            ctx.strokeStyle = "#58a6ffcc";
            ctx.beginPath();
            ctx.arc(cx, cy, (oBore / 2) * scale, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (nBore > 0) {
            ctx.strokeStyle = "#f78166cc";
            ctx.beginPath();
            ctx.arc(cx, cy, (nBore / 2) * scale, 0, Math.PI * 2);
            ctx.stroke();
        }
    } else {
        const hubR = Math.max(
            8,
            (Math.min(o.rimDmm, n.rimDmm) / 2) * scale * 0.16,
        );
        ctx.fillStyle = "#253044";
        ctx.strokeStyle = "#4a6080";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // Bolt heads on each setup's PCD circle, to scale (current blue, new orange).
    drawBoltPattern(ctx, cx, cy, parseBolt(oBolt), scale, "#58a6ff");
    drawBoltPattern(ctx, cx, cy, parseBolt(nBolt), scale, "#f78166");

    ctx.restore(); // end spin group — callouts/legend below stay fixed

    // Diameter callouts — current left, new right
    const oR = (o.od / 2) * scale;
    const nR = (n.od / 2) * scale;
    const oRv = oR * Math.cos((oCam * Math.PI) / 180);
    const nRv = nR * Math.cos((nCam * Math.PI) / 180);
    const maxR = Math.max(oR, nR);

    drawDiameterTick(ctx, cx, cy, oRv, maxR, "#58a6ff", -1, o.od);
    drawDiameterTick(ctx, cx, cy, nRv, maxR, "#f78166", +1, n.od);

    // Legend
    const L = window.L;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#58a6ff";
    ctx.fillText(`■ ${L.canvasCurrent}`, W / 2 - 60, 28);
    ctx.fillStyle = "#f78166";
    ctx.fillText(`■ ${L.canvasNew}`, W / 2 + 48, 28);
}

// Vertical Ø arrow + dashed leaders at the side of a face-view circle.
// `side` = -1 (left/current) or +1 (right/new).
function drawDiameterTick(ctx, cx, cy, rv, maxR, color, side, odMm) {
    const ax = cx + side * (maxR + 26);

    // Dashed leaders from the circle's vertical extremes (cx, cy ± rv) to the arrow
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = `${color}33`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - rv);
    ctx.lineTo(ax - side * 4, cy - rv);
    ctx.moveTo(cx, cy + rv);
    ctx.lineTo(ax - side * 4, cy + rv);
    ctx.stroke();
    ctx.restore();

    arrow(ctx, ax, cy + rv, ax, cy - rv, `${color}aa`);
    ctx.fillStyle = color;
    ctx.font = "bold 16px monospace";
    ctx.textAlign = side < 0 ? "right" : "left";
    ctx.fillText(`Ø${odMm.toFixed(0)} mm`, ax + side * 6, cy + 6);
}

// ── Spinnable face wheel ───────────────────────────────────────────────────────
// The face diagram can be grabbed and flung like an iPod click wheel. We keep the
// last render args so the animation loop can redraw the wheel at any angle without
// re-running the whole calculation; only the wheel group spins (see drawFaceDiagram).

let faceArgs = null; // last args for drawFaceDiagram (sans spin angle)
let spinAngle = 0; // current wheel rotation (radians)
let spinVel = 0; // angular velocity carried after a flick (radians/frame)
let spinRAF = 0; // active requestAnimationFrame id, 0 when idle

function renderFace() {
    if (faceArgs) drawFaceDiagram(...faceArgs, spinAngle);
}

const SPIN_FRICTION = 0.97; // free-spin momentum decay per frame
const SPIN_ENGAGE = 0.13; // below this speed the "weight" starts pulling upright
const SPIN_SPRING = 0.05; // restoring pull toward the nearest upright orientation
const SPIN_SETTLE_DAMP = 0.8; // heavier damping while settling, so it eases in

// Momentum decay with a weighted finish: it free-spins under friction, then as it
// slows a restoring spring rolls it to a stop the right way up — the nearest
// orientation where the labels read normally (a whole number of turns).
function spinDecay() {
    const target = Math.round(spinAngle / (2 * Math.PI)) * (2 * Math.PI);
    const settling = Math.abs(spinVel) < SPIN_ENGAGE;
    if (settling) spinVel += (target - spinAngle) * SPIN_SPRING;
    spinVel *= settling ? SPIN_SETTLE_DAMP : SPIN_FRICTION;
    spinAngle += spinVel;
    renderFace();

    if (Math.abs(spinVel) > 0.001 || Math.abs(spinAngle - target) > 0.003) {
        spinRAF = requestAnimationFrame(spinDecay);
    } else {
        spinAngle = target; // snap exactly upright and stop
        spinVel = 0;
        renderFace();
        spinRAF = 0;
    }
}

function initFaceSpin() {
    const canvas = document.getElementById("cv2");
    if (!canvas) return;

    let dragging = false;
    let lastAngle = 0;
    let lastTime = 0;

    // Pointer angle around the wheel centre (which is also the canvas centre).
    const pointerAngle = (e) => {
        const r = canvas.getBoundingClientRect();
        return Math.atan2(
            e.clientY - (r.top + r.height / 2),
            e.clientX - (r.left + r.width / 2),
        );
    };

    canvas.addEventListener("pointerdown", (e) => {
        dragging = true;
        spinVel = 0;
        if (spinRAF) {
            cancelAnimationFrame(spinRAF);
            spinRAF = 0;
        }
        lastAngle = pointerAngle(e);
        lastTime = e.timeStamp;
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add("grabbing");
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const a = pointerAngle(e);
        let delta = a - lastAngle;
        if (delta > Math.PI)
            delta -= 2 * Math.PI; // take the shortest way round
        else if (delta < -Math.PI) delta += 2 * Math.PI;
        spinAngle += delta;
        const dt = e.timeStamp - lastTime;
        if (dt > 0) spinVel = (delta * 16) / dt; // ≈ radians per 16 ms frame
        lastAngle = a;
        lastTime = e.timeStamp;
        renderFace();
    });

    const release = (e) => {
        if (!dragging) return;
        dragging = false;
        canvas.classList.remove("grabbing");
        // A paused finger before lift shouldn't throw the wheel.
        if (e.timeStamp - lastTime > 80) spinVel = 0;
        spinVel = Math.max(-0.6, Math.min(0.6, spinVel)); // clamp wild flicks
        // Always run the decay if there's momentum, or if the wheel was let go
        // off-upright — so it still rolls to rest the right way up.
        const target = Math.round(spinAngle / (2 * Math.PI)) * (2 * Math.PI);
        const needsSettle =
            Math.abs(spinVel) > 0.0006 || Math.abs(spinAngle - target) > 0.003;
        if (needsSettle && !spinRAF) {
            spinRAF = requestAnimationFrame(spinDecay);
        }
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
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
    "o-cb": "ocb",
    "o-bp": "obp",
    "o-spokes": "osc",
    "o-spokew": "osw",
    "n-d": "nd",
    "n-w": "nw",
    "n-et": "net",
    "n-tw": "ntw",
    "n-pr": "npr",
    "n-sp": "nsp",
    "n-cam": "ncam",
    "n-cb": "ncb",
    "n-bp": "nbp",
    "n-spokes": "nsc",
    "n-spokew": "nsw",
};

// The genuinely optional inputs (centre bore, bolt pattern). Only these are
// dropped from the share URL when blank — required fields are always encoded,
// so deliberately clearing one round-trips faithfully instead of silently
// reverting to its HTML default on reopen.
const OPTIONAL_PARAMS = new Set(["o-cb", "n-cb", "o-bp", "n-bp"]);

// Cosmetic-only fields dropped from the share URL while at their default, to keep
// the link short. Absent → loadFromParams leaves the HTML default, so unchanged.
const DEFAULT_SKIP = {
    "o-spokes": "6",
    "o-spokew": "13",
    "n-spokes": "6",
    "n-spokew": "13",
};

function buildShareUrl() {
    const p = new URLSearchParams();
    for (const [id, key] of Object.entries(PARAMS)) {
        const { value } = document.getElementById(id);
        if (value === "" && OPTIONAL_PARAMS.has(id)) continue;
        if (DEFAULT_SKIP[id] === value) continue;
        p.set(key, value);
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
    const trigger = switcher?.querySelector(".lang-trigger");
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

// ── Tyre size quick-entry ───────────────────────────────────────────────────
// Each setup has a free-text size box (e.g. 225/45R17). Typing a valid size fills
// the diameter / width / profile fields and recalculates; editing those fields
// reflects back into the box so the two stay in sync.

function syncSizeFromFields(prefix) {
    const el = document.getElementById(`${prefix}-size`);
    if (!el) return;
    const rim = parseFloat(document.getElementById(`${prefix}-d`).value);
    const tw = parseFloat(document.getElementById(`${prefix}-tw`).value);
    const pr = parseFloat(document.getElementById(`${prefix}-pr`).value);

    if (!(tw > 0 && pr > 0 && rim > 0)) {
        el.value = "";
        el.removeAttribute("aria-invalid");
        return;
    }

    el.value = formatTyreSize(tw, pr, rim);
    // Flag the box when a field is out of range — the displayed value would
    // otherwise disagree with what calculate() clamps it to. Symmetric with the
    // parse path, which rejects out-of-range sizes.
    const inRange =
        withinInputRange(`${prefix}-tw`, tw) &&
        withinInputRange(`${prefix}-pr`, pr) &&
        withinInputRange(`${prefix}-d`, rim);
    if (inRange) {
        el.removeAttribute("aria-invalid");
    } else {
        el.setAttribute("aria-invalid", "true");
    }
}

function initSizeInputs() {
    for (const prefix of ["o", "n"]) {
        const sizeEl = document.getElementById(`${prefix}-size`);
        if (!sizeEl) continue;

        syncSizeFromFields(prefix);

        sizeEl.addEventListener("input", () => {
            const raw = sizeEl.value.trim();
            if (!raw) {
                sizeEl.removeAttribute("aria-invalid");
                return;
            }
            const parsed = parseTyreSize(raw);
            // Reject anything that doesn't parse OR falls outside the fields' ranges
            const valid =
                parsed &&
                withinInputRange(`${prefix}-tw`, parsed.tw) &&
                withinInputRange(`${prefix}-pr`, parsed.pr) &&
                withinInputRange(`${prefix}-d`, parsed.rim);
            if (!valid) {
                sizeEl.setAttribute("aria-invalid", "true");
                return;
            }
            sizeEl.removeAttribute("aria-invalid");
            document.getElementById(`${prefix}-d`).value = parsed.rim;
            document.getElementById(`${prefix}-tw`).value = parsed.tw;
            document.getElementById(`${prefix}-pr`).value = parsed.pr;
            calculate();
        });

        // Reflect manual edits of the individual fields back into the size box
        for (const f of ["d", "tw", "pr"]) {
            document
                .getElementById(`${prefix}-${f}`)
                .addEventListener("input", () => syncSizeFromFields(prefix));
        }
    }
}

window.onload = () => {
    loadFromParams();
    calculate();
    initLangSwitcher();
    initSizeInputs();
    initFaceSpin();
    // Live-update the face diagram as the spoke design is tweaked.
    for (const id of ["o-spokes", "o-spokew", "n-spokes", "n-spokew"]) {
        document.getElementById(id).addEventListener("input", calculate);
    }
};

// ── Service worker registration ───────────────────────────────────────────────

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
}
