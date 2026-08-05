import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { MatchRecapProps } from './schema';
import { THEME_PALETTES } from './theme-palette';
import { Logo } from './Logo';

// Remotion renders standalone -- there's no live CSS overflow/ellipsis here
// (unlike ap-match-card's `text-overflow: ellipsis`), so truncate by hand.
const MAX_TEAM_NAME_LENGTH = 20;
function truncateTeamName(name: string): string {
  return name.length > MAX_TEAM_NAME_LENGTH
    ? `${name.slice(0, MAX_TEAM_NAME_LENGTH - 1)}…`
    : name;
}

function TeamRow({
  name,
  score,
  align,
  isWinner,
  fg,
  muted,
  headingFont,
  bodyFont,
  delay,
}: {
  name: string;
  score: number;
  align: 'flex-start' | 'flex-end';
  isWinner: boolean;
  fg: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const slideFrom = align === 'flex-start' ? -60 : 60;
  const translateX = interpolate(entrance, [0, 1], [slideFrom, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);

  // Score counts up to its final value over the first ~20 frames after entry
  // rather than appearing fully-formed -- a small "reveal" beat.
  const countProgress = interpolate(frame - delay - 10, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const displayedScore = Math.round(score * countProgress);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        opacity,
        transform: `translateX(${translateX}px)`,
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: bodyFont,
          fontWeight: isWinner ? 600 : 400,
          fontSize: 34,
          color: isWinner ? fg : muted,
          textAlign: align === 'flex-start' ? 'left' : 'right',
        }}
      >
        {truncateTeamName(name)}
      </span>
      <span
        style={{
          fontFamily: headingFont,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          fontSize: 120,
          lineHeight: 1,
          color: fg,
        }}
      >
        {displayedScore}
      </span>
    </div>
  );
}

export function MatchRecap({
  tournamentName,
  venueName,
  theme,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
}: MatchRecapProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const palette = THEME_PALETTES[theme];

  const introOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const introY = interpolate(frame, [0, 20], [-20, 0], { extrapolateRight: 'clamp' });

  const badgeAppear = spring({ frame: frame - 95, fps, config: { damping: 12, mass: 0.5 } });
  const badgeScale = interpolate(badgeAppear, [0, 1], [0.6, 1]);
  const badgeOpacity = interpolate(badgeAppear, [0, 1], [0, 1]);

  const outroStart = durationInFrames - 30;
  const outroOpacity = interpolate(frame, [outroStart, outroStart + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const homeIsWinner = homeScore > awayScore;
  const awayIsWinner = awayScore > homeScore;

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      <AbsoluteFill
        style={{
          padding: '96px 72px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
            opacity: introOpacity,
            transform: `translateY(${introY}px)`,
          }}
        >
          <Logo size={72} />
          <span
            style={{
              fontFamily: palette.bodyFont,
              fontWeight: 600,
              fontSize: 30,
              color: palette.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              textAlign: 'center',
            }}
          >
            {tournamentName}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 56,
            backgroundColor: palette.surface,
            borderRadius: 28,
            padding: '64px 56px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <TeamRow
              name={homeTeamName}
              score={homeScore}
              align="flex-start"
              isWinner={homeIsWinner}
              fg={palette.fg}
              muted={palette.muted}
              headingFont={palette.headingFont}
              bodyFont={palette.bodyFont}
              delay={20}
            />
            <span
              style={{
                fontFamily: palette.headingFont,
                fontSize: 48,
                color: palette.muted,
                alignSelf: 'center',
              }}
            >
              —
            </span>
            <TeamRow
              name={awayTeamName}
              score={awayScore}
              align="flex-end"
              isWinner={awayIsWinner}
              fg={palette.fg}
              muted={palette.muted}
              headingFont={palette.headingFont}
              bodyFont={palette.bodyFont}
              delay={35}
            />
          </div>

          <div
            style={{
              alignSelf: 'center',
              opacity: badgeOpacity,
              transform: `scale(${badgeScale})`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 24px',
              borderRadius: 999,
              border: `2px solid ${palette.win}`,
              color: palette.win,
              fontFamily: palette.bodyFont,
              fontWeight: 700,
              fontSize: 24,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: palette.win,
              }}
            />
            Terminé
          </div>
        </div>

        <span
          style={{
            fontFamily: palette.bodyFont,
            fontWeight: 400,
            fontSize: 24,
            color: palette.muted,
            textAlign: 'center',
            opacity: venueName ? introOpacity : 0,
          }}
        >
          {venueName ?? ''}
        </span>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          backgroundColor: palette.bg,
          opacity: outroOpacity,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Logo size={120} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
