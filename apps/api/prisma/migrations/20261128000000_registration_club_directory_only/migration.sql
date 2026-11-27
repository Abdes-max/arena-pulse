-- Team sports: the organizer may accept only clubs picked from the club
-- directory (no free-typed team name). Off by default.
ALTER TABLE "Tournament" ADD COLUMN "registrationClubDirectoryOnly" BOOLEAN NOT NULL DEFAULT false;
