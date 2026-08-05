import React from 'react';
import { Composition } from 'remotion';
import { MatchRecap } from './MatchRecap';
import { matchRecapSchema } from './schema';

// 1080x1920 (9:16 vertical) -- the shareable-clip standard for social feeds.
// 30fps, 150 frames = 5s: intro (tournament name/logo) -> team names +
// score reveal -> "Terminé" badge -> outro brand mark.
export function RemotionRoot() {
  return (
    <Composition
      id="MatchRecap"
      component={MatchRecap}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      schema={matchRecapSchema}
      defaultProps={{
        tournamentName: 'Tournoi Été 2026',
        venueName: 'Complexe Sportif Nord',
        theme: 'INK_SIGNAL',
        homeTeamName: 'FC Lumière',
        awayTeamName: 'AS Tonnerre',
        homeScore: 3,
        awayScore: 1,
      }}
    />
  );
}
