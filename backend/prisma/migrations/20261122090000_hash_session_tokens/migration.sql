-- Step 4: Participant.sessionToken → Participant.sessionTokenHash
-- Hand-written on purpose. Prisma's auto-generated version would DROP the old
-- column and ADD a new one (deleting data). RENAME keeps any existing rows.
ALTER TABLE "Participant" RENAME COLUMN "sessionToken" TO "sessionTokenHash";
ALTER INDEX "Participant_sessionToken_key" RENAME TO "Participant_sessionTokenHash_key";
