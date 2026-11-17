import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * App-branded loading indicator: the wallet app tile breathing inside a
 * glowing halo while a comet-tail arc sweeps around it. Inside the wallet a
 * receipt and a card bob in and out and the chart bars grow in turn.
 *
 * Pure CSS/SVG (no images), themed from `--accent`, and it calms down to a
 * gentle pulse under `prefers-reduced-motion`.
 *
 * Usage: <app-brand-loader></app-brand-loader>  or  [size]="72"
 */
@Component({
  selector: 'app-brand-loader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', '[attr.aria-label]': 'label', '[style.--bl-size.px]': 'size' },
  template: `
    <span class="bl-halo" aria-hidden="true"></span>
    <span class="bl-track" aria-hidden="true"></span>
    <span class="bl-orbit" aria-hidden="true">
      <span class="bl-arc"></span>
      <span class="bl-head">
        <i class="bl-spark bl-spark-1"></i>
        <i class="bl-spark bl-spark-2"></i>
        <i class="bl-spark bl-spark-3"></i>
      </span>
    </span>

    <span class="bl-tile" aria-hidden="true">
      <svg class="bl-wallet" viewBox="0 0 64 64">
        <defs>
          <!-- Soft leather: bright top-left falling off to a cool shade -->
          <linearGradient id="bl-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset=".55" stop-color="#e6edf9" />
            <stop offset="1" stop-color="#c3d0ea" />
          </linearGradient>
          <radialGradient id="bl-body-hi" cx=".25" cy=".2" r=".7">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".9" />
            <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
          </radialGradient>
          <!-- Back half of the bifold, peeking above the front half -->
          <linearGradient id="bl-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#dfe7f6" />
            <stop offset="1" stop-color="#a9badc" />
          </linearGradient>
          <!-- Shadow the front half casts onto the cards just above it -->
          <linearGradient id="bl-lip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0b2a78" stop-opacity="0" />
            <stop offset="1" stop-color="#0b2a78" stop-opacity=".3" />
          </linearGradient>
          <!-- Rounded fold (spine) on the left: shade · highlight · fade -->
          <linearGradient id="bl-fold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#0b2a78" stop-opacity=".22" />
            <stop offset=".35" stop-color="#ffffff" stop-opacity=".75" />
            <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="bl-strap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="1" stop-color="#c9d5ec" />
          </linearGradient>
          <radialGradient id="bl-snap" cx=".35" cy=".3" r=".75">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset=".45" stop-color="#c3cddf" />
            <stop offset="1" stop-color="#5f6f8f" />
          </radialGradient>
          <linearGradient id="bl-card" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffdd73" />
            <stop offset=".6" stop-color="#ffbe3b" />
            <stop offset="1" stop-color="#ef9a1a" />
          </linearGradient>
          <linearGradient id="bl-chip" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff3c4" />
            <stop offset="1" stop-color="#c99a2e" />
          </linearGradient>
          <linearGradient id="bl-paper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="1" stop-color="#e9eef8" />
          </linearGradient>
          <linearGradient id="bl-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#4d8bff" />
            <stop offset="1" stop-color="#1546d6" />
          </linearGradient>
          <clipPath id="bl-body-clip">
            <path d="M15 24 H49 Q54 24 54 29 V53 Q54 58 49 58 H15 Q8 58 8 51 V31 Q8 24 15 24 Z" />
          </clipPath>
        </defs>

        <!-- Back half of the folded wallet (cards sit between the halves) -->
        <rect x="10" y="19.5" width="44.5" height="36" rx="6" fill="url(#bl-back)" />
        <path d="M14 20.1 H50" stroke="#ffffff" stroke-opacity=".8" stroke-width=".7" stroke-linecap="round" />

        <!-- Card (with chip) and receipt peek out of the wallet's top edge -->
        <g class="bl-card">
          <g transform="rotate(12 40 18)">
            <rect x="30" y="5" width="20" height="26" rx="3" fill="url(#bl-card)" />
            <rect x="30" y="5" width="20" height="26" rx="3" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width=".6" />
            <rect x="34" y="9" width="6" height="4.6" rx="1" fill="url(#bl-chip)" />
            <path d="M34 11.3 h6 M37 9 v4.6" stroke="#a87a1c" stroke-width=".35" opacity=".7" />
            <path d="M34 17 h11 M34 19.5 h7" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round" />
          </g>
        </g>
        <g class="bl-receipt">
          <g transform="rotate(-8 25 20)">
            <!-- zig-zag torn top edge -->
            <path d="M15 10 l2.5 -2 l2.5 2 l2.5 -2 l2.5 2 l2.5 -2 l2.5 2 l2.5 -2 l2.5 2 V32 H15 Z" fill="url(#bl-paper)" />
            <g stroke="#9fb4d8" stroke-width="1.5" stroke-linecap="round">
              <line x1="18.5" y1="14" x2="31.5" y2="14" />
              <line x1="18.5" y1="18" x2="28" y2="18" />
              <line x1="18.5" y1="22" x2="30" y2="22" />
            </g>
          </g>
        </g>

        <!-- Front half's shadow on the cards -->
        <rect x="10" y="19.5" width="44.5" height="4.5" fill="url(#bl-lip)" />

        <!-- Front half: thickness underneath, leather shading, rounded fold on
             the left (no stitching there — it's a fold, not a seam), stitches
             running top → right → bottom only -->
        <path d="M15 25.8 H49 Q54 25.8 54 30.8 V54.8 Q54 59.8 49 59.8 H15 Q8 59.8 8 52.8 V32.8 Q8 25.8 15 25.8 Z" fill="#7d93bf" opacity=".55" />
        <path d="M15 24 H49 Q54 24 54 29 V53 Q54 58 49 58 H15 Q8 58 8 51 V31 Q8 24 15 24 Z" fill="url(#bl-body)" />
        <g clip-path="url(#bl-body-clip)">
          <rect x="8" y="24" width="46" height="34" fill="url(#bl-body-hi)" />
          <rect x="8" y="24" width="8.5" height="34" fill="url(#bl-fold)" />
          <rect x="8" y="55.5" width="46" height="2.5" fill="#0b2a78" opacity=".1" />
        </g>
        <path d="M15 24.45 H49 Q53.4 24.45 53.55 28.5" fill="none" stroke="#ffffff" stroke-opacity=".95" stroke-width=".8" stroke-linecap="round" />
        <path d="M14.5 27 H48.5 Q51.2 27 51.2 29.7 V52.3 Q51.2 55 48.5 55 H14.5" fill="none" stroke="#9fb1d4" stroke-width=".8" stroke-dasharray="1.8 1.4" stroke-linecap="round" />

        <!-- Growing chart bars (embossed) -->
        <g>
          <rect class="bl-bar bl-bar-1" x="17" y="43" width="5.5" height="9" rx="1.4" fill="url(#bl-bar)" />
          <rect class="bl-bar bl-bar-2" x="25.5" y="38" width="5.5" height="14" rx="1.4" fill="url(#bl-bar)" />
          <rect class="bl-bar bl-bar-3" x="34" y="32" width="5.5" height="20" rx="1.4" fill="url(#bl-bar)" />
        </g>

        <!-- Snap strap: comes round the right edge from the back half -->
        <path d="M57 35.6 H47 Q41.6 35.6 41.6 41.4 Q41.6 47.2 47 47.2 H57 Q58.7 47.2 58.7 45.5 V37.3 Q58.7 35.6 57 35.6 Z" fill="#0b2a78" opacity=".18" />
        <path d="M57 34 H47 Q41 34 41 40 Q41 46 47 46 H57 Q58.7 46 58.7 44.3 V35.7 Q58.7 34 57 34 Z" fill="url(#bl-strap)" />
        <path d="M58.7 35.7 Q58.7 34 57 34 H54.5 V46 H57 Q58.7 46 58.7 44.3 Z" fill="#0b2a78" opacity=".12" />
        <path d="M54.5 36 H47.2 Q43 36 43 40 Q43 44 47.2 44 H54.5" fill="none" stroke="#9fb1d4" stroke-width=".7" stroke-dasharray="1.5 1.2" stroke-linecap="round" />
        <circle cx="47.6" cy="40" r="3.1" fill="url(#bl-snap)" />
        <circle cx="47.6" cy="40" r="3.1" fill="none" stroke="#4d5d7c" stroke-opacity=".5" stroke-width=".4" />
        <circle cx="46.6" cy="38.9" r=".9" fill="#ffffff" opacity=".9" />
      </svg>
      <span class="bl-shine"></span>
    </span>
  `,
  styles: [`
    :host {
      --bl-accent: var(--accent, #1f6bff);
      position: relative;
      display: inline-block;
      width: var(--bl-size, 120px);
      height: var(--bl-size, 120px);
      flex-shrink: 0;
    }

    .bl-halo, .bl-track, .bl-orbit, .bl-tile { position: absolute; }

    /* Soft glow behind everything, breathing slowly */
    .bl-halo {
      inset: -6%;
      border-radius: 50%;
      background: radial-gradient(circle,
        color-mix(in srgb, var(--bl-accent) 22%, transparent) 0%,
        color-mix(in srgb, var(--bl-accent) 8%, transparent) 55%,
        transparent 72%);
      animation: bl-breathe 2.4s ease-in-out infinite;
    }

    /* Faint full ring the arc travels on */
    .bl-track {
      inset: 6%;
      border-radius: 50%;
      border: calc(var(--bl-size, 120px) * 0.035) solid color-mix(in srgb, var(--bl-accent) 12%, transparent);
    }

    /* Comet arc: conic gradient masked to a ring, fading into its tail */
    .bl-orbit {
      inset: 6%;
      animation: bl-spin 1.25s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
    }
    .bl-arc {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      --bl-w: calc(var(--bl-size, 120px) * 0.035);
      background: conic-gradient(from 0deg,
        transparent 0deg,
        color-mix(in srgb, var(--bl-accent) 15%, transparent) 40deg,
        color-mix(in srgb, var(--bl-accent) 75%, #7cc4ff) 115deg,
        var(--bl-accent) 125deg,
        transparent 126deg);
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--bl-w)), #000 calc(100% - var(--bl-w) + 0.5px));
              mask: radial-gradient(farthest-side, transparent calc(100% - var(--bl-w)), #000 calc(100% - var(--bl-w) + 0.5px));
      filter: drop-shadow(0 0 calc(var(--bl-size, 120px) * 0.03) color-mix(in srgb, var(--bl-accent) 60%, transparent));
    }

    /* Bright round head at the arc's leading end (125°), with sparks flying off */
    .bl-head {
      position: absolute;
      top: 0;
      left: 50%;
      width: 0;
      height: 50%;
      transform-origin: bottom center;
      transform: rotate(125deg);
    }
    .bl-head::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: calc(var(--bl-size, 120px) * 0.05);
      height: calc(var(--bl-size, 120px) * 0.05);
      border-radius: 50%;
      translate: -50% -15%;
      background: #fff;
      box-shadow: 0 0 calc(var(--bl-size, 120px) * 0.06) calc(var(--bl-size, 120px) * 0.015) var(--bl-accent);
    }
    .bl-spark {
      position: absolute;
      top: 0;
      left: 0;
      width: calc(var(--bl-size, 120px) * 0.022);
      height: calc(var(--bl-size, 120px) * 0.07);
      border-radius: 99px;
      background: var(--bl-accent);
      transform-origin: 50% 100%;
      opacity: 0;
      animation: bl-spark 1.25s ease-out infinite;
    }
    .bl-spark-1 { --bl-rot: -55deg; --bl-dx: -0.06; }
    .bl-spark-2 { --bl-rot: -20deg; --bl-dx: 0.0;  animation-delay: 0.08s; }
    .bl-spark-3 { --bl-rot: 20deg;  --bl-dx: 0.06; animation-delay: 0.16s; }

    /* The app tile */
    .bl-tile {
      inset: 23%;
      border-radius: 27%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(120% 90% at 30% 15%, #4f86ff 0%, transparent 55%),
        linear-gradient(160deg, #2a63f5 0%, #1546d6 55%, #0d2f9e 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        inset 0 -3px 8px rgba(5, 20, 80, 0.35),
        0 calc(var(--bl-size, 120px) * 0.06) calc(var(--bl-size, 120px) * 0.14) -0.02em rgba(21, 70, 214, 0.45);
      animation: bl-float 2.4s ease-in-out infinite;
    }
    .bl-wallet {
      width: 78%;
      height: 78%;
      overflow: visible;
      filter: drop-shadow(0 2px 2px rgba(4, 18, 70, 0.3));
    }
    /* Glass sheen sweeping across the tile */
    .bl-shine {
      position: absolute;
      inset: -50%;
      background: linear-gradient(115deg, transparent 42%, rgba(255, 255, 255, 0.28) 50%, transparent 58%);
      transform: translateX(-60%);
      animation: bl-shine 2.4s ease-in-out infinite;
      pointer-events: none;
    }

    .bl-card    { animation: bl-peek 2.4s ease-in-out infinite; }
    .bl-receipt { animation: bl-peek 2.4s ease-in-out infinite 0.3s; }
    .bl-bar {
      transform-box: fill-box;
      transform-origin: bottom;
      animation: bl-grow 1.6s cubic-bezier(0.3, 1.4, 0.5, 1) infinite;
    }
    .bl-bar-2 { animation-delay: 0.15s; }
    .bl-bar-3 { animation-delay: 0.3s; }

    @keyframes bl-spin { to { rotate: 360deg; } }
    @keyframes bl-breathe {
      0%, 100% { opacity: 0.75; scale: 0.96; }
      50%      { opacity: 1;    scale: 1.04; }
    }
    @keyframes bl-float {
      0%, 100% { translate: 0 0; }
      50%      { translate: 0 -4%; }
    }
    @keyframes bl-peek {
      0%, 100% { transform: translateY(3px); }
      50%      { transform: translateY(-2.5px); }
    }
    @keyframes bl-grow {
      0%        { transform: scaleY(0.25); }
      45%, 70%  { transform: scaleY(1); }
      100%      { transform: scaleY(0.25); }
    }
    @keyframes bl-shine {
      0%, 35%   { transform: translateX(-60%); }
      70%, 100% { transform: translateX(60%); }
    }
    @keyframes bl-spark {
      0%   { opacity: 0; transform: rotate(var(--bl-rot)) translateY(0) scaleY(0.4); }
      20%  { opacity: 1; }
      100% { opacity: 0; transform: rotate(var(--bl-rot)) translateY(calc(var(--bl-size, 120px) * -0.09)) scaleY(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .bl-orbit { animation-duration: 2.4s; animation-timing-function: linear; }
      .bl-spark, .bl-shine, .bl-card, .bl-receipt, .bl-tile { animation: none; }
      .bl-bar { animation: none; transform: none; }
    }
  `],
})
export class BrandLoaderComponent {
  /** Overall width/height in px (default 120). */
  @Input() size = 120;
  /** Accessible name announced by screen readers. */
  @Input() label = 'Loading';
}
