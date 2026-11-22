// Canvas drawing of the promotional poster (EventPosterDialog) -- no Angular
// here, the dialog hands in the texts already worded and the images already
// loaded. Laid out on a 1080x1350 portrait (the 4:5 format social networks
// show uncropped) over its sport's match-night photo (public/poster-backgrounds):
// a burst of light behind the club logo, brush-stroke headings and worn
// lettering in yellow, the panels in the theme's primary color, the texts
// in its heading font.

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

export type PosterIcon = 'pin' | 'ball' | 'field' | 'rules';

export interface PosterInfo {
  icon: PosterIcon;
  title: string;
  detail: string;
}

export interface EventPosterContent {
  title: string;
  category: string;
  organizer: string;
  date: string;
  infosHeading: string;
  infos: PosterInfo[];
  price: string;
  endLabel: string;
  end: string;
  venue: string;
  city: string;
  qrLabel: string;
}

export interface EventPosterStyle {
  primary: string;
  /** The theme's signal color: bands, borders, icons, light. */
  accent: string;
  font: string;
  /** The sport's match-night photo. */
  background: HTMLImageElement | null;
  /**
   * An empty stadium (the default for a sport without its photo): shown
   * whole, edge to edge, no players to frame around the logo.
   */
  backgroundFullBleed?: boolean;
  logo: HTMLImageElement | null;
  qr: HTMLImageElement | null;
}

type Ctx = CanvasRenderingContext2D;

const W = POSTER_WIDTH;
const H = POSTER_HEIGHT;
const WHITE = '#ffffff';
const PRICE_RED = '#e0161e';
const SKEW = -0.14;
const LOGO_Y = 585;
// The photo at 0.78x (1024x1536 source): heads under the date, socks above
// "Informations générales".
const PHOTO_SCALE = 0.78;
const PHOTO_TOP = 62;

