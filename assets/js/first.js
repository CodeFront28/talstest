// assets/js/main.js
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- DOM ----------
  const startVideo = $(".hero__start");
  const endVideo = $(".hero__end");
  const flagVideo = $(".flag");

  const stonesWrap = $(".stones");
  const stones = stonesWrap ? $$(".stones > div") : [];

  const preloader = $("#preloader");
  const preloaderBar = $("#preloaderBar");
  const preloaderText = $("#preloaderText");

  if (!startVideo || !endVideo || !preloader || !preloaderBar || !preloaderText)
    return;

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function waitForEvent(el, eventName, timeoutMs = 12000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(true);
      };
      const cleanup = () => {
        el.removeEventListener(eventName, finish);
        if (timer) clearTimeout(timer);
      };
      el.addEventListener(eventName, finish, { once: true });
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
    });
  }

  function waitForVideoFirstFrame(video, timeoutMs = 15000) {
    return new Promise(async (resolve) => {
      try {
        video.load?.();
      } catch (_) {}

      const ok = await waitForEvent(video, "loadeddata", timeoutMs);
      if (!ok) return resolve(false);

      if (typeof video.requestVideoFrameCallback === "function") {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve(true);
        }, 400);
        try {
          video.requestVideoFrameCallback(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(true);
          });
        } catch (_) {
          clearTimeout(timer);
          resolve(true);
        }
      } else {
        resolve(true);
      }
    });
  }

  function preloadImage(src, timeoutMs = 12000) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(ok);
      };

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
        if (timer) clearTimeout(timer);
      };

      img.onload = () => finish(true);
      img.onerror = () => finish(false);

      const timer = setTimeout(() => finish(false), timeoutMs);
      img.src = src;
    });
  }

  function setPreloadText(text) {
    preloaderText.textContent = text;
  }

  function setProgress(p) {
    const pct = clamp(Math.round(p * 100), 0, 100);
    preloaderBar.style.width = `${pct}%`;
  }

  async function fadeOutPreloader() {
    preloader.classList.add("is-hidden");
    preloader.setAttribute("aria-hidden", "true");
    await new Promise((r) => setTimeout(r, 420));
    preloader.remove();
    document.body.classList.remove("is-loading");
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function initStoneWobble() {
    if (!stones || !stones.length) return;

    stones.forEach((stone, i) => {
      // очень аккуратные значения, чтобы выглядело "дорого", а не тряска
      const x = rand(1.2, 3.2); // px
      const y = rand(0.8, 2.6); // px
      const rot = rand(0.6, 1.8); // deg
      const dur = rand(3.6, 6.2); // s
      const delay = rand(-dur, 0); // чтобы все не стартовали одновременно

      stone.style.setProperty("--wobble-x", `${x.toFixed(2)}px`);
      stone.style.setProperty("--wobble-y", `${y.toFixed(2)}px`);
      stone.style.setProperty("--wobble-rot", `${rot.toFixed(2)}deg`);
      stone.style.setProperty("--wobble-dur", `${dur.toFixed(2)}s`);
      stone.style.setProperty("--wobble-delay", `${delay.toFixed(2)}s`);
    });
  }

  // ---------- Stones colors (keep your glow logic) ----------
  function pickStoneColor(stone) {
    const path = stone.querySelector("svg path[fill]");
    const fill = path?.getAttribute("fill");
    if (fill && fill !== "none" && fill !== "transparent") return fill;

    const anyPath = stone.querySelector("svg path");
    if (anyPath) {
      const cs = getComputedStyle(anyPath);
      if (cs.fill && cs.fill !== "none" && cs.fill !== "transparent")
        return cs.fill;
    }
    return "#9cfff5";
  }

  if (stones.length) {
    stones.forEach((stone) => {
      stone.style.setProperty("--glow", pickStoneColor(stone));
    });
  }

  initStoneWobble();

  // ---------- Video initial state ----------
  function setVideoBaseState() {
    // we control playback manually
    try {
      startVideo.pause();
      startVideo.currentTime = 0;
    } catch (_) {}

    try {
      endVideo.pause();
      endVideo.currentTime = 0;
    } catch (_) {}

    // show start, hide end
    startVideo.style.opacity = "1";
    endVideo.style.opacity = "0";

    // iOS autoplay stability
    [startVideo, endVideo, flagVideo].forEach((v) => {
      if (!v) return;
      v.muted = true;
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
    });
  }

  // ---------- INTRO VISIBILITY ----------
  const introEls = $$("[data-intro-hide]");
  const stonesHideEl = $("[data-stones-hide]");

  function setInitialVisibility() {
    // Hide all intro elements (text/header/etc)
    introEls.forEach((el) => el.classList.remove("is-visible"));

    // Hide stones completely until swap moment
    if (stonesHideEl) stonesHideEl.classList.remove("is-visible");
    if (stonesWrap) stonesWrap.classList.remove("svg-on");

    // Make sure stones are reset (offscreen via CSS)
    if (stones.length) stones.forEach((s) => s.classList.remove("is-in"));
  }

  function showIntroText() {
    introEls.forEach((el) => el.classList.add("is-visible"));
  }

  // ---------- SCRAMBLE (preserves DOM structure, spans, br, wraps) ----------
  const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  function isScrambleableChar(ch) {
    // keep whitespace & punctuation stable to avoid layout jumps
    // scramble only letters/digits
    return /[A-Za-z0-9]/.test(ch);
  }

  function shouldSkipNode(node) {
    const p = node.parentElement;
    if (!p) return true;
    const tag = p.tagName;
    // Don't touch svg/text paths, videos, styles etc
    return (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "SVG" ||
      tag === "PATH" ||
      tag === "VIDEO" ||
      tag === "SOURCE"
    );
  }

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function createScrambleController(roots) {
    const segments = [];
    roots.forEach((root) => {
      collectTextNodes(root).forEach((node) => {
        segments.push({
          node,
          original: node.nodeValue,
        });
      });
    });

    // If nothing found — no-op controller
    if (!segments.length) {
      return {
        start() {
          return () => {};
        },
      };
    }

    return {
      start(durationMs) {
        const start = performance.now();
        let raf = 0;
        let stopped = false;

        const tick = (now) => {
          if (stopped) return;
          const t = clamp((now - start) / durationMs, 0, 1);

          // global reveal ratio
          segments.forEach((seg) => {
            const txt = seg.original;
            const len = txt.length;
            const reveal = Math.floor(len * t);

            let out = "";
            for (let i = 0; i < len; i++) {
              const ch = txt[i];
              if (i < reveal) out += ch;
              else
                out += isScrambleableChar(ch)
                  ? SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0]
                  : ch;
            }

            seg.node.nodeValue = out;
          });

          if (t < 1) raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);

        return () => {
          stopped = true;
          cancelAnimationFrame(raf);
          segments.forEach((seg) => {
            seg.node.nodeValue = seg.original;
          });
        };
      },
    };
  }

  const scrambleRoots = $$("[data-scramble]");
  const scramble = createScrambleController(scrambleRoots);

  // ---------- WARM UP END VIDEO FOR SEAMLESS SWAP ----------
  async function warmUpVideo(video) {
    try {
      video.setAttribute("preload", "auto");
      video.load();
      const ok = await waitForVideoFirstFrame(video, 15000);
      if (!ok) return;

      // tiny decode warm-up
      try {
        await video.play();
        await new Promise((r) => setTimeout(r, 40));
      } catch (_) {}
      try {
        video.pause();
        video.currentTime = 0;
      } catch (_) {}
    } catch (_) {}
  }

  // Start endVideo slightly before the end of startVideo (hidden),
  // so decoder is already “hot” when we flip opacity.
  function armNearEndPreplay(thresholdSec = 0.08) {
    let armed = false;

    const onTime = async () => {
      if (armed) return;
      const d = startVideo.duration;
      const ct = startVideo.currentTime;
      if (!isFinite(d) || d <= 0) return;
      if (d - ct <= thresholdSec) {
        armed = true;
        try {
          endVideo.currentTime = 0;
        } catch (_) {}
        try {
          await endVideo.play();
        } catch (_) {}
        // Keep it invisible; we only flip opacity on ended.
      }
    };

    startVideo.addEventListener("timeupdate", onTime);
    startVideo.addEventListener("ended", () => {
      startVideo.removeEventListener("timeupdate", onTime);
    });
  }

  // ---------- Stones animation (ALL AT ONCE) ----------
  function animateStonesInAll() {
    if (!stonesWrap || !stones.length) return;

    stonesWrap.classList.remove("svg-on");
    stones.forEach((s) => s.classList.remove("is-in"));

    // make stones container visible exactly at this moment
    if (stonesHideEl) stonesHideEl.classList.add("is-visible");

    // next frame: fly in all together
    requestAnimationFrame(() => {
      stones.forEach((s) => s.classList.add("is-in"));
    });

    // show svg a bit after stones settle (keep your glow logic)
    setTimeout(() => {
      stonesWrap.classList.add("svg-on");
    }, 520);
  }

  // ---------- Main flow (your new logic) ----------
  async function runNewFlow() {
    setVideoBaseState();
    setInitialVisibility();

    // Keep end video warmed in background
    warmUpVideo(endVideo);

    // Wait 500ms: THEN show text + start scramble + start first video (all simultaneously)
    await new Promise((r) => setTimeout(r, 500));

    showIntroText();

    // ensure duration for sync
    const ensureDuration = async () => {
      if (isFinite(startVideo.duration) && startVideo.duration > 0)
        return startVideo.duration;
      await waitForEvent(startVideo, "loadedmetadata", 12000);
      if (isFinite(startVideo.duration) && startVideo.duration > 0)
        return startVideo.duration;
      return 2.4;
    };

    const durationSec = await ensureDuration();
    const durationMs = Math.max(300, durationSec * 1000);

    // scramble runs exactly as long as first video
    const stopScramble = scramble.start(durationMs);

    // start first video NOW (same moment)
    try {
      await startVideo.play();
    } catch (_) {}

    // ❌ УБРАЛИ: armNearEndPreplay(0.08)
    // Он и создаёт скачок, потому что endVideo уходит вперёд на ~80ms

    // wait end
    await waitForEvent(startVideo, "ended", Math.max(1200, durationMs + 2500));

    // stop scramble
    stopScramble();

    // На всякий случай: без CSS-переходов
    startVideo.style.transition = "none";
    endVideo.style.transition = "none";

    // Гарантируем показ с кадра 0
    try {
      endVideo.pause();
      endVideo.currentTime = 0;
    } catch (_) {}

    // Стартуем endVideo и сразу показываем
    try {
      await endVideo.play();
    } catch (_) {}

    startVideo.style.opacity = "0";
    endVideo.style.opacity = "1";

    // stones fly in ALL together
    animateStonesInAll();
  }

  // ---------- Preloader flow (kept, but ends into runNewFlow) ----------
  async function startWithPreloader() {
    document.body.classList.add("is-loading");
    setProgress(0);
    setPreloadText("LOADING…");

    const bgSrc = "assets/img/bg1.webp";
    const moonImg = $(".moon");
    const moonSrc = moonImg?.getAttribute("src") || "assets/img/moon.webp";

    setPreloadText("ANALYZING HUMAN MARKET...");
    const imgTasks = [preloadImage(bgSrc, 12000), preloadImage(moonSrc, 12000)];

    setPreloadText("CALCULATING PROFITS...");

    startVideo.setAttribute("preload", "auto");
    endVideo.setAttribute("preload", "auto");
    if (flagVideo) flagVideo.setAttribute("preload", "auto");

    try {
      startVideo.load();
    } catch (_) {}
    try {
      endVideo.load();
    } catch (_) {}
    try {
      flagVideo?.load?.();
    } catch (_) {}

    const videoTasks = [
      waitForVideoFirstFrame(startVideo, 20000),
      waitForVideoFirstFrame(endVideo, 20000),
      flagVideo
        ? waitForVideoFirstFrame(flagVideo, 20000)
        : Promise.resolve(true),
    ];

    const allTasks = [...imgTasks, ...videoTasks];
    const total = allTasks.length;
    let done = 0;

    allTasks.forEach((p) => {
      Promise.resolve(p).then(() => {
        done += 1;
        setProgress(done / total);
      });
    });

    await Promise.allSettled(allTasks);

    setPreloadText("STARTING…");
    setProgress(1);
    await new Promise((r) => setTimeout(r, 180));

    await fadeOutPreloader();

    // new logic starts here
    runNewFlow();
  }

  // Start
  startWithPreloader();
})();
