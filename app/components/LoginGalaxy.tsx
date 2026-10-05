"use client";

import { useEffect, useRef } from "react";
import styles from "./loginGalaxy.module.css";

export function LoginGalaxy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const trail = trailRef.current;
    const ctx = canvas?.getContext("2d");
    const ink = trail?.getContext("2d");
    if (!canvas || !trail || !ctx || !ink) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    let width = 0, height = 0, frame = 0, last = 0, time = 0;
    let pointer: { x: number; y: number } | null = null;
    const sparks: { x: number; y: number; life: number; dx: number; dy: number }[] = [];
    const meteorSparks: { x: number; y: number; life: number; duration: number; dx: number; dy: number; size: number }[] = [];
    let nextMeteorAt = 5;
    let meteor: { started: number; duration: number; fromRight: boolean; y: number; bend: number; previousX: number; previousY: number } | null = null;
    const stars = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.25, phase: Math.random() * Math.PI * 2, speed: Math.random() * .6 + .25 }));
    function resize() {
      width = window.innerWidth; height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const layer of [canvas!, trail!]) { layer.width = width * dpr; layer.height = height * dpr; }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ink!.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(0);
    }
    function star(x: number, y: number, size: number, alpha: number, brush = ink!) {
      brush.fillStyle = `rgba(195,230,255,${alpha})`;
      brush.beginPath();
      brush.moveTo(x, y - size); brush.lineTo(x + size * .22, y - size * .22);
      brush.lineTo(x + size, y); brush.lineTo(x + size * .22, y + size * .22);
      brush.lineTo(x, y + size); brush.lineTo(x - size * .22, y + size * .22);
      brush.lineTo(x - size, y); brush.lineTo(x - size * .22, y - size * .22);
      brush.closePath(); brush.fill();
    }
    function drawMeteor(delta: number) {
      if (reduced.matches) return;
      if (time >= nextMeteorAt) {
        nextMeteorAt = time + 5;
        const fromRight = Math.random() > .5;
        const y = height * (.08 + Math.random() * .26);
        meteor = { started: time, duration: 1.6 + Math.random() * .6, fromRight, y, bend: (Math.random() - .5) * height * .22,
          previousX: fromRight ? width + 30 : -30, previousY: y };
      }
      let head: { x: number; y: number; progress: number } | null = null;
      if (meteor) {
        const progress = (time - meteor.started) / meteor.duration;
        if (progress > 1) meteor = null;
        else {
          const travel = progress * progress * .35 + progress * .65;
          const x = meteor.fromRight ? width + 30 - travel * (width + 60) : -30 + travel * (width + 60);
          const y = meteor.y + travel * height * .42 + Math.sin(progress * Math.PI) * meteor.bend;
          if (delta > 0) {
            const count = width < 700 ? 3 : 5;
            for (let i = 0; i < count && meteorSparks.length < 180; i++) {
              const fraction = (i + 1) / count;
              const duration = .45 + Math.random() * .65;
              meteorSparks.push({ x: meteor.previousX + (x - meteor.previousX) * fraction, y: meteor.previousY + (y - meteor.previousY) * fraction,
                life: duration, duration, dx: (meteor.fromRight ? 1 : -1) * (20 + Math.random() * 65), dy: (Math.random() - .5) * 85,
                size: 1 + Math.random() * 3 });
            }
          }
          meteor.previousX = x; meteor.previousY = y;
          head = { x, y, progress };
        }
      }
      ctx!.save();
      ctx!.globalCompositeOperation = "lighter";
      for (let i = meteorSparks.length - 1; i >= 0; i--) {
        const s = meteorSparks[i];
        s.life -= delta; s.x += s.dx * delta; s.y += s.dy * delta; s.dy += 22 * delta;
        if (s.life <= 0) { meteorSparks.splice(i, 1); continue; }
        const fade = s.life / s.duration;
        star(s.x, s.y, s.size * (.4 + fade * .6), fade * fade * .9, ctx!);
      }
      if (head) {
        const glow = ctx!.createRadialGradient(head.x, head.y, 0, head.x, head.y, 25);
        glow.addColorStop(0, "#e5f2ffbb"); glow.addColorStop(.25, "#a5bfff66"); glow.addColorStop(1, "#879fff00");
        ctx!.fillStyle = glow; ctx!.fillRect(head.x - 25, head.y - 25, 50, 50);
        ctx!.translate(head.x, head.y); ctx!.rotate(head.progress * Math.PI);
        star(0, 0, 9 + Math.sin(head.progress * 15) * 2, 1, ctx!);
      }
      ctx!.restore();
    }
    function draw(delta: number) {
      ctx!.clearRect(0, 0, width, height);
      const count = width < 700 ? 140 : stars.length;
      for (const s of stars.slice(0, count)) {
        const x = (s.x * width + time * (8 + s.speed * 19)) % width;
        const y = (s.y * height + time * (3 + s.speed * 6) + Math.sin(time * .3 + s.phase) * 7) % height;
        ctx!.fillStyle = `rgba(205,219,255,${.2 + (Math.sin(time * s.speed + s.phase) + 1) * .27})`;
        ctx!.beginPath(); ctx!.arc(x, y, s.r, 0, Math.PI * 2); ctx!.fill();
      }
      drawMeteor(delta);
      ink!.clearRect(0, 0, width, height);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.life -= delta * 1.4; s.x += s.dx * delta; s.y += s.dy * delta;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        star(s.x, s.y, 3 * s.life, s.life * .65);
      }
      if (pointer && fine.matches && !reduced.matches) {
        ink!.shadowColor = "#a5b4fc"; ink!.shadowBlur = 17;
        star(pointer.x, pointer.y, 11, 1);
        ink!.shadowBlur = 0;
      }
    }
    function animate(now: number) {
      if (now - last > 32) {
        const elapsed = last ? (now - last) / 1000 : 0;
        time += elapsed; last = now; draw(Math.min(elapsed, .1));
      }
      frame = requestAnimationFrame(animate);
    }
    function restart() {
      cancelAnimationFrame(frame); last = 0;
      if (!document.hidden && !reduced.matches) frame = requestAnimationFrame(animate);
      else { pointer = null; sparks.length = 0; meteor = null; meteorSparks.length = 0; nextMeteorAt = time + 5; draw(0); }
    }
    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse" || !fine.matches || reduced.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (sparks.length < 45) sparks.push({ ...pointer, life: 1, dx: (Math.random() - .5) * 24, dy: Math.random() * 20 + 8 });
    }
    function leave() { pointer = null; }
    resize(); restart();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", restart);
    reduced.addEventListener("change", restart);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart);
    };
  }, []);

  return <>
    <div className={styles.universe} aria-hidden="true"><div className={styles.nebula} /><div className={styles.orbit} /><div className={styles.orbitInner} /><canvas ref={canvasRef} className={styles.stars} /></div>
    <canvas ref={trailRef} className={styles.trail} aria-hidden="true" />
  </>;
}