export function drawEventPoster(
  canvas: HTMLCanvasElement,
  content: EventPosterContent,
  style: EventPosterStyle,
): void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('no canvas');
  }
  const random = seeded(11);
  // Signal color for the highlights, the darkened primary for the panels.
  const accent = style.accent;
  const ink = shade(style.primary, -0.8);
  const plate = withAlpha(shade(style.primary, -0.8), 0.88);
  const font = (weight: number, size: number) => `${weight} ${size}px ${style.font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  drawBackground(ctx, style);
  drawBurst(ctx, accent, random);

  // Title: huge worn letters, "PLATEAU" white and the category in the accent.
  const title = content.title.trim().toUpperCase();
  const category = content.category.trim().toUpperCase();
  const gap = title && category ? ' ' : '';
  const titleSize = fit(ctx, `${title}${gap}${category}`, 1000, 160, (s) => font(900, s));
  stamp(ctx, W / 2, 125, 1080, 220, (layer) => {
    layer.font = font(900, titleSize);
    const titleWidth = layer.measureText(title + gap).width;
    const total = titleWidth + layer.measureText(category).width;
    layer.textAlign = 'left';
    layer.transform(1, 0, SKEW, 1, 0, 0);
    layer.fillStyle = WHITE;
    layer.fillText(title + gap, -total / 2, 0);
    layer.fillStyle = accent;
    layer.fillText(category, -total / 2 + titleWidth, 0);
  });

  // Organizer on a brush stroke.
  if (content.organizer.trim()) {
    const organizer = content.organizer.trim().toUpperCase();
    const size = fit(ctx, organizer, 720, 84, (s) => font(900, s));
    ctx.font = font(900, size);
    brush(
      ctx,
      W / 2,
      262,
      Math.min(ctx.measureText(organizer).width + 170, 1000),
      104,
      accent,
      random,
    );
    skewed(ctx, W / 2, 265, () => {
      ctx.fillStyle = ink;
      ctx.font = font(900, size);
      ctx.fillText(organizer, 0, 0);
    });
  }

  // Date on a dark plate, between two accent dashes.
  if (content.date.trim()) {
    const date = content.date.trim().toUpperCase();
    const size = fit(ctx, date, 660, 66, (s) => font(900, s));
    ctx.font = font(900, size);
    const width = ctx.measureText(date).width + 190;
    skewed(ctx, W / 2, 365, () => {
      ctx.fillStyle = plate;
      ctx.fillRect(-width / 2, -44, width, 88);
      ctx.fillStyle = accent;
      ctx.fillRect(-width / 2 + 28, -3, 44, 7);
      ctx.fillRect(width / 2 - 72, -3, 44, 7);
      ctx.fillStyle = WHITE;
      ctx.font = font(900, size);
      ctx.fillText(date, 0, 2);
    });
  }

  // Club logo, cut out of its white square when it has one.
  if (style.logo) {
    const cut = cutOut(style.logo);
    const box = 300;
    const scale = Math.min(box / cut.width, box / cut.height);
    const w = Math.round(cut.width * scale);
    const h = Math.round(cut.height * scale);
    const logo = enlarge(cut, w, h);
    withShadow(ctx, withAlpha(accent, 0.6), 36, () =>
      ctx.drawImage(logo, W / 2 - w / 2, LOGO_Y - h / 2, w, h),
    );
  }

  // "Informations générales" and its card.
  let y = 795;
  const infos = content.infos.filter((info) => info.title.trim() || info.detail.trim());
  if (infos.length > 0) {
    const heading = content.infosHeading.toUpperCase();
    ctx.font = font(900, 50);
    brush(ctx, W / 2, y, Math.min(ctx.measureText(heading).width + 150, 1000), 80, accent, random);
    skewed(ctx, W / 2, y + 3, () => {
      ctx.fillStyle = ink;
      ctx.font = font(900, 50);
      ctx.fillText(heading, 0, 0);
    });
    y += 46;
    const columns = infos.length === 1 ? 1 : 2;
    const rows = Math.ceil(infos.length / columns);
    const rowHeight = 96;
    const cardHeight = rows * rowHeight + 20;
    panel(ctx, 50, y, W - 100, cardHeight, plate, accent);
    const columnWidth = (W - 100) / columns;
    if (columns === 2) {
      ctx.fillStyle = withAlpha(WHITE, 0.45);
      ctx.fillRect(W / 2 - 1.5, y + 20, 3, cardHeight - 40);
    }
    // Column by column, like the reference: left column first, top to bottom.
    infos.forEach((info, index) => {
      const column = Math.floor(index / rows);
      const row = index % rows;
      const left = 50 + column * columnWidth;
      const middle = y + 10 + row * rowHeight + rowHeight / 2;
      if (row > 0) {
        ctx.fillStyle = withAlpha(WHITE, 0.4);
        ctx.fillRect(left + 150, middle - rowHeight / 2, columnWidth - 190, 2);
      }
      drawIcon(ctx, info.icon, left + 90, middle, 40, accent, ink, 'ring');
      const textLeft = left + 152;
      const textWidth = columnWidth - 152 - 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = WHITE;
      const titleText = info.title.toUpperCase();
      ctx.font = font(
        800,
        fit(ctx, titleText, textWidth, 34, (s) => font(800, s)),
      );
      ctx.fillText(titleText, textLeft, middle - 20);
      ctx.fillStyle = accent;
      const detail = info.detail.toUpperCase();
      ctx.font = font(
        900,
        fit(ctx, detail, textWidth, 38, (s) => font(900, s)),
      );
      ctx.fillText(detail, textLeft, middle + 22);
      ctx.textAlign = 'center';
    });
    y += cardHeight;
  }

  // Price on a red stroke, and the expected end.
  y += 74;
  const price = content.price.trim().toUpperCase();
  const end = content.end.trim().toUpperCase();
  const priceCenter = end ? 285 : W / 2;
  if (price) {
    const size = fit(ctx, price, end ? 300 : 420, 80, (s) => font(900, s));
    ctx.font = font(900, size);
    const width = ctx.measureText(price).width + 110;
    brush(ctx, priceCenter, y, width, 108, PRICE_RED, random);
    skewed(ctx, priceCenter, y + 3, () => {
      ctx.font = font(900, size);
      withShadow(ctx, 'rgba(0,0,0,0.5)', 8, () => {
        ctx.fillStyle = WHITE;
        ctx.fillText(price, 0, 0);
      });
    });
  }
  if (end) {
    const left = 600;
    skewed(ctx, left + 200, y, () => {
      ctx.fillStyle = plate;
      ctx.fillRect(-200, -54, 400, 108);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(-200, -54, 400, 108);
    });
    drawIcon(ctx, 'clock', left + 70, y, 36, accent, ink, 'ring');
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE;
    const label = content.endLabel.toUpperCase();
    ctx.font = font(
      800,
      fit(ctx, label, 250, 34, (s) => font(800, s)),
    );
    ctx.fillText(label, left + 245, y - 22);
    ctx.fillStyle = accent;
    ctx.font = font(
      900,
      fit(ctx, end, 250, 56, (s) => font(900, s)),
    );
    ctx.fillText(end, left + 245, y + 22);
  }

  // Venue at the bottom, a stadium (and the QR code) on its right.
  const venue = content.venue.trim().toUpperCase();
  const city = content.city.trim().toUpperCase();
  if (venue || city || style.qr) {
    const top = H - 162;
    const height = 136;
    panel(ctx, 40, top, W - 80, height, plate, accent);
    const qrSpace = style.qr ? 140 : 0;
    drawStadiumIcon(ctx, W - 60 - qrSpace - 240, top + 12, 240, height - 24, accent);
    drawIcon(ctx, 'pin', 110, top + height / 2, 42, accent, ink, 'bare');
    const textWidth = W - 80 - 120 - 270 - qrSpace;
    ctx.textAlign = 'left';
    ctx.fillStyle = WHITE;
    ctx.font = font(
      800,
      fit(ctx, venue, textWidth, 54, (s) => font(800, s)),
    );
    ctx.fillText(venue, 165, city ? top + 48 : top + height / 2);
    if (city) {
      ctx.fillStyle = accent;
      const spaced = city.split('').join(' ');
      ctx.font = font(
        700,
        fit(ctx, spaced, textWidth, 38, (s) => font(700, s)),
      );
      ctx.fillText(spaced, 165, top + 98);
    }
    ctx.textAlign = 'center';
    if (style.qr) {
      const size = 92;
      const x = W - 60 - size - 6;
      ctx.fillStyle = WHITE;
      roundRect(ctx, x - 8, top + 8, size + 16, size + 16, 8);
      ctx.fill();
      ctx.drawImage(style.qr, x, top + 16, size, size);
      ctx.fillStyle = accent;
      ctx.font = font(900, 17);
      ctx.fillText(content.qrLabel.toUpperCase(), x + size / 2, top + height - 10);
    }
  }
}

// --------------------------------------------------------------- background

// The photo, its players framing the logo; darker at the top and bottom
// for the texts laid there.
function drawBackground(ctx: Ctx, style: EventPosterStyle): void {
  ctx.fillStyle = shade(style.primary, -0.85);
  ctx.fillRect(0, 0, W, H);
  const img = style.background ? recolored(style.background, style.primary, style.accent) : null;
  if (img && style.backgroundFullBleed) {
    const fill = Math.max(W / img.width, H / img.height);
    ctx.drawImage(
      img,
      (W - img.width * fill) / 2,
      (H - img.height * fill) / 2,
      img.width * fill,
      img.height * fill,
    );
  } else if (img) {
    // Backdrop: the photo filling the poster, slightly dimmed...
    const fill = Math.max(W / img.width, H / img.height);
    ctx.save();
    ctx.filter = 'brightness(0.92)';
    ctx.drawImage(img, (W - img.width * fill) / 2, 0, img.width * fill, img.height * fill);
    ctx.restore();
    // Its oversized players would peek out on both sides: shade them, the
    // stands above stay in view.
    const side = (W - Math.round(img.width * PHOTO_SCALE)) / 2 + 40;
    const shadow = ctx.createLinearGradient(0, 470, 0, 900);
    shadow.addColorStop(0, 'rgba(0,0,0,0)');
    shadow.addColorStop(0.3, 'rgba(0,0,0,0.82)');
    shadow.addColorStop(0.75, 'rgba(0,0,0,0.82)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 470, side, 430);
    ctx.fillRect(W - side, 470, side, 430);
    // ...under the photo itself, zoomed out so the players show down to
    // their socks, its edges fading into the backdrop.
    const w = Math.round(img.width * PHOTO_SCALE);
    const h = Math.round(img.height * PHOTO_SCALE);
    const photo = document.createElement('canvas');
    photo.width = w;
    photo.height = h;
    const p = photo.getContext('2d');
    if (p) {
      p.drawImage(img, 0, 0, w, h);
      p.globalCompositeOperation = 'destination-in';
      const sides = p.createLinearGradient(0, 0, w, 0);
      sides.addColorStop(0, 'rgba(0,0,0,0)');
      sides.addColorStop(0.07, 'rgba(0,0,0,1)');
      sides.addColorStop(0.93, 'rgba(0,0,0,1)');
      sides.addColorStop(1, 'rgba(0,0,0,0)');
      p.fillStyle = sides;
      p.fillRect(0, 0, w, h);
      const ends = p.createLinearGradient(0, 0, 0, h);
      ends.addColorStop(0, 'rgba(0,0,0,0)');
      ends.addColorStop(0.12, 'rgba(0,0,0,1)');
      ends.addColorStop(0.88, 'rgba(0,0,0,1)');
      ends.addColorStop(1, 'rgba(0,0,0,0)');
      p.fillStyle = ends;
      p.fillRect(0, 0, w, h);
      ctx.drawImage(photo, (W - w) / 2, PHOTO_TOP);
    }
  }
  const top = ctx.createLinearGradient(0, 0, 0, 430);
  top.addColorStop(0, 'rgba(0,0,0,0.55)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 430);
  const bottom = ctx.createLinearGradient(0, 760, 0, H);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 760, W, H - 760);
}

// Sun-burst of rays and a cloud of golden sparks behind the logo.
function drawBurst(ctx: Ctx, accent: string, random: () => number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rays = 40;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + random() * 0.05;
    // Short sideways, so the rays stay between the two players.
    const length = (200 + random() * 140) * (0.75 + 0.35 * Math.abs(Math.sin(angle)));
    const spread = 0.012 + random() * 0.03;
    const gradient = ctx.createRadialGradient(W / 2, LOGO_Y, 40, W / 2, LOGO_Y, length);
    gradient.addColorStop(0, withAlpha(accent, 0.22));
    gradient.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(W / 2, LOGO_Y);
    ctx.lineTo(
      W / 2 + Math.cos(angle - spread) * length,
      LOGO_Y + Math.sin(angle - spread) * length,
    );
    ctx.lineTo(
      W / 2 + Math.cos(angle + spread) * length,
      LOGO_Y + Math.sin(angle + spread) * length,
    );
    ctx.closePath();
    ctx.fill();
  }
  const core = ctx.createRadialGradient(W / 2, LOGO_Y, 0, W / 2, LOGO_Y, 300);
  core.addColorStop(0, withAlpha(accent, 0.4));
  core.addColorStop(0.4, withAlpha(accent, 0.12));
  core.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, W, H);

  // Sparks: dense around the logo, a dust of them over the whole poster.
  for (let i = 0; i < 900; i++) {
    const near = i < 320;
    const angle = random() * Math.PI * 2;
    const distance = near ? Math.pow(random(), 0.7) * 420 : random() * 900;
    const x = near ? W / 2 + Math.cos(angle) * distance * 1.3 : random() * W;
    const y = near ? LOGO_Y + Math.sin(angle) * distance * 0.75 : 150 + random() * (H - 150);
    ctx.globalAlpha = 0.25 + random() * 0.75;
    ctx.fillStyle = random() < 0.25 ? '#ffffff' : accent;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + random() * (near ? 2.6 : 1.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --------------------------------------------------------------- pieces

// A painted stroke with frayed ends, behind a heading.
function brush(
  ctx: Ctx,
  cx: number,
  cy: number,
  width: number,
  height: number,
  color: string,
  random: () => number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(1, -0.02, SKEW, 1, 0, 0);
  withShadow(ctx, 'rgba(0,0,0,0.55)', 18, () => {
    ctx.fillStyle = color;
    ctx.fillRect(-width / 2 + 20, -height / 2, width - 40, height);
  });
  ctx.fillStyle = color;
  // Bristle streaks sticking out of both ends, uneven top and bottom edges.
  for (let i = 0; i < 26; i++) {
    const y = -height / 2 + (i / 25) * height;
    const thickness = 2 + random() * (height / 9);
    const left = 20 + random() * 70;
    const right = 20 + random() * 70;
    ctx.globalAlpha = 0.65 + random() * 0.35;
    ctx.fillRect(-width / 2 + 20 - left, y, left + 10, thickness);
    ctx.fillRect(width / 2 - 30, y, right + 10, thickness);
  }
  ctx.globalAlpha = 1;
  for (let x = -width / 2 + 20; x < width / 2 - 20; x += 14) {
    ctx.fillRect(x, -height / 2 - random() * 7, 14, 7);
    ctx.fillRect(x, height / 2 - 1, 14, random() * 7);
  }
  ctx.restore();
}

// Dark card with an accent outline.
function panel(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  accent: string,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, 24);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();
}

/** Text drawn on its own layer, then worn by specks rubbed out of it. */
function stamp(
  ctx: Ctx,
  cx: number,
  cy: number,
  width: number,
  height: number,
  draw: (layer: Ctx) => void,
): void {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const l = layer.getContext('2d');
  if (!l) {
    return;
  }
  l.textBaseline = 'middle';
  l.translate(width / 2, height / 2);
  draw(l);
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'destination-out';
  const random = seeded(5);
  for (let i = 0; i < 1600; i++) {
    l.globalAlpha = 0.4 + random() * 0.6;
    l.beginPath();
    const r = random() < 0.92 ? 0.6 + random() * 1.6 : 2 + random() * 3.5;
    l.arc(random() * width, random() * height, r, 0, Math.PI * 2);
    l.fill();
  }
  withShadow(ctx, 'rgba(0,0,0,0.75)', 22, () =>
    ctx.drawImage(layer, cx - width / 2, cy - height / 2),
  );
}

function drawIcon(
  ctx: Ctx,
  icon: PosterIcon | 'clock',
  cx: number,
  cy: number,
  r: number,
  accent: string,
  ink: string,
  mode: 'disc' | 'ring' | 'bare' = 'disc',
): void {
  ctx.save();
  if (mode === 'disc') {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(WHITE, 0.25);
    ctx.lineWidth = 3;
    ctx.stroke();
  } else if (mode === 'ring') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const color = mode === 'disc' ? ink : accent;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = (r / 40) * (mode === 'bare' ? 1.5 : 1);
  switch (icon) {
    case 'pin':
      ctx.beginPath();
      ctx.arc(cx, cy - 6 * s, 15 * s, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(cx, cy + 22 * s);
      ctx.closePath();
      ctx.lineWidth = 5 * s;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - 6 * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ball':
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.arc(cx, cy, 25 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#111111';
      ctx.stroke();
      ctx.fillStyle = '#111111';
      polygon(ctx, cx, cy, 8.5 * s, 5);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        polygon(ctx, cx + Math.cos(a) * 20 * s, cy + Math.sin(a) * 20 * s, 5.5 * s, 5);
      }
      break;
    case 'field': {
      const w = 46 * s;
      const h = 30 * s;
      ctx.lineWidth = 3.5;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      ctx.beginPath();
      ctx.moveTo(cx, cy - h / 2);
      ctx.lineTo(cx, cy + h / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 6.5 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(cx - w / 2, cy - 7 * s, 7 * s, 14 * s);
      ctx.strokeRect(cx + w / 2 - 7 * s, cy - 7 * s, 7 * s, 14 * s);
      break;
    }
    case 'rules': {
      const w = 30 * s;
      const h = 38 * s;
      ctx.lineWidth = 3.5;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(cx - w / 2 + 6 * s, cy - h / 2 + (8 + i * 7.5) * s, w - 12 * s, 3 * s);
      }
      break;
    }
    case 'clock':
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.55);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.4, cy + r * 0.25);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

// Bowl, tiers, green pitch and four light masts.
function drawStadiumIcon(ctx: Ctx, x: number, y: number, w: number, h: number, accent: string) {
  ctx.save();
  const cx = x + w / 2;
  const cy = y + h * 0.62;
  // Masts.
  for (const mx of [x + 14, x + w - 14]) {
    ctx.fillStyle = '#d9dde3';
    ctx.fillRect(mx - 2, y + 14, 4, h * 0.55);
    ctx.fillStyle = WHITE;
    ctx.fillRect(mx - 14, y + 4, 28, 14);
    ctx.fillStyle = '#9aa3ad';
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillRect(mx - 11 + i * 8, y + 6 + j * 6, 6, 4);
      }
    }
  }
  // Bowl.
  ctx.fillStyle = '#eef1f4';
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.4, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9aa3ad';
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.4 - i * 7, h * 0.36 - i * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Pitch.
  ctx.fillStyle = '#2f9e44';
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.27, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(WHITE, 0.85);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - w * 0.2, cy - h * 0.12, w * 0.4, h * 0.24);
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.12);
  ctx.lineTo(cx, cy + h * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.4, h * 0.36, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------- helpers

/**
 * The logo with the white backdrop around it made transparent (flood fill
 * from the edges, so white inside the crest stays). Unreadable pixels (a
 * cross-origin image) leave it as is.
 */
function cutOut(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c || !w || !h) {
    return img;
  }
  c.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = c.getImageData(0, 0, w, h);
  } catch {
    return img;
  }
  const px = data.data;
  const light = (i: number) =>
    px[i * 4 + 3] > 0 && Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > 228;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) {
    stack.push(x, (h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    stack.push(y * w, y * w + w - 1);
  }
  let cleared = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !light(i)) {
      continue;
    }
    seen[i] = 1;
    px[i * 4 + 3] = 0;
    cleared++;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  if (cleared === 0) {
    return img;
  }
  // Soften the cut: half-transparent near-white pixels touching it.
  for (let i = 0; i < w * h; i++) {
    if (seen[i]) continue;
    const x = i % w;
    const touches =
      (x > 0 && seen[i - 1]) || (x < w - 1 && seen[i + 1]) || seen[i - w] || seen[i + w];
    if (touches && Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > 180) {
      px[i * 4 + 3] = 110;
    }
  }
  c.putImageData(data, 0, 0);
  return canvas;
}

/**
 * Enlarges a small logo by successive doublings (smoother than one big
 * stretch), then sharpens it a little to make up for the softness.
 */
function enlarge(
  source: HTMLCanvasElement | HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement | HTMLImageElement {
  let current: HTMLCanvasElement | HTMLImageElement = source;
  let w = source.width;
  let h = source.height;
  while (w * 2 < width && h * 2 < height) {
    w *= 2;
    h *= 2;
    current = resample(current, w, h);
  }
  const result = resample(current, width, height);
  const c = result.getContext('2d');
  if (!c) {
    return source;
  }
  let data: ImageData;
  try {
    data = c.getImageData(0, 0, width, height);
  } catch {
    return result;
  }
  const src = new Uint8ClampedArray(data.data);
  const px = data.data;
  const amount = 0.55;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let k = 0; k < 3; k++) {
        const around =
          src[i - 4 + k] + src[i + 4 + k] + src[i - width * 4 + k] + src[i + width * 4 + k];
        px[i + k] = src[i + k] + amount * (4 * src[i + k] - around);
      }
    }
  }
  c.putImageData(data, 0, 0);
  return result;
}

function resample(
  source: HTMLCanvasElement | HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (c) {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(source, 0, 0, width, height);
  }
  return canvas;
}

function polygon(ctx: Ctx, cx: number, cy: number, r: number, n: number): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function skewed(ctx: Ctx, x: number, y: number, draw: () => void): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, SKEW, 1, 0, 0);
  draw();
  ctx.restore();
}

function withShadow(ctx: Ctx, color: string, blur: number, draw: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = blur / 5;
  draw();
  ctx.restore();
}

/** Largest size (down to 18px) at which `text` fits in `maxWidth`. */
function fit(
  ctx: Ctx,
  text: string,
  maxWidth: number,
  start: number,
  font: (size: number) => string,
): number {
  let size = start;
  while (size > 18) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxWidth) {
      break;
    }
    size -= 2;
  }
  return size;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fixed pattern, so the same texts always give the same poster.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

function parseColor(color: string): [number, number, number] {
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as [number, number, number];
  }
  const rgb = color.match(/\d+(\.\d+)?/g);
  return rgb && rgb.length >= 3 ? [+rgb[0], +rgb[1], +rgb[2]] : [128, 128, 128];
}

// Share of the photo's height above the pitch (stands, banners, players' kit).
const PITCH_TOP = 0.54;

// One recolored copy per theme: the dialog redraws on every keystroke.
const recolorCache = new Map<string, HTMLCanvasElement | HTMLImageElement>();

/**
 * The photo in the theme's colors, kit and flags only: their deep greens
 * (hue ~150) take the primary's hue, their yellows the signal's. The pitch
 * (yellow-green, hue ~80), skin (~25), crowd, floodlights and the golden
 * glow (very light, or down on the pitch) keep their own colors.
 */
function recolored(
  img: HTMLImageElement,
  primary: string,
  accent: string,
): HTMLCanvasElement | HTMLImageElement {
  const key = `${img.src}|${primary}|${accent}`;
  const cached = recolorCache.get(key);
  if (cached) {
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const c = canvas.getContext('2d');
  if (!c) {
    return img;
  }
  c.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = c.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return img;
  }
  const [primaryHue, primarySat] = toHsl(...parseColor(primary));
  const [accentHue, accentSat] = toHsl(...parseColor(accent));
  const px = data.data;
  // Where the pitch starts in the source photo: no yellow recoloring below.
  const pitchTop = canvas.height * PITCH_TOP;
  for (let i = 0; i < px.length; i += 4) {
    const [h, sat, l] = toHsl(px[i], px[i + 1], px[i + 2]);
    let hue: number;
    let satScale: number;
    if (h >= 125 && h <= 178 && sat >= 0.35) {
      hue = primaryHue;
      satScale = Math.min(1, primarySat * 1.6);
    } else if (
      h >= 44 &&
      h <= 64 &&
      sat >= 0.45 &&
      l >= 0.15 &&
      l <= 0.6 &&
      i / 4 / canvas.width < pitchTop
    ) {
      hue = accentHue;
      satScale = Math.min(1, accentSat * 1.2);
    } else {
      continue;
    }
    const [nr, ng, nb] = fromHsl(hue, sat * satScale, l);
    px[i] = nr;
    px[i + 1] = ng;
    px[i + 2] = nb;
  }
  c.putImageData(data, 0, 0);
  recolorCache.set(key, canvas);
  return canvas;
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) {
    return [0, 0, l];
  }
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Darkens (amount < 0) or lightens a color. */
function shade(color: string, amount: number): string {
  const [r, g, b] = parseColor(color).map((c) =>
    Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount),
  );
  return `rgb(${r},${g},${b})`;
}
