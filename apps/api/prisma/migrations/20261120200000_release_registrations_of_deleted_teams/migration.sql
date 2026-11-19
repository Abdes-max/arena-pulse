-- A confirmed request whose team the organizer deleted (teamId set to NULL)
-- no longer holds a place nor counts as "already registered": turned down,
-- as the API now does when a team is removed.
UPDATE "Registration"
SET "status" = 'REJECTED',
    "rejectionReason" = 'Équipe retirée par l''organisateur.',
    "decidedAt" = NOW()
WHERE "teamId" IS NULL AND "status" IN ('CONFIRMED', 'PAID');
