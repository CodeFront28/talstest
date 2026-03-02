(() => {
  const $ = (s, r = document) => r.querySelector(s);

  function rafReady(fn) {
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      requestAnimationFrame(fn);
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  rafReady(() => {
    if (!window.gsap || !window.Observer) return;

    gsap.registerPlugin(Observer);

    const scene = $(".scene__container");
    const home = $(".home");
    const screen1 = $(".narrative .screen");

    if (!scene || !home || !screen1) return;

    // фиксируем сцену в 100vh
    gsap.set(scene, { position: "fixed", inset: 0 });

    // 1) создаём портал и переносим .home внутрь (маска)
    const portal = document.createElement("div");
    portal.className = "home-portal";
    document.body.appendChild(portal);
    portal.appendChild(home);

    // рамка-оверлей (если используешь)
    const frame = document.createElement("div");
    frame.className = "screen-frame";
    document.body.appendChild(frame);

    const pad = 0; // можно поставить 8-16 если хочешь внутренний отступ внутри монитора

    function rectWithPad(el) {
      const r = el.getBoundingClientRect();
      return {
        left: r.left + pad,
        top: r.top + pad,
        width: r.width - pad * 2,
        height: r.height - pad * 2,
      };
    }

    function placeFrameToScreen() {
      const r = rectWithPad(screen1);
      frame.style.left = `${r.left}px`;
      frame.style.top = `${r.top}px`;
      frame.style.width = `${r.width}px`;
      frame.style.height = `${r.height}px`;
    }

    const tl = gsap.timeline({ paused: true });

    function rebuild() {
      placeFrameToScreen();

      // старт: портал = fullscreen
      gsap.set(portal, {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        borderRadius: 0,
      });
      gsap.set(home, { scale: 1 }); // translate(-50%,-50%) уже в CSS
      gsap.set(frame, { opacity: 0 });

      const target = rectWithPad(screen1);

      // cover: заполняем target без пустот
      const sx = target.width / window.innerWidth;
      const sy = target.height / window.innerHeight;
      const coverScale = Math.max(sx, sy);

      tl.clear()
        // анимируем КОНТЕЙНЕР (маску) в rect экрана
        .to(
          portal,
          {
            left: target.left,
            top: target.top,
            width: target.width,
            height: target.height,
            borderRadius: 18,
            ease: "none",
          },
          0,
        )
        // анимируем масштаб полотна, чтобы оно заполнило портал (cover)
        .to(
          home,
          {
            scale: coverScale,
            ease: "none",
          },
          0,
        )
        // рамка проявляется ближе к концу
        .to(frame, { opacity: 1, ease: "none" }, 0.72);
    }

    rebuild();

    // виртуальный прогресс 0..1
    let p = 0;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const WHEEL_SPEED = 0.0012;
    const TOUCH_SPEED = 0.0022;

    const applyProgress = () => tl.progress(p);

    Observer.create({
      target: window,
      type: "wheel,touch,pointer",
      preventDefault: true,
      wheelSpeed: 1,
      onChange(self) {
        const d = self.deltaY;
        const isTouch =
          self.event && self.event.type && self.event.type.startsWith("touch");
        const k = isTouch ? TOUCH_SPEED : WHEEL_SPEED;
        p = clamp01(p + d * k);
        applyProgress();
      },
    });

    // ресайз: пересобираем геометрию, сохраняем прогресс
    let t = null;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const saved = p;
        rebuild();
        p = saved;
        applyProgress();
      }, 120);
    });

    // на случай прелоадера/шрифтов
    setTimeout(() => {
      const saved = p;
      rebuild();
      p = saved;
      applyProgress();
    }, 600);
  });
})();
